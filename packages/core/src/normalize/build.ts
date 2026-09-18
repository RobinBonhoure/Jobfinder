import type { ContractType, RemotePolicy, RemoteScope, Seniority } from "../domain/enums";
import { NormalizedJob, type SalaryRange } from "../domain/job";
import { detectContract, detectSeniority } from "./contract";
import { countryCodeFrom, detectRemoteScope, resolveRemotePolicy } from "./remote";
import { parseSalary } from "./salary";
import { normalizeWhitespace } from "./text";

/** Ce qu'un adaptateur sait extraire directement ; le reste est déduit ici. */
export interface JobDraft {
  externalId: string;
  url: string;
  applyUrl?: string | null;
  title: string;
  companyName?: string | null;
  locationRaw?: string | null;
  country?: string | null;
  descriptionText: string;
  remotePolicy?: RemotePolicy | null;
  remoteScope?: RemoteScope | null;
  contractType?: ContractType | null;
  seniority?: Seniority | null;
  salary?: SalaryRange | null;
  salaryRaw?: string | null;
  tags?: string[];
  publishedAt?: Date | string | number | null;
  sourceUpdatedAt?: Date | string | number | null;
  raw: unknown;
}

function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const nonEmpty = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/**
 * Point de passage unique des adaptateurs : complète les champs manquants avec les heuristiques
 * partagées, puis valide le résultat contre le contrat NormalizedJob.
 */
export function buildJob(draft: JobDraft): NormalizedJob {
  const description = normalizeWhitespace(draft.descriptionText ?? "");
  const title = normalizeWhitespace(draft.title);
  const location = nonEmpty(draft.locationRaw);
  const context = `${title}\n${location ?? ""}\n${description}`;

  const contract =
    draft.contractType && draft.contractType !== "unknown"
      ? draft.contractType
      : detectContract(title, description);
  const seniority =
    draft.seniority && draft.seniority !== "unknown" ? draft.seniority : detectSeniority(title, description);
  const scope =
    draft.remoteScope && draft.remoteScope !== "unknown"
      ? draft.remoteScope
      : detectRemoteScope(location, `${title}\n${description}`);

  return NormalizedJob.parse({
    externalId: String(draft.externalId),
    url: draft.url,
    applyUrl: nonEmpty(draft.applyUrl) ?? null,
    title,
    companyName: nonEmpty(draft.companyName),
    locationRaw: location,
    countryCode: countryCodeFrom(draft.country) ?? countryCodeFrom(location?.split(",").at(-1)),
    remotePolicy: resolveRemotePolicy(draft.remotePolicy, context),
    remoteScope: scope,
    contractType: contract,
    seniority,
    salary: draft.salary ?? parseSalary(draft.salaryRaw),
    descriptionText: description,
    tags: draft.tags ?? [],
    publishedAt: toDate(draft.publishedAt),
    sourceUpdatedAt: toDate(draft.sourceUpdatedAt),
    raw: draft.raw,
  });
}
