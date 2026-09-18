import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { findOrCreateCompany } from "../companies/service";
import { getDb } from "../db/client";
import { sources } from "../db/schema";
import { DomainError } from "../domain/action-result";
import { SOURCE_KINDS } from "../domain/enums";
import { HttpClient } from "../http/client";
import { dryRunSource } from "../ingest/dry-run";
import { errorMessage, logger } from "../logger";
import { profilePath } from "../paths";
import { type DetectedAts, detectAtsFromUrl, findAtsInHtml } from "./detect";
import { getAdapter } from "./registry";

/** Détecte l'ATS d'une URL ; sinon, lit la page carrières et cherche un ATS embarqué. */
export async function resolveAts(url: string): Promise<DetectedAts> {
  const direct = detectAtsFromUrl(url);
  if (direct) return direct;
  let html: string;
  try {
    html = await new HttpClient().getText(url, { headers: { accept: "text/html" }, retries: 1 });
  } catch (err) {
    throw new DomainError("UPSTREAM", `Page injoignable : ${errorMessage(err)}`);
  }
  const found = findAtsInHtml(html, url);
  if (found.length === 0) {
    throw new DomainError(
      "VALIDATION",
      "Aucun ATS reconnu (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Teamtailor) sur cette page.",
    );
  }
  return found[0] as DetectedAts;
}

export interface AddSourceResult {
  sourceId: string;
  kind: string;
  fetched: number;
  passed: number;
  sampleTitles: string[];
}

/** « Ajout par URL » (PLAN §6.6) : détection, test immédiat, création entreprise + source. */
export async function addSourceFromUrl(url: string, companyName?: string): Promise<AddSourceResult> {
  const detected = await resolveAts(url);
  const db = getDb();
  const [dup] = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, detected.sourceId));
  if (dup) throw new DomainError("CONFLICT", `Source déjà enregistrée : ${detected.sourceId}`);

  const name = companyName?.trim() || detected.slug;
  const test = await dryRunSource(detected.kind, detected.config, name);
  if (test.fetched === 0) {
    throw new DomainError("UPSTREAM", "Le board répond mais ne contient aucune offre : vérifie le token.");
  }
  const company = await findOrCreateCompany({ name, source: "ats_registry" });
  const adapter = getAdapter(detected.kind);
  await db.insert(sources).values({
    id: detected.sourceId,
    kind: detected.kind,
    label: name,
    companyId: company.id,
    config: detected.config,
    intervalMinutes: adapter?.defaultIntervalMinutes ?? 360,
    nextRunAt: new Date(),
  });
  return {
    sourceId: detected.sourceId,
    kind: detected.kind,
    fetched: test.fetched,
    passed: test.passed.length,
    sampleTitles: test.sampleTitles,
  };
}

export async function setSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
  const res = await getDb()
    .update(sources)
    .set({ enabled, ...(enabled ? { consecutiveFailures: 0, nextRunAt: new Date() } : {}) })
    .where(eq(sources.id, sourceId))
    .returning({ id: sources.id });
  if (res.length === 0) throw new DomainError("NOT_FOUND", "Source inconnue");
}

export async function setSourceInterval(sourceId: string, minutes: number): Promise<number> {
  const db = getDb();
  const [src] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!src) throw new DomainError("NOT_FOUND", "Source inconnue");
  const floor = getAdapter(src.kind)?.minIntervalMinutes ?? 60;
  const value = Math.max(Math.round(minutes), floor);
  await db.update(sources).set({ intervalMinutes: value }).where(eq(sources.id, sourceId));
  return value;
}

export async function deleteSource(sourceId: string): Promise<void> {
  await getDb().delete(sources).where(eq(sources.id, sourceId));
}

const SeedFile = z.object({
  boards: z.array(z.object({ company: z.string(), url: z.string() })).default([]),
  feeds: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(SOURCE_KINDS),
        label: z.string(),
        config: z.record(z.string(), z.unknown()),
        enabled: z.boolean().default(true),
      }),
    )
    .default([]),
});

/** Importe profile/boards.json : crée ce qui manque, sans tester (pas d'appel réseau). */
export async function seedSourcesFromProfile(): Promise<{ created: string[]; skipped: string[] }> {
  const file = SeedFile.parse(JSON.parse(readFileSync(profilePath("boards.json"), "utf8")));
  const db = getDb();
  const created: string[] = [];
  const skipped: string[] = [];
  const existing = new Set((await db.select({ id: sources.id }).from(sources)).map((r) => r.id));

  for (const b of file.boards) {
    const d = detectAtsFromUrl(b.url);
    if (!d) {
      logger.warn("URL non reconnue dans boards.json", { url: b.url });
      skipped.push(b.url);
      continue;
    }
    if (existing.has(d.sourceId)) {
      skipped.push(d.sourceId);
      continue;
    }
    const company = await findOrCreateCompany({ name: b.company, source: "ats_registry" });
    await db.insert(sources).values({
      id: d.sourceId,
      kind: d.kind,
      label: b.company,
      companyId: company.id,
      config: d.config,
      intervalMinutes: getAdapter(d.kind)?.defaultIntervalMinutes ?? 360,
    });
    created.push(d.sourceId);
  }
  for (const f of file.feeds) {
    if (existing.has(f.id)) {
      skipped.push(f.id);
      continue;
    }
    const adapter = getAdapter(f.kind);
    await db.insert(sources).values({
      id: f.id,
      kind: f.kind,
      label: f.label,
      config: adapter ? adapter.configSchema.parse(f.config) : f.config,
      enabled: f.enabled,
      intervalMinutes: adapter?.defaultIntervalMinutes ?? 360,
    });
    created.push(f.id);
  }
  return { created, skipped };
}

/** Source interne pour les captures de l'extension. */
export async function ensureCaptureSource(): Promise<string> {
  await getDb()
    .insert(sources)
    .values({ id: "capture", kind: "capture", label: "Capture manuelle", enabled: false, config: {} })
    .onConflictDoNothing();
  return "capture";
}
