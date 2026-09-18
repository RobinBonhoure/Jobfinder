import type { AtsKind } from "./registry";

export interface DetectedAts {
  kind: AtsKind;
  config: Record<string, string>;
  /** Identifiant stable proposé pour la table sources. */
  sourceId: string;
  /** Slug de l'entreprise tel que l'ATS le connaît (sert de nom par défaut). */
  slug: string;
}

const slugOk = (s: string | undefined): s is string => Boolean(s && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s));

/** Reconnaît un fournisseur ATS à partir d'une URL de page carrières ou d'offre. */
export function detectAtsFromUrl(input: string): DetectedAts | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const seg = url.pathname.split("/").filter(Boolean);
  const first = seg[0];

  if (/(^|\.)greenhouse\.io$/.test(host)) {
    // boards.greenhouse.io/{token}, job-boards(.eu).greenhouse.io/{token}, boards-api…/v1/boards/{token}
    const token = host.startsWith("boards-api.") ? seg[2] : (url.searchParams.get("for") ?? first);
    if (slugOk(token) && token !== "embed") return ats("greenhouse", { token }, token);
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    if (slugOk(first))
      return ats("lever", { company: first, region: host.includes(".eu.") ? "eu" : "global" }, first);
  }
  if (host === "jobs.ashbyhq.com" && slugOk(first)) return ats("ashby", { name: first }, first);
  if (host.endsWith(".recruitee.com")) {
    const sub = host.replace(".recruitee.com", "");
    if (slugOk(sub) && sub !== "www" && sub !== "api") return ats("recruitee", { company: sub }, sub);
  }
  if (host.endsWith(".teamtailor.com")) {
    const sub = host.replace(".teamtailor.com", "");
    if (slugOk(sub) && sub !== "www" && sub !== "app") {
      return ats("teamtailor", { feedUrl: `https://${host}/jobs.rss` }, sub);
    }
  }
  if ((host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") && slugOk(first)) {
    return ats("smartrecruiters", { company: first }, first);
  }
  return null;
}

function ats(kind: AtsKind, config: Record<string, string>, slug: string): DetectedAts {
  return { kind, config, slug, sourceId: `${kind}:${slug.toLowerCase()}` };
}

/**
 * Cherche des liens ATS dans le HTML d'une page carrières maison (liens, iframes, scripts d'intégration).
 * Pour Teamtailor sur domaine personnalisé, on repère la mention de Teamtailor et on propose /jobs.rss.
 */
export function findAtsInHtml(html: string, pageUrl: string): DetectedAts[] {
  const found = new Map<string, DetectedAts>();
  const urlRe = /https?:\/\/[^\s"'<>)]+/g;
  for (const m of html.matchAll(urlRe)) {
    const d = detectAtsFromUrl(m[0]);
    if (d) found.set(d.sourceId, d);
  }
  const gh = html.match(/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([A-Za-z0-9_-]+)/);
  if (gh?.[1]) {
    const d = ats("greenhouse", { token: gh[1] }, gh[1]);
    found.set(d.sourceId, d);
  }
  if (found.size === 0 && /teamtailor/i.test(html)) {
    try {
      const origin = new URL(pageUrl).origin;
      const slug =
        new URL(pageUrl).hostname.replace(/^www\.|^careers?\.|^jobs\./, "").split(".")[0] ?? "teamtailor";
      const d = ats("teamtailor", { feedUrl: `${origin}/jobs.rss` }, slug);
      found.set(d.sourceId, d);
    } catch {
      // URL de page invalide : rien à proposer.
    }
  }
  return [...found.values()];
}
