import type { RemotePolicy, RemoteScope } from "../domain/enums";
import { fold } from "./text";

const FULL_REMOTE = [
  /\bfull[ -]?remote\b/,
  /\bfully remote\b/,
  /\b100 ?%? ?(?:remote|teletravail|en teletravail|a distance)\b/,
  /\bteletravail (?:total|complet|integral|a 100)\b/,
  /\bremote[ -]first\b/,
  /\bremote only\b/,
  /\bposte (?:en|a) (?:full )?teletravail\b/,
  /\bremote \(france\)|\bremote france\b|\bfrance remote\b/,
];

const HYBRID = [
  /\bhybride?\b/,
  /\b\d ?(?:jours?|j) (?:de |par semaine de )?(?:teletravail|remote)\b/,
  /\b\d ?(?:jours?|j) (?:par semaine )?(?:sur site|au bureau|en presentiel|de presentiel|dans nos locaux)\b/,
  /\bpresentiel (?:de )?\d ?(?:jours?|j)\b/,
  /\bpartial(?:ly)? remote\b/,
  /\bdays? (?:a week )?in (?:the )?office\b/,
  /\bin[ -]office \d\b/,
];

const ONSITE = [
  /\bsur site uniquement\b/,
  /\bpas de teletravail\b/,
  /\b100 ?%? ?presentiel\b/,
  /\bon[ -]?site only\b/,
  /\bno remote\b/,
  /\bpresentiel obligatoire\b/,
];

export function detectRemotePolicy(text: string): RemotePolicy {
  const t = fold(text);
  const full = FULL_REMOTE.some((re) => re.test(t));
  const hybrid = HYBRID.some((re) => re.test(t));
  const onsite = ONSITE.some((re) => re.test(t));
  if (onsite && !full) return "onsite";
  if (hybrid && !full) return "hybrid";
  if (full && !hybrid) return "full_remote";
  return "unknown";
}

/** Combine un indice structuré (s'il existe) et le texte : le structuré prime, sauf s'il est absent. */
export function resolveRemotePolicy(structured: RemotePolicy | null | undefined, text: string): RemotePolicy {
  if (structured && structured !== "unknown") return structured;
  return detectRemotePolicy(text);
}

const SCOPE_OTHER = [
  /\bus only\b/,
  /\busa only\b/,
  /\b(?:must|need to) (?:be )?(?:located|based|reside) in (?:the )?(?:us|usa|united states|canada|uk)\b/,
  /\b(?:pst|est|cst|mst|pacific time|eastern time)\b/,
  /\bremote (?:us|usa|canada|uk|latam|apac|india)\b/,
  /\b(?:us|usa|canada|latam|apac) remote\b/,
  /\bwork authorization in the (?:us|united states)\b/,
];
const SCOPE_FRANCE = [
  /\bfrance\b/,
  /\bile de france\b/,
  /\b(?:paris|toulouse|lyon|nantes|bordeaux|lille|marseille|montpellier|rennes|strasbourg|nice|grenoble|sophia antipolis|aix en provence|annecy|brest|caen|dijon|tours|angers|clermont ferrand|rouen|metz|nancy|la defense|boulogne billancourt|levallois)\b/,
  /^\d{2} [a-z]/, // format France Travail « 31 - TOULOUSE »
];
/** Localisations explicitement hors de France (pays, grandes villes étrangères). */
const SCOPE_FOREIGN =
  /\b(?:united states|usa|us|u s|united kingdom|uk|england|canada|germany|deutschland|spain|espana|italy|portugal|netherlands|belgium|belgique|switzerland|suisse|ireland|poland|romania|sweden|denmark|norway|finland|austria|czech|hungary|greece|israel|india|singapore|australia|brazil|brasil|mexico|argentina|japan|china|latam|apac|london|new york|nyc|san francisco|boston|seattle|austin|chicago|los angeles|denver|toronto|montreal|vancouver|berlin|munich|hamburg|madrid|barcelona|lisbon|amsterdam|dublin|stockholm|copenhagen|warsaw|prague|zurich|geneva|geneve|milan|brussels|bruxelles|tel aviv|bangalore|sydney|tokyo)\b/;
const SCOPE_EUROPE = [/\beurope\b/, /\beuropean union\b/, /\bemea\b/, /\b(?:cet|cest)\b/, /\beu\b/];
const SCOPE_WORLD = [/\banywhere\b/, /\bworldwide\b/, /\bglobal(?:ly)?\b/];

/**
 * Portée géographique. Une localisation précise prime sur le texte : « Remote - United States » ou « London »
 * donnent `other`, même si la description parle d'Europe. Une localisation inconnue ou générique (« Remote »)
 * laisse le texte trancher — et au pire `unknown`, que le LLM tranchera.
 */
export function detectRemoteScope(location: string | null, text: string): RemoteScope {
  const loc = fold(location ?? "");
  const body = fold(text);
  if (SCOPE_OTHER.some((re) => re.test(loc))) return "other";
  if (loc) {
    if (SCOPE_FRANCE.some((re) => re.test(loc))) return "france";
    if (SCOPE_EUROPE.some((re) => re.test(loc))) return "europe";
    if (SCOPE_FOREIGN.test(loc)) return "other";
    if (SCOPE_WORLD.some((re) => re.test(loc)) && !SCOPE_OTHER.some((re) => re.test(body)))
      return "worldwide";
  }
  if (SCOPE_OTHER.some((re) => re.test(body))) return "other";
  if (SCOPE_FRANCE.some((re) => re.test(body))) return "france";
  if (SCOPE_EUROPE.some((re) => re.test(body))) return "europe";
  if (SCOPE_WORLD.some((re) => re.test(body))) return "worldwide";
  return "unknown";
}

const COUNTRY_CODES: Record<string, string> = {
  france: "FR",
  germany: "DE",
  allemagne: "DE",
  spain: "ES",
  espagne: "ES",
  "united kingdom": "GB",
  "united states": "US",
  usa: "US",
  belgium: "BE",
  belgique: "BE",
  netherlands: "NL",
  "pays bas": "NL",
  switzerland: "CH",
  suisse: "CH",
  italy: "IT",
  italie: "IT",
  portugal: "PT",
  poland: "PL",
  canada: "CA",
  ireland: "IE",
};

export function countryCodeFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const f = fold(v);
  for (const [name, code] of Object.entries(COUNTRY_CODES)) {
    if (f === name || f.endsWith(` ${name}`)) return code;
  }
  return null;
}
