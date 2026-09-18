import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { companies, jobClusters, jobs, sourceRuns, sources } from "../db/schema";
import { refreshCluster } from "../dedup/refresh";
import { DomainError } from "../domain/action-result";
import { HttpClient, HttpError } from "../http/client";
import { errorMessage, logger } from "../logger";
import { loadCriteria } from "../profile";
import { ATS_KINDS, getAdapter } from "../sources/registry";
import { type ExistingJob, type Prepared, prepareJob, processJob } from "./process-job";

export type RunTrigger = "worker" | "manual" | "cli";

export interface RunSummary {
  sourceId: string;
  status: "ok" | "partial" | "failed";
  fetched: number;
  created: number;
  updated: number;
  closed: number;
  failedItems: number;
  durationMs: number;
  error?: string;
}

const BATCH = 100;
const LOCK_TTL_MINUTES = 30;
const MAX_BACKOFF_MINUTES = 24 * 60;
const DEFERRED_CLOSE_DAYS = 30;

/** Pose le verrou de run ; renvoie la source ou lève CONFLICT / NOT_FOUND. */
async function acquire(sourceId: string) {
  const db = getDb();
  const [locked] = await db
    .update(sources)
    .set({ runningSince: new Date() })
    .where(
      and(
        eq(sources.id, sourceId),
        or(
          isNull(sources.runningSince),
          lt(sources.runningSince, sql`now() - make_interval(mins => ${LOCK_TTL_MINUTES})`),
        ),
      ),
    )
    .returning();
  if (locked) return locked;
  const [exists] = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId));
  if (!exists) throw new DomainError("NOT_FOUND", `Source inconnue : ${sourceId}`);
  throw new DomainError("CONFLICT", `Un run est déjà en cours pour ${sourceId}`);
}

/** Exécute une source de bout en bout (PLAN §6.2). */
export async function runSource(
  sourceId: string,
  opts: { trigger: RunTrigger; signal?: AbortSignal } = { trigger: "manual" },
): Promise<RunSummary> {
  const db = getDb();
  const log = logger.child(`ingest:${sourceId}`);
  const source = await acquire(sourceId);
  const started = Date.now();
  const runStartedAt = new Date();
  const signal = opts.signal ?? new AbortController().signal;
  const counters = { fetched: 0, created: 0, updated: 0, closed: 0, failedItems: 0 };
  const http = new HttpClient();

  const [run] = await db
    .insert(sourceRuns)
    .values({ sourceId, trigger: opts.trigger })
    .returning({ id: sourceRuns.id });
  if (!run) throw new Error("impossible de créer source_runs");

  try {
    const adapter = getAdapter(source.kind);
    if (!adapter)
      throw new DomainError("VALIDATION", `La source ${sourceId} (${source.kind}) ne se lance pas`);
    for (const [host, ms] of Object.entries(adapter.hostIntervals ?? {})) http.setHostInterval(host, ms);
    const config = adapter.configSchema.parse(source.config);
    const criteria = loadCriteria();
    const companyName = source.companyId
      ? ((
          await db.select({ name: companies.name }).from(companies).where(eq(companies.id, source.companyId))
        )[0]?.name ?? null)
      : null;

    const result = await adapter.fetch({ config, cursor: source.cursor, http, signal, log });
    counters.fetched = result.items.length;

    const existingRows = await db
      .select({
        id: jobs.id,
        externalId: jobs.externalId,
        contentHash: jobs.contentHash,
        titleNorm: jobs.titleNorm,
        clusterId: jobs.clusterId,
        companyNameRaw: jobs.companyNameRaw,
        forcedPass: jobs.forcedPass,
        closedAt: jobs.closedAt,
      })
      .from(jobs)
      .where(eq(jobs.sourceId, sourceId));
    const existing = new Map<string, ExistingJob & { closedAt: Date | null }>(
      existingRows.map((r) => [r.externalId, r]),
    );

    const unchanged: Array<{ id: string; clusterId: string | null; reopened: boolean }> = [];
    const changed: Prepared[] = [];
    const seen = new Set<string>();
    for (const raw of result.items) {
      try {
        const job = adapter.normalize(raw, { companyName, config });
        if (seen.has(job.externalId)) continue;
        seen.add(job.externalId);
        const p = prepareJob(job, companyName);
        const prev = existing.get(job.externalId);
        if (prev && prev.contentHash === p.hash) {
          unchanged.push({ id: prev.id, clusterId: prev.clusterId, reopened: prev.closedAt !== null });
        } else {
          changed.push(p);
        }
      } catch (err) {
        counters.failedItems++;
        log.warn("annonce ignorée (normalisation)", { error: errorMessage(err) });
      }
    }

    // Annonces inchangées : un seul UPDATE groupé.
    for (let i = 0; i < unchanged.length; i += 1000) {
      const slice = unchanged.slice(i, i + 1000);
      await db
        .update(jobs)
        .set({ lastSeenAt: new Date(), closedAt: null })
        .where(
          inArray(
            jobs.id,
            slice.map((u) => u.id),
          ),
        );
      const clusterIds = [...new Set(slice.map((u) => u.clusterId).filter((c): c is string => Boolean(c)))];
      if (clusterIds.length) {
        await db
          .update(jobClusters)
          .set({ lastSeenAt: new Date(), closedAt: null })
          .where(inArray(jobClusters.id, clusterIds));
      }
    }

    // Annonces nouvelles ou modifiées : traitement complet, par lots transactionnels.
    for (let i = 0; i < changed.length; i += BATCH) {
      const batch = changed.slice(i, i + BATCH);
      await db.transaction(async (tx) => {
        for (const p of batch) {
          const prev = existing.get(p.job.externalId);
          const res = await processJob(
            tx,
            { sourceId, sourceCompanyId: source.companyId, criteria },
            p,
            prev,
          );
          if (res.created) counters.created++;
          else counters.updated++;
        }
      });
    }

    // Clôture : immédiate si le listing est complet, différée sinon.
    const closeWhere =
      adapter.completeListing && result.complete
        ? lt(jobs.lastSeenAt, runStartedAt)
        : lt(jobs.lastSeenAt, sql`now() - make_interval(days => ${DEFERRED_CLOSE_DAYS})`);
    const closedRows = await db
      .update(jobs)
      .set({ closedAt: new Date() })
      .where(and(eq(jobs.sourceId, sourceId), isNull(jobs.closedAt), closeWhere))
      .returning({ clusterId: jobs.clusterId });
    counters.closed = closedRows.length;
    const toRefresh = new Set(closedRows.map((r) => r.clusterId).filter((c): c is string => Boolean(c)));
    for (const u of unchanged) if (u.reopened && u.clusterId) toRefresh.add(u.clusterId);
    for (const clusterId of toRefresh) await refreshCluster(db, clusterId);

    const status = counters.failedItems > 0 ? "partial" : "ok";
    const interval = Math.max(source.intervalMinutes, adapter.minIntervalMinutes);
    await db
      .update(sources)
      .set({
        cursor: result.nextCursor ?? source.cursor,
        lastRunAt: new Date(),
        lastSuccessAt: new Date(),
        nextRunAt: new Date(Date.now() + interval * 60_000),
        consecutiveFailures: 0,
        lastError: counters.failedItems > 0 ? `${counters.failedItems} annonce(s) ignorée(s)` : null,
        runningSince: null,
      })
      .where(eq(sources.id, sourceId));
    await db
      .update(sourceRuns)
      .set({ ...counters, status, finishedAt: new Date(), httpCalls: http.calls })
      .where(eq(sourceRuns.id, run.id));
    const summary: RunSummary = { sourceId, status, ...counters, durationMs: Date.now() - started };
    log.info("run terminé", { ...counters, ms: summary.durationMs });
    return summary;
  } catch (err) {
    const aborted = signal.aborted;
    const message = errorMessage(err);
    const failures = aborted ? source.consecutiveFailures : source.consecutiveFailures + 1;
    const backoff = Math.min(source.intervalMinutes * 2 ** failures, MAX_BACKOFF_MINUTES);
    const boardGone =
      err instanceof HttpError &&
      err.status === 404 &&
      (ATS_KINDS as readonly string[]).includes(source.kind);
    await db
      .update(sources)
      .set({
        lastRunAt: new Date(),
        consecutiveFailures: failures,
        lastError: boardGone
          ? "Board introuvable (token changé ?) — source désactivée"
          : message.slice(0, 500),
        enabled: boardGone ? false : source.enabled,
        nextRunAt: new Date(Date.now() + backoff * 60_000),
        runningSince: null,
      })
      .where(eq(sources.id, sourceId));
    await db
      .update(sourceRuns)
      .set({
        ...counters,
        status: "failed",
        finishedAt: new Date(),
        httpCalls: http.calls,
        error: message.slice(0, 2000),
      })
      .where(eq(sourceRuns.id, run.id));
    log.error("run en échec", { error: message, aborted });
    if (err instanceof DomainError) throw err;
    return { sourceId, status: "failed", ...counters, durationMs: Date.now() - started, error: message };
  }
}

/** Sources dues (avec 10 min de tolérance pour les regrouper par fenêtre). */
export async function dueSourceIds(toleranceMinutes = 10): Promise<string[]> {
  const rows = await getDb()
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.enabled, true),
        sql`${sources.kind} <> 'capture'`,
        lt(sources.nextRunAt, sql`now() + make_interval(mins => ${toleranceMinutes})`),
      ),
    )
    .orderBy(sources.nextRunAt);
  return rows.map((r) => r.id);
}

/** Toutes les sources activées (hors capture). */
export async function enabledSourceIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.enabled, true), sql`${sources.kind} <> 'capture'`))
    .orderBy(sources.nextRunAt);
  return rows.map((r) => r.id);
}

/** Exécute séquentiellement une liste de sources ; les conflits de verrou sont ignorés. */
export async function runSources(
  ids: string[],
  opts: { trigger: RunTrigger; signal?: AbortSignal },
): Promise<RunSummary[]> {
  const out: RunSummary[] = [];
  for (const id of ids) {
    if (opts.signal?.aborted) break;
    try {
      out.push(await runSource(id, opts));
    } catch (err) {
      if (err instanceof DomainError && err.code === "CONFLICT") continue;
      logger.error("source ignorée", { id, error: errorMessage(err) });
    }
  }
  return out;
}
