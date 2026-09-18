import { parseHTML } from "linkedom";
import { z } from "zod";
import { decodeEntities } from "../normalize/text";

/** Parties locales acceptées : adresses génériques d'entreprise uniquement (PLAN §9.2, §11.1). */
export const GENERIC_LOCAL_PARTS = [
  "jobs",
  "job",
  "careers",
  "career",
  "carriere",
  "carrieres",
  "recrutement",
  "recruitment",
  "recruiting",
  "recrute",
  "talent",
  "talents",
  "rh",
  "hr",
  "contact",
  "hello",
  "bonjour",
  "info",
  "team",
] as const;

/** Ordre de préférence pour une candidature. */
const PRIORITY = [
  "jobs",
  "job",
  "recrutement",
  "recruitment",
  "recruiting",
  "recrute",
  "careers",
  "career",
  "carriere",
  "carrieres",
  "talent",
  "talents",
  "rh",
  "hr",
];

export function contactPriority(email: string): number {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const i = PRIORITY.indexOf(local);
  return i >= 0 ? i : PRIORITY.length;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EmailSchema = z.email();

/** Décode les obfuscations simples : « jobs [at] acme [dot] com ». */
export function deobfuscate(text: string): string {
  return text
    .replace(/\s*(?:\[|\(|\{)\s*(?:at|arobase)\s*(?:\]|\)|\})\s*/gi, "@")
    .replace(/\s*(?:\[|\(|\{)\s*(?:dot|point)\s*(?:\]|\)|\})\s*/gi, ".");
}

export function isSameDomain(email: string, domain: string): boolean {
  const host = email.split("@")[1]?.toLowerCase() ?? "";
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export function isGeneric(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return (GENERIC_LOCAL_PARTS as readonly string[]).includes(local);
}

/**
 * Emails génériques du domaine trouvés dans une page. Toute autre adresse (probablement nominative)
 * est écartée ici, avant tout stockage.
 */
export function extractGenericEmails(html: string, domain: string): string[] {
  const found = new Set<string>();
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  for (const a of document.querySelectorAll("a[href^='mailto:' i]")) {
    const href = a.getAttribute("href") ?? "";
    const addr = decodeURIComponent(href.replace(/^mailto:/i, "").split("?")[0] ?? "");
    for (const part of addr.split(",")) found.add(part.trim().toLowerCase());
  }
  const text = deobfuscate(decodeEntities(document.body?.textContent ?? ""));
  for (const m of text.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase().replace(/\.$/, ""));
  return [...found]
    .filter((e) => EmailSchema.safeParse(e).success)
    .filter((e) => isSameDomain(e, domain) && isGeneric(e))
    .sort((a, b) => contactPriority(a) - contactPriority(b));
}

const PAGE_HINT =
  /contact|mentions?-?legales?|legal|imprint|carrieres?|careers?|jobs?|recrutement|rejoindre|join|about|a-propos/i;

/** Liens internes intéressants d'une page d'accueil. */
export function findCandidatePages(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const out = new Set<string>();
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    const label = a.textContent ?? "";
    if (!PAGE_HINT.test(href) && !PAGE_HINT.test(label)) continue;
    try {
      const u = new URL(href, base);
      if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      if (!/^https?:$/.test(u.protocol)) continue;
      u.hash = "";
      out.add(u.toString());
    } catch {
      // lien invalide
    }
  }
  return [...out];
}

/** Interprétation minimale de robots.txt pour notre User-Agent et « * ». */
export function robotsDisallows(robots: string, path: string, agent = "jobhunt"): boolean {
  const groups: Array<{ agents: string[]; disallow: string[]; allow: string[] }> = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = (m[1] ?? "").toLowerCase();
    const value = (m[2] ?? "").trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value) current.disallow.push(value);
    if (key === "allow" && value) current.allow.push(value);
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const matches = (rule: string) => path.startsWith(rule.replace(/\*.*$/, ""));
  const longest = (rules: string[]) => Math.max(-1, ...rules.filter(matches).map((r) => r.length));
  const dis = Math.max(-1, ...applicable.map((g) => longest(g.disallow)));
  const allow = Math.max(-1, ...applicable.map((g) => longest(g.allow)));
  return dis >= 0 && dis >= allow;
}
