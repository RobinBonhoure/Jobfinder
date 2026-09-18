import { z } from "zod";
import { DomainError } from "../domain/action-result";
import { HttpClient } from "../http/client";
import { errorMessage } from "../logger";

// API Recherche d'entreprises (data.gouv) : gratuite, sans authentification, 7 req/s par IP.
const BASE = "https://recherche-entreprises.api.gouv.fr/search";

const Result = z.looseObject({
  siren: z.string(),
  nom_complet: z.string(),
  nombre_etablissements_ouverts: z.number().nullish(),
  tranche_effectif_salarie: z.string().nullish(),
  date_creation: z.string().nullish(),
  siege: z
    .looseObject({
      activite_principale: z.string().nullish(),
      activite_principale_naf25: z.string().nullish(),
      adresse: z.string().nullish(),
      libelle_commune: z.string().nullish(),
      code_postal: z.string().nullish(),
      etat_administratif: z.string().nullish(),
    })
    .nullish(),
});

export interface CompanySearchHit {
  siren: string;
  name: string;
  nafCode: string | null;
  naf25Code: string | null;
  headcountRange: string | null;
  city: string | null;
  address: string | null;
  createdOn: string | null;
}

export const SearchCompaniesInput = z.object({
  q: z.string().max(200).optional(),
  naf: z.string().max(40).optional(),
  headcount: z.string().max(40).optional(),
  departement: z.string().max(40).optional(),
  page: z.number().int().min(1).max(20).default(1),
});

/** Libellés des tranches d'effectif INSEE les plus utiles. */
export const HEADCOUNT_LABELS: Record<string, string> = {
  "11": "10-19",
  "12": "20-49",
  "21": "50-99",
  "22": "100-199",
  "31": "200-249",
  "32": "250-499",
  "41": "500-999",
  "42": "1000-1999",
};

const http = new HttpClient(200);

/** Recherche/enrichissement (PLAN §9.1) ; ne renvoie ni site web ni email. */
export async function searchCompanies(
  input: z.infer<typeof SearchCompaniesInput>,
): Promise<CompanySearchHit[]> {
  const params = new URLSearchParams({ per_page: "25", page: String(input.page), etat_administratif: "A" });
  if (input.q) params.set("q", input.q);
  if (input.naf) params.set("activite_principale", input.naf);
  if (input.headcount) params.set("tranche_effectif_salarie", input.headcount);
  if (input.departement) params.set("departement", input.departement);
  if (!input.q && !input.naf) throw new DomainError("VALIDATION", "Indique un nom ou un code NAF");
  let data: { results?: unknown[] };
  try {
    data = await http.getJson(`${BASE}?${params}`, { retries: 2 });
  } catch (err) {
    throw new DomainError("UPSTREAM", `Recherche d'entreprises indisponible : ${errorMessage(err)}`);
  }
  return (data.results ?? []).flatMap((raw) => {
    const r = Result.safeParse(raw);
    if (!r.success) return [];
    const s = r.data.siege;
    return [
      {
        siren: r.data.siren,
        name: r.data.nom_complet,
        nafCode: s?.activite_principale ?? null,
        naf25Code: s?.activite_principale_naf25 ?? null,
        headcountRange: r.data.tranche_effectif_salarie ?? null,
        city: s?.libelle_commune ?? null,
        address: s?.adresse ?? null,
        createdOn: r.data.date_creation ?? null,
      },
    ];
  });
}
