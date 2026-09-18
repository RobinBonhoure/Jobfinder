import type { ContractType, RemotePolicy, RemoteScope, Seniority } from "../domain/enums";
import { fold, normalizeCompanyName } from "../normalize/text";
import type { FilterCriteria } from "../profile";

export interface FilterInput {
  title: string;
  descriptionText: string;
  companyName: string | null;
  locationRaw: string | null;
  remotePolicy: RemotePolicy;
  remoteScope: RemoteScope;
  contractType: ContractType;
  seniority: Seniority;
}

export interface FilterResult {
  status: "passed" | "rejected";
  /** Codes de rejet : `rule:detail`. */
  reasons: string[];
  /** Signaux non bloquants, à vérifier par le LLM ou par Robin. */
  flags: string[];
  /** Pré-score déterministe 0-100, utilisé pour trier tant qu'aucun score LLM n'existe. */
  ruleScore: number;
  matchedStack: string[];
}

const compiled = new WeakMap<FilterCriteria, Record<string, RegExp[]>>();

function regexes(c: FilterCriteria): Record<string, RegExp[]> {
  let r = compiled.get(c);
  if (!r) {
    const mk = (list: string[]) => list.map((p) => new RegExp(p, "i"));
    r = {
      role: mk(c.roleTitlePatterns),
      required: mk(c.requiredStack),
      preferred: mk(c.preferredStack),
      titleEx: mk(c.titleExclusions),
      descEx: mk(c.descriptionExclusions),
      seniorityEx: mk(c.seniorityTitleExclusions),
      local: mk(c.localLocations),
    };
    compiled.set(c, r);
  }
  return r;
}

/** Hybride ou présentiel accepté parce que localisé près de chez Robin. */
export const HYBRID_LOCAL_FLAG = "remote:hybrid_local";

const EXCLUDED_CONTRACTS: ReadonlySet<ContractType> = new Set([
  "internship",
  "apprenticeship",
  "freelance",
  "cdd",
]);

/**
 * Filtre déterministe (PLAN §7.1) : ne rejette que l'explicite. Les cas ambigus passent avec un flag.
 * `advisory` : les raisons sont calculées mais l'offre passe quand même (capture manuelle, repêchage).
 */
export function evaluateJob(
  job: FilterInput,
  criteria: FilterCriteria,
  opts: { advisory?: boolean } = {},
): FilterResult {
  const rx = regexes(criteria);
  const title = fold(job.title);
  const body = fold(job.descriptionText);
  const all = `${title}\n${body}`;
  const reasons: string[] = [];
  const flags: string[] = [];

  if (EXCLUDED_CONTRACTS.has(job.contractType)) reasons.push(`contract:${job.contractType}`);
  if (job.contractType === "unknown") flags.push("contract:unknown");

  // Hybride/présentiel : rejeté, sauf près de chez Robin (signalé, classé sous le full remote).
  const isLocal = Boolean(job.locationRaw && rx.local?.some((re) => re.test(fold(job.locationRaw ?? ""))));
  if (job.remotePolicy === "hybrid" || job.remotePolicy === "onsite") {
    if (isLocal) flags.push(HYBRID_LOCAL_FLAG);
    else reasons.push(`remote:${job.remotePolicy}`);
  }
  if (job.remotePolicy === "unknown") flags.push("remote:unknown");

  if (criteria.rejectRemoteScopes.includes(job.remoteScope)) reasons.push(`geo:${job.remoteScope}`);
  if (job.remoteScope === "europe" || job.remoteScope === "worldwide") flags.push("geo:check_french_entity");

  if (!rx.role?.some((re) => re.test(title))) reasons.push("role:not_dev");

  const titleEx = rx.titleEx?.find((re) => re.test(title));
  if (titleEx) reasons.push(`stack_exclusion:${titleEx.source}`);

  const matchedStack = (rx.required ?? []).filter((re) => re.test(all)).map((re) => re.source);
  if (matchedStack.length === 0) reasons.push("stack_required:none");

  const seniorityEx = rx.seniorityEx?.find((re) => re.test(title));
  if (seniorityEx) reasons.push(`seniority:${seniorityEx.source}`);

  if (job.companyName) {
    const norm = normalizeCompanyName(job.companyName);
    const hit = criteria.companyExclusions.find((c) => normalizeCompanyName(c) === norm);
    if (hit) reasons.push(`company_exclusion:${hit}`);
  }

  // Pré-score.
  let score = 40;
  score += Math.min(matchedStack.length, 4) * 8;
  score += Math.min((rx.preferred ?? []).filter((re) => re.test(all)).length, 2) * 5;
  if (job.remotePolicy === "full_remote") score += 15;
  if (job.remoteScope === "france") score += 5;
  // Idéal : full remote chez un employeur toulousain.
  if (isLocal && job.remotePolicy !== "hybrid" && job.remotePolicy !== "onsite") score += 5;
  if (job.contractType === "cdi") score += 5;
  if (job.seniority === "senior" || job.seniority === "lead") score += 8;
  else if (job.seniority === "mid") score += 3;
  else if (job.seniority === "junior") score -= 15;
  score -= Math.min((rx.descEx ?? []).filter((re) => re.test(body)).length, 4) * 5;
  const ruleScore = Math.max(0, Math.min(100, score));

  const rejected = reasons.length > 0 && !opts.advisory;
  return { status: rejected ? "rejected" : "passed", reasons, flags, ruleScore, matchedStack };
}
