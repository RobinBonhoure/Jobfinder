import { and, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { companies, jobClusters, jobs } from "../db/schema";
import { DomainError } from "../domain/action-result";
import type { OutreachStatus } from "../domain/enums";
import { normalizeCompanyName } from "../normalize/text";

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export interface CompanyInput {
  name: string;
  website?: string | null;
  siren?: string | null;
  nafCode?: string | null;
  naf25Code?: string | null;
  headcountRange?: string | null;
  city?: string | null;
  source: string;
  tags?: string[];
}

/** Retrouve une entreprise par SIREN, domaine ou nom normalisé ; la crée sinon. */
export async function findOrCreateCompany(input: CompanyInput) {
  const db = getDb();
  const nameNorm = normalizeCompanyName(input.name);
  if (!nameNorm) throw new DomainError("VALIDATION", "Nom d'entreprise vide");
  const domain = domainFromUrl(input.website);

  const match =
    (input.siren && (await db.select().from(companies).where(eq(companies.siren, input.siren)))[0]) ||
    (domain && (await db.select().from(companies).where(eq(companies.domain, domain)))[0]) ||
    (await db.select().from(companies).where(eq(companies.nameNorm, nameNorm)))[0];

  if (match) {
    // Enrichissement : on complète sans écraser.
    const patch = {
      website: match.website ?? (domain ? `https://${domain}` : null),
      domain: match.domain ?? domain,
      siren: match.siren ?? input.siren ?? null,
      nafCode: match.nafCode ?? input.nafCode ?? null,
      naf25Code: match.naf25Code ?? input.naf25Code ?? null,
      headcountRange: match.headcountRange ?? input.headcountRange ?? null,
      city: match.city ?? input.city ?? null,
    };
    const [updated] = await db.update(companies).set(patch).where(eq(companies.id, match.id)).returning();
    return updated ?? match;
  }

  const [created] = await db
    .insert(companies)
    .values({
      name: input.name.trim(),
      nameNorm,
      domain,
      website: domain ? `https://${domain}` : null,
      siren: input.siren ?? null,
      nafCode: input.nafCode ?? null,
      naf25Code: input.naf25Code ?? null,
      headcountRange: input.headcountRange ?? null,
      city: input.city ?? null,
      source: input.source,
      tags: input.tags ?? [],
    })
    .returning();
  if (!created) throw new Error("création d'entreprise impossible");

  await attachOrphanJobs(created.id, nameNorm);
  return created;
}

/** Rattache les annonces déjà ingérées dont le nom d'entreprise normalisé correspond. */
async function attachOrphanJobs(companyId: string, nameNorm: string): Promise<void> {
  const db = getDb();
  const firstWord = nameNorm.split(" ")[0] ?? nameNorm;
  const candidates = await db
    .select({ id: jobs.id, name: jobs.companyNameRaw, clusterId: jobs.clusterId })
    .from(jobs)
    .where(and(isNull(jobs.companyId), ilike(jobs.companyNameRaw, `%${firstWord}%`)))
    .limit(500);
  const matching = candidates.filter((c) => c.name && normalizeCompanyName(c.name) === nameNorm);
  if (matching.length === 0) return;
  await db
    .update(jobs)
    .set({ companyId })
    .where(
      inArray(
        jobs.id,
        matching.map((m) => m.id),
      ),
    );
  const clusterIds = [...new Set(matching.map((m) => m.clusterId).filter((c): c is string => Boolean(c)))];
  if (clusterIds.length) {
    await db
      .update(jobClusters)
      .set({ companyId })
      .where(and(inArray(jobClusters.id, clusterIds), isNull(jobClusters.companyId)));
  }
}

export async function updateCompany(
  id: string,
  patch: Partial<{
    name: string;
    website: string | null;
    notes: string;
    tags: string[];
    outreachStatus: OutreachStatus;
  }>,
) {
  const db = getDb();
  const set: Record<string, unknown> = { ...patch };
  if (patch.name !== undefined) set.nameNorm = normalizeCompanyName(patch.name);
  if (patch.website !== undefined) {
    const domain = domainFromUrl(patch.website);
    set.domain = domain;
    set.website = domain ? `https://${domain}` : null;
  }
  const [row] = await db.update(companies).set(set).where(eq(companies.id, id)).returning();
  if (!row) throw new DomainError("NOT_FOUND", "Entreprise inconnue");
  return row;
}

/** Promeut en cible spontanée l'entreprise d'une offre (module A → module B). */
export async function promoteClusterCompany(clusterId: string) {
  const db = getDb();
  const [row] = await db
    .select({ companyId: jobClusters.companyId, companyName: jobs.companyNameRaw })
    .from(jobClusters)
    .leftJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .where(eq(jobClusters.id, clusterId));
  if (!row) throw new DomainError("NOT_FOUND", "Offre inconnue");
  let companyId = row.companyId;
  if (!companyId) {
    if (!row.companyName) throw new DomainError("VALIDATION", "Entreprise inconnue pour cette offre");
    companyId = (await findOrCreateCompany({ name: row.companyName, source: `cluster:${clusterId}` })).id;
    await db.update(jobClusters).set({ companyId }).where(eq(jobClusters.id, clusterId));
  }
  const [company] = await db
    .update(companies)
    .set({
      outreachStatus: sql`case when ${companies.outreachStatus} = 'none' then 'to_contact'::outreach_status else ${companies.outreachStatus} end`,
    })
    .where(eq(companies.id, companyId))
    .returning();
  return company;
}
