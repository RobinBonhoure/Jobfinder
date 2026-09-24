import type { ContractType, ContractVerdict, RemotePolicy, RemoteVerdict } from "./enums";
import { contractLabel, remotePolicyLabel, remoteVerdictLabel } from "./labels";

/** Niveau lisible d'un score 0-100 (mêmes seuils partout dans l'UI). */
export type ScoreLevel = "excellent" | "good" | "fair" | "weak";

export function scoreLevel(score: number): ScoreLevel {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 50) return "fair";
  return "weak";
}

export const scoreLevelLabel: Record<ScoreLevel, string> = {
  excellent: "Excellent",
  good: "Bon",
  fair: "Moyen",
  weak: "Faible",
};

/** Un fait clé d'une offre et son adéquation aux critères (CDI, full remote France). */
export type FactTone = "good" | "warn" | "bad";
export interface Fact {
  label: string;
  tone: FactTone;
}

/** Contrat : le verdict LLM prime sur l'heuristique quand il tranche. */
export function contractFact(type: ContractType, verdict?: ContractVerdict | null): Fact {
  if (verdict === "not_cdi")
    return { label: type === "cdi" || type === "unknown" ? "Pas un CDI" : contractLabel[type], tone: "bad" };
  if (type === "cdi" || verdict === "cdi") return { label: contractLabel.cdi, tone: "good" };
  if (type === "unknown") return { label: "Contrat non précisé", tone: "warn" };
  return { label: contractLabel[type], tone: "bad" };
}

/** Télétravail : le verdict LLM (qui tient compte de la zone) prime sur la politique déclarée. */
export function remoteFact(policy: RemotePolicy, verdict?: RemoteVerdict | null): Fact {
  if (verdict) {
    const tone: FactTone =
      verdict === "full_remote_france_ok" ? "good" : verdict === "unclear" ? "warn" : "bad";
    // « OK » n'apporte rien dans une fiche : la couleur dit déjà que c'est conforme.
    const label = verdict === "full_remote_france_ok" ? "Full remote France" : remoteVerdictLabel[verdict];
    return { label, tone };
  }
  const tone: FactTone = policy === "full_remote" ? "good" : policy === "unknown" ? "warn" : "bad";
  return { label: remotePolicyLabel[policy], tone };
}
