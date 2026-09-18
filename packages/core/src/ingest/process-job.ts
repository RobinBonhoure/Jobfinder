import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { jobs } from "../db/schema";
import { assignCluster, findCompanyIdByNorm } from "../dedup/assign";
import { contentHash, dedupKey } from "../dedup/keys";
import { refreshCluster } from "../dedup/refresh";
import type { NormalizedJob } from "../domain/job";
import { evaluateJob } from "../filter/evaluate";
import { normalizeCompanyName, normalizeTitle } from "../normalize/text";
import type { FilterCriteria } from "../profile";

export interface ProcessContext {
  sourceId: string;
  /** Entreprise du registre (boards ATS). */
  sourceCompanyId: string | null;
  criteria: FilterCriteria;
  /** Filtre en mode conseil (capture manuelle). */
  advisory?: boolean;
}

export interface ExistingJob {
  id: string;
  contentHash: string;
  titleNorm: string;
  clusterId: string | null;
  companyNameRaw: string | null;
  forcedPass: boolean;
}

export interface Prepared {
  job: NormalizedJob;
  titleNorm: string;
  companyNorm: string;
  hash: string;
}

export function prepareJob(job: NormalizedJob, fallbackCompany: string | null): Prepared {
  const titleNorm = normalizeTitle(job.title);
  const companyNorm = normalizeCompanyName(job.companyName ?? fallbackCompany ?? "");
  return { job, titleNorm, companyNorm, hash: contentHash(titleNorm, companyNorm, job.descriptionText) };
}

/**
 * Upsert d'une annonce nouvelle ou modifiée : filtre, entreprise, cluster, état dérivé.
 * Renvoie l'id de l'annonce, celui du cluster et si elle a été créée.
 */
export async function processJob(
  tx: DbOrTx,
  ctx: ProcessContext,
  p: Prepared,
  existing: ExistingJob | undefined,
): Promise<{ jobId: string; clusterId: string; created: boolean }> {
  const { job } = p;
  const filter = evaluateJob(
    {
      title: job.title,
      descriptionText: job.descriptionText,
      companyName: job.companyName,
      locationRaw: job.locationRaw,
      remotePolicy: job.remotePolicy,
      remoteScope: job.remoteScope,
      contractType: job.contractType,
      seniority: job.seniority,
    },
    ctx.criteria,
    { advisory: ctx.advisory || existing?.forcedPass },
  );
  const companyId = ctx.sourceCompanyId ?? (await findCompanyIdByNorm(tx, p.companyNorm));
  const now = new Date();

  const values = {
    sourceId: ctx.sourceId,
    externalId: job.externalId,
    companyId,
    companyNameRaw: job.companyName,
    title: job.title,
    titleNorm: p.titleNorm,
    url: job.url,
    applyUrl: job.applyUrl,
    locationRaw: job.locationRaw,
    countryCode: job.countryCode,
    remotePolicy: job.remotePolicy,
    remoteScope: job.remoteScope,
    contractType: job.contractType,
    seniority: job.seniority,
    salaryMin: job.salary?.min ?? null,
    salaryMax: job.salary?.max ?? null,
    salaryRaw: job.salary?.raw ?? null,
    descriptionText: job.descriptionText,
    tags: job.tags,
    publishedAt: job.publishedAt,
    sourceUpdatedAt: job.sourceUpdatedAt,
    lastSeenAt: now,
    closedAt: null,
    contentHash: p.hash,
    filterStatus: filter.status,
    filterReasons: filter.reasons,
    filterFlags: filter.flags,
    ruleScore: filter.ruleScore,
    raw: job.raw as object,
  };

  const [row] = await tx
    .insert(jobs)
    .values(values)
    .onConflictDoUpdate({
      target: [jobs.sourceId, jobs.externalId],
      set: { ...values, sourceId: undefined, externalId: undefined },
    })
    .returning({ id: jobs.id, clusterId: jobs.clusterId, inserted: sql<boolean>`(xmax = 0)` });
  if (!row) throw new Error(`upsert impossible pour ${ctx.sourceId}/${job.externalId}`);

  // Le cluster ne change que si l'identité de l'offre (titre, entreprise) a changé.
  const identityChanged =
    !existing ||
    existing.titleNorm !== p.titleNorm ||
    (existing.companyNameRaw ?? "") !== (job.companyName ?? "");
  let clusterId = row.clusterId;
  const previousCluster = row.clusterId;
  if (!clusterId || identityChanged) {
    clusterId = await assignCluster(tx, {
      sourceId: ctx.sourceId,
      companyId,
      companyNorm: p.companyNorm,
      titleNorm: p.titleNorm,
      dedupKey: dedupKey(p.companyNorm, p.titleNorm),
    });
    if (clusterId !== row.clusterId) {
      await tx.update(jobs).set({ clusterId }).where(sql`${jobs.id} = ${row.id}`);
    }
  }
  await refreshCluster(tx, clusterId);
  if (previousCluster && previousCluster !== clusterId) await refreshCluster(tx, previousCluster);

  return { jobId: row.id, clusterId, created: Boolean(row.inserted) };
}
