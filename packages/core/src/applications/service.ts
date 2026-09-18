import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { applicationEvents, applications, jobClusters, jobs } from "../db/schema";
import { DomainError } from "../domain/action-result";
import type { ApplicationStatus } from "../domain/enums";
import { nextActionFor } from "../domain/pipeline";

async function logEvent(
  applicationId: string,
  event: {
    type: (typeof applicationEvents.$inferInsert)["type"];
    fromStatus?: ApplicationStatus | null;
    toStatus?: ApplicationStatus | null;
    note?: string | null;
    occurredAt?: Date;
  },
) {
  await getDb()
    .insert(applicationEvents)
    .values({ applicationId, ...event, occurredAt: event.occurredAt ?? new Date() });
}

export async function createApplicationForCluster(clusterId: string, status: ApplicationStatus = "to_apply") {
  const db = getDb();
  const [cluster] = await db
    .select({ id: jobClusters.id, companyId: jobClusters.companyId, url: jobs.applyUrl, jobUrl: jobs.url })
    .from(jobClusters)
    .leftJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .where(eq(jobClusters.id, clusterId));
  if (!cluster) throw new DomainError("NOT_FOUND", "Offre inconnue");
  const [existing] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.clusterId, clusterId));
  if (existing) throw new DomainError("CONFLICT", "Une candidature existe déjà pour cette offre");

  const now = new Date();
  const applied = status !== "to_apply";
  const [app] = await db
    .insert(applications)
    .values({
      kind: "job",
      clusterId,
      companyId: cluster.companyId,
      status,
      appliedAt: applied ? now : null,
      nextActionAt: nextActionFor(status, now),
      channel: "ats",
    })
    .returning();
  if (!app) throw new Error("création de candidature impossible");
  await logEvent(app.id, { type: "status_change", fromStatus: null, toStatus: status });
  await db
    .update(jobClusters)
    .set({ triage: applied ? "applied" : "interested", triagedAt: now })
    .where(eq(jobClusters.id, clusterId));
  return app;
}

/** Candidature faite hors outil (le pipeline doit rester complet). */
export async function createExternalApplication(input: {
  url: string;
  title: string;
  company: string;
  status?: ApplicationStatus;
  channel?: string;
  notes?: string;
}) {
  const status = input.status ?? "applied";
  const now = new Date();
  const [app] = await getDb()
    .insert(applications)
    .values({
      kind: "job",
      externalUrl: input.url,
      externalTitle: input.title,
      externalCompany: input.company,
      status,
      appliedAt: status === "to_apply" ? null : now,
      nextActionAt: nextActionFor(status, now),
      channel: input.channel ?? null,
      notes: input.notes ?? "",
    })
    .returning();
  if (!app) throw new Error("création de candidature impossible");
  await logEvent(app.id, { type: "status_change", toStatus: status });
  return app;
}

export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  opts: { note?: string; occurredAt?: Date } = {},
) {
  const db = getDb();
  const [current] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (!current) throw new DomainError("NOT_FOUND", "Candidature inconnue");
  if (current.status === status && !opts.note) return current;
  const at = opts.occurredAt ?? new Date();
  const [updated] = await db
    .update(applications)
    .set({
      status,
      appliedAt: current.appliedAt ?? (status === "to_apply" ? null : at),
      nextActionAt: nextActionFor(status, at),
    })
    .where(eq(applications.id, applicationId))
    .returning();
  await logEvent(applicationId, {
    type:
      status === "followed_up"
        ? "follow_up"
        : status === "interview"
          ? "interview_scheduled"
          : "status_change",
    fromStatus: current.status,
    toStatus: status,
    note: opts.note ?? null,
    occurredAt: at,
  });
  if (current.clusterId && status !== "to_apply") {
    await db.update(jobClusters).set({ triage: "applied" }).where(eq(jobClusters.id, current.clusterId));
  }
  return updated;
}

export async function addApplicationNote(applicationId: string, note: string) {
  const db = getDb();
  const [current] = await db
    .select({ notes: applications.notes })
    .from(applications)
    .where(eq(applications.id, applicationId));
  if (!current) throw new DomainError("NOT_FOUND", "Candidature inconnue");
  const stamp = new Date().toLocaleDateString("fr-FR");
  await db
    .update(applications)
    .set({ notes: `${current.notes ? `${current.notes}\n` : ""}[${stamp}] ${note}` })
    .where(eq(applications.id, applicationId));
  await logEvent(applicationId, { type: "note", note });
}

export async function setNextAction(applicationId: string, date: string | null) {
  const res = await getDb()
    .update(applications)
    .set({ nextActionAt: date })
    .where(eq(applications.id, applicationId))
    .returning({ id: applications.id });
  if (res.length === 0) throw new DomainError("NOT_FOUND", "Candidature inconnue");
}

export async function deleteApplication(applicationId: string) {
  const db = getDb();
  const [app] = await db.delete(applications).where(eq(applications.id, applicationId)).returning();
  if (app?.clusterId) {
    await db.update(jobClusters).set({ triage: "interested" }).where(eq(jobClusters.id, app.clusterId));
  }
}

export { logEvent as logApplicationEvent };
