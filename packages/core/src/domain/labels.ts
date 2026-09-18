import type {
  ApplicationStatus,
  ContractType,
  OutreachStatus,
  RemotePolicy,
  RemoteVerdict,
  SourceKind,
  TriageStatus,
} from "./enums";

export const applicationStatusLabel: Record<ApplicationStatus, string> = {
  to_apply: "À postuler",
  applied: "Postulé",
  followed_up: "Relancé",
  interview: "Entretien",
  offer: "Offre",
  rejected: "Refus",
  withdrawn: "Retiré",
  ghosted: "Sans réponse",
};

export const triageLabel: Record<TriageStatus, string> = {
  new: "Nouveau",
  interested: "Intéressé",
  dismissed: "Écarté",
  applied: "Postulé",
};

export const remotePolicyLabel: Record<RemotePolicy, string> = {
  full_remote: "Full remote",
  hybrid: "Hybride",
  onsite: "Sur site",
  unknown: "Remote ?",
};

export const contractLabel: Record<ContractType, string> = {
  cdi: "CDI",
  cdd: "CDD",
  freelance: "Freelance",
  internship: "Stage",
  apprenticeship: "Alternance",
  other: "Autre",
  unknown: "Contrat ?",
};

export const remoteVerdictLabel: Record<RemoteVerdict, string> = {
  full_remote_france_ok: "Full remote France OK",
  hybrid_or_onsite: "Hybride / sur site",
  remote_but_geo_incompatible: "Remote hors zone",
  unclear: "Remote incertain",
};

export const sourceKindLabel: Record<SourceKind, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  recruitee: "Recruitee",
  teamtailor: "Teamtailor",
  france_travail: "France Travail",
  jobicy: "Jobicy",
  capture: "Capture",
};

export const outreachStatusLabel: Record<OutreachStatus, string> = {
  none: "—",
  to_contact: "À contacter",
  contacted: "Contacté",
  replied: "Réponse",
  closed: "Clos",
};

const FLAG_LABELS: Record<string, string> = {
  "remote:unknown": "remote non précisé",
  "contract:unknown": "contrat non précisé",
  "geo:check_french_entity": "vérifier la possibilité d'un CDI en France",
};

export const filterFlagLabel = (code: string) => FLAG_LABELS[code] ?? code;

/** Libellés lisibles des codes de filtre (`contract:internship` → texte). */
export function filterReasonLabel(code: string): string {
  const [rule, detail] = code.split(":");
  const map: Record<string, string> = {
    contract: "Contrat exclu",
    remote: "Pas full remote",
    geo: "Zone géographique",
    role: "Pas un poste de dev",
    stack_exclusion: "Techno exclue dans le titre",
    stack_required: "Aucune techno cible",
    seniority: "Séniorité exclue",
    company_exclusion: "Entreprise exclue",
    llm: "Verdict LLM",
  };
  return `${map[rule ?? ""] ?? rule}${detail ? ` (${detail})` : ""}`;
}
