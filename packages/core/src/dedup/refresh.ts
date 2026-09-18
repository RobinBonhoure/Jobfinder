import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { jobClusters, jobs, llmScores, sources } from "../db/schema";
import type { ScoreStatus } from "../domain/enums";
import { PROMPT_VERSION, scoringModel } from "../scoring/config";
import { sourcePriority } from "./keys";

/**
 * Recalcule l'état dérivé d'un cluster à partir de ses annonces et du cache de scores :
 * annonce canonique, dates, statut de scoring et meilleur score. Point unique de cohérence,
 * appelé après ingestion, scoring, repêchage ou fusion.
 */
export async function refreshCluster(tx: DbOrTx, clusterId: string): Promise<void> {
  const members = await tx
    .select({
      id: jobs.id,
      kind: sources.kind,
      filterStatus: jobs.filterStatus,
      contentHash: jobs.contentHash,
      companyId: jobs.companyId,
      firstSeenAt: jobs.firstSeenAt,
      lastSeenAt: jobs.lastSeenAt,
      closedAt: jobs.closedAt,
    })
    .from(jobs)
    .innerJoin(sources, eq(sources.id, jobs.sourceId))
    .where(eq(jobs.clusterId, clusterId));

  if (members.length === 0) {
    await tx.delete(jobClusters).where(eq(jobClusters.id, clusterId));
    return;
  }

  const rank = (m: (typeof members)[number]) =>
    (m.filterStatus === "passed" ? 0 : 10) + (m.closedAt ? 5 : 0) + sourcePriority(m.kind);
  const canonical = [...members].sort((a, b) => rank(a) - rank(b))[0];
  if (!canonical) return;

  const anyPassed = members.some((m) => m.filterStatus === "passed");
  let scoreStatus: ScoreStatus = "not_needed";
  let bestScore: number | null = null;

  if (anyPassed) {
    const [cached] = await tx
      .select({ status: llmScores.status, score: llmScores.score, attempts: llmScores.attempts })
      .from(llmScores)
      .where(
        and(
          eq(llmScores.contentHash, canonical.contentHash),
          eq(llmScores.promptVersion, PROMPT_VERSION),
          eq(llmScores.model, scoringModel()),
        ),
      )
      .limit(1);
    if (cached?.status === "ok") {
      scoreStatus = "done";
      bestScore = cached.score;
    } else if (cached?.status === "failed" && cached.attempts >= 2) {
      scoreStatus = "failed";
    } else {
      scoreStatus = "pending";
    }
  }

  const allClosed = members.every((m) => m.closedAt);
  const firstSeen = new Date(Math.min(...members.map((m) => m.firstSeenAt.getTime())));
  const lastSeen = new Date(Math.max(...members.map((m) => m.lastSeenAt.getTime())));

  await tx
    .update(jobClusters)
    .set({
      canonicalJobId: canonical.id,
      companyId: canonical.companyId ?? members.find((m) => m.companyId)?.companyId ?? null,
      scoreStatus,
      bestScore,
      firstSeenAt: firstSeen,
      lastSeenAt: lastSeen,
      closedAt: allClosed ? sql`coalesce(${jobClusters.closedAt}, now())` : null,
    })
    .where(eq(jobClusters.id, clusterId));
}
