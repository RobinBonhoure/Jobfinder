import { createHash } from "node:crypto";
import { normalizeWhitespace } from "../normalize/text";

export const DEDUP_WINDOW_DAYS = 45;
/** Seuil pg_trgm `similarity()` sur title_norm, à calibrer sur des cas réels (ADR-003). */
export const TITLE_SIMILARITY_THRESHOLD = 0.75;

/** Empreinte du contenu : clé du cache LLM et détection de modification (PLAN §5.2). */
export function contentHash(titleNorm: string, companyNorm: string, description: string): string {
  return createHash("sha256")
    .update(`${titleNorm}\n${companyNorm}\n${normalizeWhitespace(description)}`)
    .digest("hex");
}

/** Clé de rattachement inter-sources ; null si l'entreprise est inconnue (pas de rattachement). */
export function dedupKey(companyNorm: string, titleNorm: string): string | null {
  if (!companyNorm) return null;
  return `${companyNorm}|${titleNorm}`;
}

const QUALIFIERS =
  /\b(?:junior|jr|senior|sr|staff|lead|principal|head|manager|intern|stagiaire|alternant|french|francais|german|allemand|spanish|espagnol|italian|italien|english|anglais|dutch|backend|frontend|fullstack|mobile|ios|android|data|ml|ai|qa)\b/g;

/**
 * Qualificatifs qui distinguent deux postes au titre proche (séniorité, langue, spécialité).
 * Deux titres similaires ne sont rapprochés que si ces ensembles coïncident.
 */
export function titleQualifiers(titleNorm: string): string {
  return [...new Set(titleNorm.match(QUALIFIERS) ?? [])].sort().join(",");
}

/** Priorité pour choisir l'annonce canonique d'un cluster (plus petit = préféré). */
export function sourcePriority(kind: string): number {
  switch (kind) {
    case "greenhouse":
    case "lever":
    case "ashby":
    case "smartrecruiters":
    case "recruitee":
    case "teamtailor":
      return 0;
    case "capture":
      return 1;
    case "france_travail":
      return 2;
    default:
      return 3;
  }
}
