import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { REMOTE_SCOPES } from "./domain/enums";
import { profilePath } from "./paths";

/** Critères du filtre déterministe. Motifs = expressions régulières appliquées à du texte « plié » (minuscules, sans accents). */
export const FilterCriteria = z.object({
  roleTitlePatterns: z.array(z.string()).min(1),
  requiredStack: z.array(z.string()).min(1),
  preferredStack: z.array(z.string()).default([]),
  titleExclusions: z.array(z.string()).default([]),
  descriptionExclusions: z.array(z.string()).default([]),
  seniorityTitleExclusions: z.array(z.string()).default([]),
  companyExclusions: z.array(z.string()).default([]),
  rejectRemoteScopes: z.array(z.enum(REMOTE_SCOPES)).default(["other"]),
});
export type FilterCriteria = z.infer<typeof FilterCriteria>;

const cache = new Map<string, { mtimeMs: number; value: unknown }>();

/** Relit le fichier seulement s'il a changé : les modifications du profil s'appliquent sans redémarrage. */
function readCached<T>(path: string, parse: (content: string) => T): T {
  const { mtimeMs } = statSync(path);
  const hit = cache.get(path);
  if (hit && hit.mtimeMs === mtimeMs) return hit.value as T;
  const value = parse(readFileSync(path, "utf8"));
  cache.set(path, { mtimeMs, value });
  return value;
}

export function loadCriteria(): FilterCriteria {
  return readCached(profilePath("criteria.json"), (c) => FilterCriteria.parse(JSON.parse(c)));
}

export function loadCv(): string {
  return readCached(profilePath("cv.md"), (c) => c.trim());
}

export interface CandidateIdentity {
  name: string;
  email: string;
  website: string;
  city: string;
}

export const CANDIDATE: CandidateIdentity = {
  name: "Robin Bonhoure",
  email: "robin.bonhoure@outlook.fr",
  website: "https://robinbonhoure.com",
  city: "Toulouse",
};
