import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { companies, jobClusters } from "../db/schema";
import { DEDUP_WINDOW_DAYS, TITLE_SIMILARITY_THRESHOLD, titleQualifiers } from "./keys";

const windowStart = () => sql`now() - make_interval(days => ${DEDUP_WINDOW_DAYS})`;

export interface ClusterCandidate {
  sourceId: string;
  companyId: string | null;
  companyNorm: string;
  titleNorm: string;
  dedupKey: string | null;
}

/** Le cluster contient-il déjà une annonce de cette source ? (colonne qualifiée : Drizzle ne préfixe pas sans jointure) */
const hasJobFromSource = (sourceId: string) =>
  sql<boolean>`exists (select 1 from jobs jx where jx.cluster_id = "job_clusters"."id" and jx.source_id = ${sourceId})`;

/**
 * Rattache une annonce à un cluster existant ou en crée un (PLAN §5.3, ADR-003). Renvoie l'id du cluster.
 * - clé exacte : même entreprise + même titre normalisé (y compris même poste publié sur plusieurs villes) ;
 * - similarité : uniquement entre sources différentes (deux identifiants d'une même source sont deux offres),
 *   et seulement si les qualificatifs du titre (séniorité, langue…) coïncident.
 */
export async function assignCluster(tx: DbOrTx, c: ClusterCandidate): Promise<string> {
  if (c.dedupKey) {
    const [exact] = await tx
      .select({ id: jobClusters.id })
      .from(jobClusters)
      .where(
        and(
          eq(jobClusters.dedupKey, c.dedupKey),
          gt(jobClusters.lastSeenAt, windowStart()),
          isNull(jobClusters.closedAt),
        ),
      )
      .orderBy(desc(jobClusters.lastSeenAt))
      .limit(1);
    if (exact) return exact.id;

    const sameCompany = c.companyId
      ? or(
          eq(jobClusters.companyId, c.companyId),
          sql`split_part(${jobClusters.dedupKey}, '|', 1) = ${c.companyNorm}`,
        )
      : sql`split_part(${jobClusters.dedupKey}, '|', 1) = ${c.companyNorm}`;
    const similarity = sql<number>`similarity(${jobClusters.titleNorm}, ${c.titleNorm})`;
    const candidates = await tx
      .select({ id: jobClusters.id, titleNorm: jobClusters.titleNorm })
      .from(jobClusters)
      .where(
        and(
          sameCompany,
          sql`${similarity} >= ${TITLE_SIMILARITY_THRESHOLD}`,
          gt(jobClusters.lastSeenAt, windowStart()),
          isNull(jobClusters.closedAt),
          sql`not ${hasJobFromSource(c.sourceId)}`,
        ),
      )
      .orderBy(desc(similarity))
      .limit(5);
    const qualifiers = titleQualifiers(c.titleNorm);
    const match = candidates.find((cand) => titleQualifiers(cand.titleNorm) === qualifiers);
    if (match) return match.id;
  }

  // Nouveau cluster, lié à une éventuelle publication antérieure de même clé.
  const previous = c.dedupKey
    ? (
        await tx
          .select({ id: jobClusters.id })
          .from(jobClusters)
          .where(eq(jobClusters.dedupKey, c.dedupKey))
          .orderBy(desc(jobClusters.lastSeenAt))
          .limit(1)
      )[0]
    : undefined;

  const [created] = await tx
    .insert(jobClusters)
    .values({
      companyId: c.companyId,
      // Sans entreprise, la clé reste unique au cluster : aucun rattachement futur possible.
      dedupKey: c.dedupKey ?? `anon|${crypto.randomUUID()}`,
      titleNorm: c.titleNorm,
      previousClusterId: previous?.id ?? null,
    })
    .returning({ id: jobClusters.id });
  if (!created) throw new Error("création de cluster impossible");
  return created.id;
}

/** Entreprise du registre correspondant exactement au nom normalisé, si elle existe. */
export async function findCompanyIdByNorm(tx: DbOrTx, companyNorm: string): Promise<string | null> {
  if (!companyNorm) return null;
  const [row] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.nameNorm, companyNorm))
    .limit(1);
  return row?.id ?? null;
}
