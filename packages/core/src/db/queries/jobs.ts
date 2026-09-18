import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { SourceKind, TriageStatus } from "../../domain/enums";
import { HYBRID_LOCAL_FLAG } from "../../filter/evaluate";
import { PROMPT_VERSION, scoringModel } from "../../scoring/config";
import { HIDING_CONTRACT_VERDICTS, HIDING_REMOTE_VERDICTS } from "../../scoring/schema";
import { getDb } from "../client";
import { applications, jobClusters, jobs, llmScores, sources } from "../schema";

const scoreJoin = () =>
  and(
    eq(llmScores.contentHash, jobs.contentHash),
    eq(llmScores.promptVersion, PROMPT_VERSION),
    eq(llmScores.model, scoringModel()),
  );

/**
 * Offres masquées par un verdict LLM éliminatoire. Un « hybride / sur site » reste visible
 * quand le filtre l'a localisé près de chez Robin (flag HYBRID_LOCAL_FLAG).
 */
const hiddenByVerdict = () =>
  or(
    and(
      inArray(llmScores.remoteVerdict, [...HIDING_REMOTE_VERDICTS]),
      or(
        sql`${llmScores.remoteVerdict} <> 'hybrid_or_onsite'`,
        sql`not (${HYBRID_LOCAL_FLAG} = any(${jobs.filterFlags}))`,
      ),
    ),
    inArray(llmScores.contractVerdict, [...HIDING_CONTRACT_VERDICTS]),
  );

/** Nombre d'offres de l'Inbox (même règle que listClusters sans filtre optionnel). */
export async function countInbox(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(jobClusters)
    .innerJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .leftJoin(llmScores, scoreJoin())
    .where(
      and(
        eq(jobClusters.triage, "new"),
        sql`${jobClusters.scoreStatus} <> 'not_needed'`,
        isNull(jobClusters.closedAt),
        sql`not coalesce((${hiddenByVerdict()}), false)`,
      ),
    );
  return row?.n ?? 0;
}

const sourceKindsOfCluster = sql<SourceKind[]>`(
  select coalesce(array_agg(distinct s2.kind::text), '{}') from ${jobs} j2
  join ${sources} s2 on s2.id = j2.source_id
  where j2.cluster_id = "job_clusters"."id"
)`;

export interface ClusterListFilters {
  triage: TriageStatus[];
  minScore?: number;
  sourceKind?: SourceKind;
  maxAgeDays?: number;
  includeHidden?: boolean;
  includeClosed?: boolean;
  limit?: number;
}

export async function listClusters(f: ClusterListFilters) {
  const conds: (SQL | undefined)[] = [
    inArray(jobClusters.triage, f.triage),
    sql`${jobClusters.scoreStatus} <> 'not_needed'`,
    f.includeClosed ? undefined : isNull(jobClusters.closedAt),
    f.minScore != null ? gte(jobClusters.bestScore, f.minScore) : undefined,
    f.maxAgeDays != null
      ? gte(jobClusters.firstSeenAt, sql`now() - make_interval(days => ${f.maxAgeDays})`)
      : undefined,
    f.sourceKind
      ? sql`exists (select 1 from ${jobs} j3 join ${sources} s3 on s3.id = j3.source_id where j3.cluster_id = "job_clusters"."id" and s3.kind = ${f.sourceKind})`
      : undefined,
    f.includeHidden ? undefined : sql`not coalesce((${hiddenByVerdict()}), false)`,
  ];
  return getDb()
    .select({
      clusterId: jobClusters.id,
      triage: jobClusters.triage,
      bestScore: jobClusters.bestScore,
      scoreStatus: jobClusters.scoreStatus,
      firstSeenAt: jobClusters.firstSeenAt,
      closedAt: jobClusters.closedAt,
      previousClusterId: jobClusters.previousClusterId,
      title: jobs.title,
      company: jobs.companyNameRaw,
      location: jobs.locationRaw,
      url: jobs.url,
      remotePolicy: jobs.remotePolicy,
      contractType: jobs.contractType,
      seniority: jobs.seniority,
      ruleScore: jobs.ruleScore,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      publishedAt: jobs.publishedAt,
      remoteVerdict: llmScores.remoteVerdict,
      contractVerdict: llmScores.contractVerdict,
      justification: llmScores.justification,
      sourceKinds: sourceKindsOfCluster,
    })
    .from(jobClusters)
    .innerJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .leftJoin(llmScores, scoreJoin())
    .where(and(...conds))
    .orderBy(
      sql`${jobClusters.bestScore} desc nulls last`,
      desc(jobs.ruleScore),
      desc(jobClusters.firstSeenAt),
    )
    .limit(f.limit ?? 300);
}
export type ClusterListItem = Awaited<ReturnType<typeof listClusters>>[number];

export async function getClusterDetail(clusterId: string) {
  const db = getDb();
  const [cluster] = await db.select().from(jobClusters).where(eq(jobClusters.id, clusterId));
  if (!cluster) return null;
  const members = await db
    .select({ job: jobs, sourceKind: sources.kind, sourceLabel: sources.label })
    .from(jobs)
    .innerJoin(sources, eq(sources.id, jobs.sourceId))
    .where(eq(jobs.clusterId, clusterId))
    .orderBy(asc(jobs.firstSeenAt));
  const canonical = members.find((m) => m.job.id === cluster.canonicalJobId) ?? members[0];
  const [score] = canonical
    ? await db
        .select()
        .from(llmScores)
        .where(
          and(
            eq(llmScores.contentHash, canonical.job.contentHash),
            eq(llmScores.promptVersion, PROMPT_VERSION),
            eq(llmScores.model, scoringModel()),
          ),
        )
    : [];
  const [application] = await db.select().from(applications).where(eq(applications.clusterId, clusterId));
  return { cluster, canonical, members, score: score ?? null, application: application ?? null };
}
export type ClusterDetail = NonNullable<Awaited<ReturnType<typeof getClusterDetail>>>;

/** Annonces rejetées récemment (filtre déterministe) et offres masquées par le LLM. */
export async function listRejected(days = 7) {
  const db = getDb();
  const since = sql`now() - make_interval(days => ${days})`;
  const filtered = await db
    .select({
      clusterId: jobs.clusterId,
      title: jobs.title,
      company: jobs.companyNameRaw,
      location: jobs.locationRaw,
      url: jobs.url,
      reasons: jobs.filterReasons,
      ruleScore: jobs.ruleScore,
      sourceKind: sources.kind,
      firstSeenAt: jobs.firstSeenAt,
    })
    .from(jobs)
    .innerJoin(sources, eq(sources.id, jobs.sourceId))
    .where(and(eq(jobs.filterStatus, "rejected"), gte(jobs.firstSeenAt, since), isNull(jobs.closedAt)))
    .orderBy(desc(jobs.ruleScore))
    .limit(1000);
  const byLlm = await db
    .select({
      clusterId: jobClusters.id,
      title: jobs.title,
      company: jobs.companyNameRaw,
      location: jobs.locationRaw,
      url: jobs.url,
      score: llmScores.score,
      remoteVerdict: llmScores.remoteVerdict,
      contractVerdict: llmScores.contractVerdict,
      justification: llmScores.justification,
    })
    .from(jobClusters)
    .innerJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .innerJoin(llmScores, scoreJoin())
    .where(and(hiddenByVerdict(), gte(jobClusters.firstSeenAt, since), eq(jobClusters.triage, "new")))
    .orderBy(desc(llmScores.score));
  return { filtered, byLlm };
}

/** Candidats à la fusion : clusters ouverts de la même entreprise (ou tous, à défaut). */
export async function listMergeCandidates(clusterId: string) {
  const db = getDb();
  const [c] = await db.select().from(jobClusters).where(eq(jobClusters.id, clusterId));
  if (!c) return [];
  return db
    .select({ clusterId: jobClusters.id, title: jobs.title, company: jobs.companyNameRaw })
    .from(jobClusters)
    .innerJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .where(
      and(
        notInArray(jobClusters.id, [clusterId]),
        isNull(jobClusters.closedAt),
        c.companyId
          ? eq(jobClusters.companyId, c.companyId)
          : sql`similarity(${jobClusters.titleNorm}, ${c.titleNorm}) > 0.4`,
      ),
    )
    .orderBy(sql`similarity(${jobClusters.titleNorm}, ${c.titleNorm}) desc`)
    .limit(20);
}

export async function listPipeline() {
  return getDb()
    .select({
      app: applications,
      title: sql<string | null>`coalesce(${jobs.title}, ${applications.externalTitle})`,
      company: sql<
        string | null
      >`coalesce(${jobs.companyNameRaw}, ${applications.externalCompany}, (select name from companies co where co.id = "applications"."company_id"))`,
      url: sql<string | null>`coalesce(${jobs.url}, ${applications.externalUrl})`,
      bestScore: jobClusters.bestScore,
    })
    .from(applications)
    .leftJoin(jobClusters, eq(jobClusters.id, applications.clusterId))
    .leftJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .orderBy(sql`${applications.nextActionAt} asc nulls last`, desc(applications.updatedAt));
}
export type PipelineRow = Awaited<ReturnType<typeof listPipeline>>[number];

export async function countDueFollowUps(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        lte(applications.nextActionAt, sql`current_date`),
        notInArray(applications.status, ["offer", "rejected", "withdrawn", "ghosted"]),
      ),
    );
  return row?.n ?? 0;
}
