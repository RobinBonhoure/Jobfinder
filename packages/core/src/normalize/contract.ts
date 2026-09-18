import type { ContractType, Seniority } from "../domain/enums";
import { fold } from "./text";

const CONTRACT_RULES: Array<[ContractType, RegExp]> = [
  ["internship", /\b(?:stage|stagiaire|intern|internship|stage de fin d etudes)\b/],
  ["apprenticeship", /\b(?:alternance|alternant|apprenti|apprentissage|apprenticeship|work study)\b/],
  [
    "freelance",
    /\b(?:freelance|free lance|contractor|independant|portage salarial|mission de \d+ mois|tjm)\b/,
  ],
  ["cdd", /\b(?:cdd|contrat a duree determinee|fixed term|temporary contract)\b/],
  ["cdi", /\b(?:cdi|contrat a duree indeterminee|permanent contract|permanent position|permanent role)\b/],
];

/** Contrat déduit d'un texte libre (titre prioritaire, puis description). */
export function detectContract(title: string, text: string): ContractType {
  const t = fold(title);
  for (const [type, re] of CONTRACT_RULES) if (re.test(t)) return type;
  const body = fold(text);
  // Dans la description, on ne retient que les signaux forts, dans cet ordre.
  if (/\b(?:cdi|contrat a duree indeterminee|permanent contract)\b/.test(body)) return "cdi";
  for (const [type, re] of CONTRACT_RULES) if (type !== "cdi" && re.test(body)) return type;
  return "unknown";
}

/** Correspondance des libellés structurés fournis par les sources. */
export function contractFromLabel(label: string | null | undefined): ContractType {
  if (!label) return "unknown";
  const l = fold(label);
  if (/^cdi\b|permanent|fulltime permanent/.test(l)) return "cdi";
  if (/^cdd\b|fixed term|temporary|^mis\b|interim/.test(l)) return "cdd";
  if (/intern|stage/.test(l)) return "internship";
  if (/apprenti|alternance|work study/.test(l)) return "apprenticeship";
  // « Contract » seul est ambigu (Doctolib l'utilise pour des CDI sur Ashby) : seul l'explicite compte.
  if (/contractor|freelance|^lib\b|independant/.test(l)) return "freelance";
  return "unknown";
}

const SENIORITY_TITLE: Array<[Seniority, RegExp]> = [
  ["lead", /\b(?:lead|staff|principal|head of|architect|architecte|tech lead|engineering manager)\b/],
  ["senior", /\b(?:senior|sr|confirme|confirmee|experimente|experimentee|expert)\b/],
  ["junior", /\b(?:junior|jr|debutant|graduate|entry level)\b/],
  ["mid", /\b(?:mid|intermediate|medior)\b/],
];

export function detectSeniority(title: string, text: string): Seniority {
  const t = fold(title);
  for (const [level, re] of SENIORITY_TITLE) if (re.test(t)) return level;
  const body = fold(text);
  const years = body.match(
    /\b(\d{1,2}) ?(?:\+ ?)?(?:ans|an s|years?|yrs?)(?: minimum)? (?:d )?(?:experience|of experience)/,
  );
  if (years?.[1]) {
    const n = Number(years[1]);
    if (n >= 5) return "senior";
    if (n >= 2) return "mid";
    return "junior";
  }
  return "unknown";
}
