import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../client";
import { companies, jobClusters, llmScores, sourceRuns, sources, workerHeartbeat } from "../schema";
import { countInbox } from "./jobs";

export async function listSourcesOverview() {
  return getDb()
    .select({
      source: sources,
      companyName: companies.name,
      passed30d: sql<number>`(
        select count(*)::int from jobs j
        where j.source_id = "sources"."id" and j.filter_status = 'passed'
          and j.first_seen_at > now() - interval '30 days'
      )`,
      open: sql<number>`(select count(*)::int from jobs j where j.source_id = "sources"."id" and j.closed_at is null)`,
    })
    .from(sources)
    .leftJoin(companies, eq(companies.id, sources.companyId))
    .orderBy(sql`${sources.kind} = 'capture'`, desc(sources.consecutiveFailures), sources.label);
}
export type SourceOverview = Awaited<ReturnType<typeof listSourcesOverview>>[number];

export async function listSourceRuns(sourceId: string, limit = 20) {
  return getDb()
    .select()
    .from(sourceRuns)
    .where(eq(sourceRuns.sourceId, sourceId))
    .orderBy(desc(sourceRuns.startedAt))
    .limit(limit);
}

export async function llmUsage30d() {
  const [row] = await getDb()
    .select({
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${llmScores.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${llmScores.outputTokens}), 0)::int`,
    })
    .from(llmScores)
    .where(gte(llmScores.updatedAt, sql`now() - interval '30 days'`));
  return row ?? { calls: 0, inputTokens: 0, outputTokens: 0 };
}

export async function getHeartbeat() {
  const [row] = await getDb().select().from(workerHeartbeat).where(eq(workerHeartbeat.id, 1));
  return row ?? null;
}

export async function navCounts() {
  const db = getDb();
  const [row] = await db
    .select({
      interesting: sql<number>`(select count(*)::int from ${jobClusters} c where c.triage = 'interested' and c.closed_at is null)`,
      followUps: sql<number>`(select count(*)::int from applications a where a.next_action_at <= current_date and a.status not in ('offer','rejected','withdrawn','ghosted'))`,
      brokenSources: sql<number>`(select count(*)::int from ${sources} s where s.enabled and s.consecutive_failures >= 5)`,
      disabledBySystem: sql<number>`(select count(*)::int from ${sources} s where not s.enabled and s.last_error like 'Board introuvable%')`,
      pendingScores: sql<number>`(select count(*)::int from ${jobClusters} c where c.score_status = 'pending')`,
    })
    .from(sql`(select 1) as one`);
  const inbox = await countInbox();
  return row
    ? { ...row, inbox }
    : { inbox, interesting: 0, followUps: 0, brokenSources: 0, disabledBySystem: 0, pendingScores: 0 };
}

export async function databaseSizeBytes(): Promise<number> {
  const rows = await getDb().execute<{ size: string }>(
    sql`select pg_database_size(current_database())::text as size`,
  );
  return Number(rows[0]?.size ?? 0);
}

export async function sourceExists(id: string) {
  const [row] = await getDb()
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.id, id)));
  return Boolean(row);
}
