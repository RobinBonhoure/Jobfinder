import { resolve4, resolveMx } from "node:dns/promises";
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { companies, contacts } from "../db/schema";
import { DomainError } from "../domain/action-result";
import type { ConsentBasis, ContactKind } from "../domain/enums";
import { HttpClient, HttpError } from "../http/client";
import { errorMessage, logger } from "../logger";
import { htmlToText } from "../normalize/text";
import { extractGenericEmails, findCandidatePages, robotsDisallows } from "./extract";

const log = logger.child("contacts");
const MAX_PAGES = 6;
const FALLBACK_PATHS = ["/contact", "/mentions-legales", "/careers", "/jobs", "/recrutement", "/legal"];

export interface MxResult {
  valid: boolean;
  /** true si seul un enregistrement A existe (repli RFC 5321, douteux). */
  fallbackA: boolean;
}

export async function checkMx(domain: string): Promise<MxResult> {
  try {
    const mx = await resolveMx(domain);
    if (mx.length > 0) return { valid: true, fallbackA: false };
  } catch {
    // pas de MX : on tente le repli A
  }
  try {
    const a = await resolve4(domain);
    return { valid: a.length > 0, fallbackA: a.length > 0 };
  } catch {
    return { valid: false, fallbackA: false };
  }
}

export interface DiscoveryResult {
  pagesVisited: string[];
  found: string[];
  added: string[];
  blockedByRobots: string[];
  /** Texte des pages visitées, réutilisé pour personnaliser le brouillon (6 000 caractères max). */
  siteExcerpt: string;
}

/** Crawl borné et manuel du site officiel (PLAN §9.2). */
export async function discoverContacts(companyId: string): Promise<DiscoveryResult> {
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new DomainError("NOT_FOUND", "Entreprise inconnue");
  if (!company.domain) throw new DomainError("VALIDATION", "Renseigne d'abord le site web de l'entreprise");
  const origin = `https://${company.domain}`;
  const http = new HttpClient(1000);
  const result: DiscoveryResult = {
    pagesVisited: [],
    found: [],
    added: [],
    blockedByRobots: [],
    siteExcerpt: "",
  };

  let robots = "";
  try {
    robots = await http.getText(`${origin}/robots.txt`, { retries: 0, acceptStatus: [404, 403, 410] });
  } catch {
    robots = "";
  }
  const allowed = (url: string) => {
    const path = new URL(url).pathname;
    if (robotsDisallows(robots, path)) {
      result.blockedByRobots.push(url);
      return false;
    }
    return true;
  };

  const seen = new Set<string>();
  const pageKey = (url: string) => {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  };
  const fetchPage = async (url: string): Promise<string | null> => {
    if (result.pagesVisited.length >= MAX_PAGES || seen.has(pageKey(url)) || !allowed(url)) return null;
    seen.add(pageKey(url));
    result.pagesVisited.push(url);
    try {
      return await http.getText(url, { retries: 1, headers: { accept: "text/html" }, timeoutMs: 15_000 });
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 404))
        log.debug("page ignorée", { url, error: errorMessage(err) });
      return null;
    }
  };

  const found = new Set<string>();
  const excerpts: string[] = [];
  const home = await fetchPage(`${origin}/`);
  if (home === null && result.pagesVisited.length === 0) {
    throw new DomainError("UPSTREAM", "Site injoignable ou interdit par robots.txt");
  }
  const queue: string[] = [];
  if (home) {
    for (const e of extractGenericEmails(home, company.domain)) found.add(e);
    excerpts.push(htmlToText(home));
    queue.push(...findCandidatePages(home, origin));
  }
  if (queue.length === 0) queue.push(...FALLBACK_PATHS.map((p) => `${origin}${p}`));
  for (const url of queue) {
    if (result.pagesVisited.length >= MAX_PAGES) break;
    const html = await fetchPage(url);
    if (!html) continue;
    for (const e of extractGenericEmails(html, company.domain)) found.add(e);
    if (/careers?|carrieres?|jobs?|rejoindre|about|a-propos/i.test(url)) excerpts.push(htmlToText(html));
  }

  result.found = [...found];
  const mx = await checkMx(company.domain);
  for (const email of result.found) {
    const inserted = await db
      .insert(contacts)
      .values({
        companyId,
        email,
        kind: "generic",
        label: "Adresse générique du site",
        source: `crawl:${result.pagesVisited.find((u) => u) ?? origin}`,
        consentBasis: "b2b_legitimate_interest",
        mxValid: mx.valid && !mx.fallbackA,
        mxCheckedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: contacts.id });
    if (inserted.length) result.added.push(email);
  }
  result.siteExcerpt = excerpts.join("\n\n").slice(0, 6000);
  return result;
}

export const ManualContactInput = z.object({
  companyId: z.uuid(),
  email: z.email(),
  kind: z.enum(["generic", "personal"]),
  label: z.string().max(200).default(""),
  sourceNote: z.string().min(3, "Indique d'où vient ce contact (obligation RGPD)").max(500),
});

/** Saisie manuelle : seul point d'entrée des contacts nominatifs. */
export async function addManualContact(input: z.infer<typeof ManualContactInput>) {
  const domain = input.email.split("@")[1] ?? "";
  const mx = await checkMx(domain);
  if (!mx.valid)
    throw new DomainError("VALIDATION", `Le domaine ${domain} ne reçoit pas d'emails (aucun MX/A)`);
  const kind: ContactKind = input.kind;
  const consentBasis: ConsentBasis =
    kind === "generic" ? "b2b_legitimate_interest" : "legitimate_interest_candidate";
  const [row] = await getDb()
    .insert(contacts)
    .values({
      companyId: input.companyId,
      email: input.email.toLowerCase(),
      kind,
      label: input.label || null,
      source: `manual:${input.sourceNote}`,
      consentBasis,
      mxValid: !mx.fallbackA,
      mxCheckedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new DomainError("CONFLICT", "Ce contact existe déjà");
  return row;
}

export async function deleteContact(contactId: string) {
  await getDb().update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, contactId));
}

export async function optOutContact(contactId: string) {
  await getDb().update(contacts).set({ optedOutAt: new Date() }).where(eq(contacts.id, contactId));
}

/** Purge physique des champs identifiants des contacts supprimés depuis plus de 30 jours. */
export async function purgeDeletedContacts(): Promise<number> {
  const rows = await getDb()
    .update(contacts)
    .set({ email: null, label: null })
    .where(
      and(
        isNotNull(contacts.deletedAt),
        lt(contacts.deletedAt, sql`now() - interval '30 days'`),
        isNotNull(contacts.email),
      ),
    )
    .returning({ id: contacts.id });
  return rows.length;
}

/** Fin de recherche : suppression définitive de tous les contacts. */
export async function purgeAllContacts(): Promise<number> {
  const rows = await getDb().delete(contacts).returning({ id: contacts.id });
  return rows.length;
}

export async function activeContact(contactId: string) {
  const [row] = await getDb()
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
  return row ?? null;
}
