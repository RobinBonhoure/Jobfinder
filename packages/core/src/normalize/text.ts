import { parseHTML } from "linkedom";

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Décode les entités HTML courantes (Greenhouse renvoie un HTML échappé). */
export function decodeEntities(input: string): string {
  return input
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#x27);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));
}

// Saut de ligne après la fermeture d'un bloc (et sur <br>), pas à l'ouverture : évite les lignes vides en série.
const BLOCK_TAGS = /<\/(?:p|div|li|ul|ol|h[1-6]|tr|section|article|blockquote)\s*>|<br\s*\/?>/gi;

/** HTML → texte brut lisible (retours à la ligne sur les blocs). */
export function htmlToText(html: string): string {
  if (!html) return "";
  let source = html;
  // HTML doublement échappé (Greenhouse) : on décode d'abord si aucune balise réelle n'est présente.
  if (!/<[a-z]/i.test(source) && /&lt;[a-z]/i.test(source)) source = decodeEntities(source);
  const withBreaks = source.replace(BLOCK_TAGS, (tag) => `${tag}\n`);
  const { document } = parseHTML(`<!doctype html><html><body>${withBreaks}</body></html>`);
  for (const el of document.querySelectorAll("script,style")) el.remove();
  const text = document.body?.textContent ?? "";
  return normalizeWhitespace(decodeEntities(text));
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[\t\f\v    ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Forme de comparaison : minuscules, sans accents, ponctuation → espace. */
export function fold(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TITLE_NOISE = [
  /\((?:h|f)\s*[/|]\s*(?:f|h)(?:\s*[/|]\s*[a-z]+)?\)/gi, // (H/F), (F/H/X)
  /\b(?:h|f)\s*[/|]\s*(?:f|h)(?:\s*[/|]\s*[a-z]+)?\b/gi, // H/F sans parenthèses
  /\((?:m|w)\s*[/|]\s*(?:w|m)(?:\s*[/|]\s*d)?\)/gi, // (m/w/d)
  /[-–—|/]\s*(?:cdi|full[\s-]?remote|remote|télétravail|teletravail)\s*$/gi,
  /\((?:cdi|full[\s-]?remote|remote)\)/gi,
  /[\u{1F1E6}-\u{1F1FF}]/gu, // drapeaux
];

/** Titre normalisé pour la dédup. Garde les marqueurs de séniorité (ADR-003). */
export function normalizeTitle(title: string): string {
  let t = title;
  for (const re of TITLE_NOISE) t = t.replace(re, " ");
  return fold(t)
    .replace(/\bfront end\b/g, "frontend")
    .replace(/\bfull stack\b/g, "fullstack")
    .replace(/\bback end\b/g, "backend")
    .replace(/\bdevelopp?(?:eur|euse)(?: euse| se)?\b|\bdevelopper\b/g, "developpeur")
    .replace(/\bnext js\b|\bnextjs\b/g, "next.js")
    .replace(/\s+/g, " ")
    .trim();
}

const LEGAL_FORMS =
  /\b(sas|sasu|sarl|eurl|sa|sca|snc|scop|inc|llc|ltd|limited|gmbh|ag|bv|nv|plc|corp|corporation|co|group|groupe|france)\b/g;

export function normalizeCompanyName(name: string): string {
  return fold(name).replace(/\./g, " ").replace(LEGAL_FORMS, " ").replace(/\s+/g, " ").trim();
}
