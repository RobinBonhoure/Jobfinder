import { z } from "zod";
import type { ContractType, Seniority } from "../domain/enums";
import { env } from "../env";
import type { HttpClient } from "../http/client";
import { buildJob } from "../normalize/build";
import { defineSource } from "./types";

// Références : docs/SOURCES.md (plusieurs points [À VÉRIFIER] à confirmer avec de vrais identifiants).
const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";
const PAGE = 150;
const MAX_START = 3000;
const DAY = 86_400_000;

const Config = z.object({
  motsCles: z.string().min(1),
  typeContrat: z.string().default("CDI"),
  departement: z.string().optional(),
  /** Profondeur de la première collecte, en jours. */
  initialDays: z.number().int().min(1).max(31).default(14),
});

const Cursor = z.object({ lastCreation: z.string() });
type Cursor = z.infer<typeof Cursor>;

const Offre = z.looseObject({
  id: z.string(),
  intitule: z.string(),
  description: z.string().nullish(),
  dateCreation: z.string().nullish(),
  dateActualisation: z.string().nullish(),
  lieuTravail: z.looseObject({ libelle: z.string().nullish() }).nullish(),
  entreprise: z.looseObject({ nom: z.string().nullish() }).nullish(),
  typeContrat: z.string().nullish(),
  alternance: z.boolean().nullish(),
  experienceExige: z.string().nullish(),
  experienceLibelle: z.string().nullish(),
  salaire: z.looseObject({ libelle: z.string().nullish() }).nullish(),
  romeLibelle: z.string().nullish(),
  appellationlibelle: z.string().nullish(),
  origineOffre: z.looseObject({ urlOrigine: z.string().nullish() }).nullish(),
});

const CONTRACT: Record<string, ContractType> = {
  CDI: "cdi",
  CDD: "cdd",
  MIS: "cdd",
  SAI: "cdd",
  LIB: "freelance",
  FRA: "freelance",
  CCE: "freelance",
  REP: "freelance",
};

let token: { value: string; expiresAt: number } | null = null;

async function getToken(http: HttpClient, signal: AbortSignal): Promise<string> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const { FRANCE_TRAVAIL_CLIENT_ID: id, FRANCE_TRAVAIL_CLIENT_SECRET: secret } = env();
  if (!id || !secret)
    throw new Error("FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET manquants dans .env");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
    scope: SCOPE,
  });
  const res = await http.request(TOKEN_URL, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal,
    retries: 1,
  });
  const data = JSON.parse(res.text) as { access_token: string; expires_in?: number };
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 1400) * 1000 };
  return token.value;
}

/** Format imposé par l'API : yyyy-MM-ddTHH:mm:ssZ, sans millisecondes. */
const ftDate = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

async function searchWindow(
  http: HttpClient,
  signal: AbortSignal,
  config: z.infer<typeof Config>,
  from: Date,
  to: Date,
  depth: number,
): Promise<{ items: unknown[]; complete: boolean }> {
  const items: unknown[] = [];
  for (let start = 0; start <= MAX_START; start += PAGE) {
    const params = new URLSearchParams({
      motsCles: config.motsCles,
      typeContrat: config.typeContrat,
      minCreationDate: ftDate(from),
      maxCreationDate: ftDate(to),
      range: `${start}-${Math.min(start + PAGE - 1, MAX_START + PAGE - 1)}`,
      sort: "1",
    });
    if (config.departement) params.set("departement", config.departement);
    const res = await http.request(`${SEARCH_URL}?${params}`, {
      signal,
      headers: { authorization: `Bearer ${await getToken(http, signal)}` },
      acceptStatus: [204, 206],
    });
    if (res.status === 204 || !res.text) break;
    const data = JSON.parse(res.text) as { resultats?: unknown[] };
    const page = data.resultats ?? [];
    items.push(...page);
    const total = Number(res.headers.get("content-range")?.split("/")[1] ?? Number.NaN);
    if (Number.isFinite(total) && total > MAX_START + PAGE && depth < 4 && start === 0) {
      // Trop de résultats pour la pagination : on découpe la fenêtre de dates en deux.
      const mid = new Date((from.getTime() + to.getTime()) / 2);
      const a = await searchWindow(http, signal, config, from, mid, depth + 1);
      const b = await searchWindow(http, signal, config, mid, to, depth + 1);
      return { items: [...a.items, ...b.items], complete: a.complete && b.complete };
    }
    if (page.length < PAGE || (Number.isFinite(total) && start + PAGE >= total)) {
      return { items, complete: true };
    }
  }
  return { items, complete: false };
}

export const franceTravail = defineSource<z.infer<typeof Config>, Cursor>({
  kind: "france_travail",
  configSchema: Config,
  defaultIntervalMinutes: 360,
  minIntervalMinutes: 120,
  completeListing: false,
  hostIntervals: { "api.francetravail.io": 150 },

  async fetch({ config, cursor, http, signal }) {
    const now = new Date();
    const last = Cursor.safeParse(cursor).data?.lastCreation;
    // Recouvrement de 24 h contre les retards d'indexation.
    const from = last
      ? new Date(new Date(last).getTime() - DAY)
      : new Date(now.getTime() - config.initialDays * DAY);
    const { items, complete } = await searchWindow(http, signal, config, from, now, 0);
    const nextCursor: Cursor = { lastCreation: complete ? now.toISOString() : (last ?? from.toISOString()) };
    // completeListing = false : même complète, cette fenêtre ne permet pas de clore des annonces.
    return { items, nextCursor, complete };
  },

  externalId: (raw) => Offre.parse(raw).id,

  normalize(raw) {
    const o = Offre.parse(raw);
    const url = o.origineOffre?.urlOrigine?.startsWith("https://candidat.francetravail.fr")
      ? o.origineOffre.urlOrigine
      : `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(o.id)}`;
    const contract: ContractType | null = o.alternance
      ? "apprenticeship"
      : (CONTRACT[o.typeContrat ?? ""] ?? null);
    // D = débutant accepté ; E = expérience exigée ; S = souhaitée. L'intitulé précise la durée.
    const seniority: Seniority | null = o.experienceExige === "D" ? "junior" : null;
    const experience = o.experienceLibelle ? `\nExpérience : ${o.experienceLibelle} d'expérience` : "";
    return buildJob({
      externalId: o.id,
      url,
      applyUrl: url,
      title: o.intitule,
      companyName: o.entreprise?.nom ?? null,
      locationRaw: o.lieuTravail?.libelle ? `${o.lieuTravail.libelle}, France` : "France",
      country: "FR",
      descriptionText: `${o.description ?? ""}${experience}`,
      contractType: contract,
      seniority,
      salaryRaw: o.salaire?.libelle ?? null,
      tags: [o.romeLibelle, o.appellationlibelle].filter((t): t is string => Boolean(t)),
      publishedAt: o.dateCreation,
      sourceUpdatedAt: o.dateActualisation,
      raw,
    });
  },
});

/** Pour les tests : oublie le token en cache. */
export const resetFranceTravailToken = () => {
  token = null;
};
