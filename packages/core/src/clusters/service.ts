import { and, eq, inArray, sql } from "drizzle-orm";
import { createApplicationForCluster } from "../applications/service";
import { getDb } from "../db/client";
import { applications, jobClusters, jobs } from "../db/schema";
import { refreshCluster } from "../dedup/refresh";
import { DomainError } from "../domain/action-result";
import type { TriageStatus } from "../domain/enums";
import { evaluateJob } from "../filter/evaluate";
import { loadCriteria } from "../profile";

const TRIAGE_ORDER: Record<TriageStatus, number> = { new: 0, dismissed: 1, interested: 2, applied: 3 };

export async function setTriage(clusterId: string, triage: TriageStatus): Promise<void> {
  const db = getDb();
  const [row] = await db
    .update(jobClusters)
    .set({ triage, triagedAt: new Date() })
    .where(eq(jobClusters.id, clusterId))
    .returning({ id: jobClusters.id });
  if (!row) throw new DomainError("NOT_FOUND", "Offre inconnue");
  if (triage === "applied") {
    const [existing] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.clusterId, clusterId));
    if (!existing) await createApplicationForCluster(clusterId, "applied");
  }
}

/** Fusionne deux clusters (doublon inter-sources raté par la dédup). */
export async function mergeClusters(sourceClusterId: string, targetClusterId: string): Promise<void> {
  if (sourceClusterId === targetClusterId)
    throw new DomainError("VALIDATION", "Impossible de fusionner une offre avec elle-même");
  const db = getDb();
  await db.transaction(async (tx) => {
    const both = await tx
      .select()
      .from(jobClusters)
      .where(inArray(jobClusters.id, [sourceClusterId, targetClusterId]));
    const src = both.find((c) => c.id === sourceClusterId);
    const dst = both.find((c) => c.id === targetClusterId);
    if (!src || !dst) throw new DomainError("NOT_FOUND", "Offre inconnue");
    const apps = await tx
      .select({ id: applications.id, clusterId: applications.clusterId })
      .from(applications)
      .where(inArray(applications.clusterId, [sourceClusterId, targetClusterId]));
    if (apps.length > 1) throw new DomainError("CONFLICT", "Les deux offres ont déjà une candidature");
    const srcApp = apps.find((a) => a.clusterId === sourceClusterId);
    if (srcApp)
      await tx.update(applications).set({ clusterId: targetClusterId }).where(eq(applications.id, srcApp.id));
    await tx.update(jobs).set({ clusterId: targetClusterId }).where(eq(jobs.clusterId, sourceClusterId));
    const triage = TRIAGE_ORDER[src.triage] > TRIAGE_ORDER[dst.triage] ? src.triage : dst.triage;
    await tx.update(jobClusters).set({ triage }).where(eq(jobClusters.id, targetClusterId));
    await tx.update(jobClusters).set({ canonicalJobId: null }).where(eq(jobClusters.id, sourceClusterId));
    await tx.delete(jobClusters).where(eq(jobClusters.id, sourceClusterId));
    await refreshCluster(tx, targetClusterId);
  });
}

/** « Repêcher » : force le passage du filtre pour toutes les annonces du cluster et relance le scoring. */
export async function rescueCluster(clusterId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const res = await tx
      .update(jobs)
      .set({ forcedPass: true, filterStatus: "passed" })
      .where(eq(jobs.clusterId, clusterId))
      .returning({ id: jobs.id });
    if (res.length === 0) throw new DomainError("NOT_FOUND", "Offre inconnue");
    await tx.update(jobClusters).set({ triage: "new" }).where(eq(jobClusters.id, clusterId));
    await refreshCluster(tx, clusterId);
  });
}

/** Réévalue le filtre sur toutes les annonces ouvertes (après modification de profile/criteria.json). */
export async function refilterOpenJobs(): Promise<{ changed: number }> {
  const db = getDb();
  const criteria = loadCriteria();
  const rows = await db
    .select({
      id: jobs.id,
      clusterId: jobs.clusterId,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
      companyName: jobs.companyNameRaw,
      locationRaw: jobs.locationRaw,
      remotePolicy: jobs.remotePolicy,
      remoteScope: jobs.remoteScope,
      contractType: jobs.contractType,
      seniority: jobs.seniority,
      filterStatus: jobs.filterStatus,
      forcedPass: jobs.forcedPass,
      sourceId: jobs.sourceId,
    })
    .from(jobs)
    .where(and(sql`${jobs.closedAt} is null`, sql`${jobs.descriptionText} <> ''`));
  let changed = 0;
  const clusters = new Set<string>();
  for (const r of rows) {
    const advisory = r.forcedPass || r.sourceId === "capture";
    const res = evaluateJob(r, criteria, { advisory });
    await db
      .update(jobs)
      .set({
        filterStatus: res.status,
        filterReasons: res.reasons,
        filterFlags: res.flags,
        ruleScore: res.ruleScore,
      })
      .where(eq(jobs.id, r.id));
    if (res.status !== r.filterStatus) changed++;
    if (r.clusterId) clusters.add(r.clusterId);
  }
  // Tous les clusters ouverts sont recalculés : prend aussi en compte un changement de prompt
  // (PROMPT_VERSION) ou de modèle, qui remet en attente les scores absents du cache.
  for (const id of clusters) await refreshCluster(db, id);
  return { changed };
}
