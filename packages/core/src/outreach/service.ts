import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { logApplicationEvent } from "../applications/service";
import { getDb } from "../db/client";
import { applications, companies, contacts } from "../db/schema";
import { DomainError } from "../domain/action-result";
import { nextActionFor } from "../domain/pipeline";
import { HttpClient } from "../http/client";
import { errorMessage } from "../logger";
import { htmlToText } from "../normalize/text";
import { CANDIDATE, loadCv } from "../profile";
import { getAnthropic, isTransientLlmError } from "../scoring/anthropic";
import { OUTREACH_PROMPT_VERSION, outreachModel } from "../scoring/config";
import { loadPrompt, render } from "../scoring/prompt";

const Draft = z.object({
  subject: z.string(),
  body: z.string(),
  personalization_points: z.array(z.string()),
});

/** Mention d'information RGPD ajoutée à tout message vers une personne physique (PLAN §11.1). */
export function privacyNotice(source: string): string {
  const origin = source.startsWith("manual:") ? source.slice("manual:".length) : source;
  return [
    "—",
    `Information : ${CANDIDATE.name} vous contacte à titre personnel, dans le cadre de sa recherche d'emploi.`,
    `Votre adresse provient de : ${origin}. Elle n'est utilisée que pour cette candidature et son suivi,`,
    `et sera supprimée à la fin de ma recherche. Sur simple réponse, je la supprime immédiatement.`,
  ].join("\n");
}

const signature = () => `${CANDIDATE.name} — ${CANDIDATE.website} — ${CANDIDATE.email}`;

/** Extrait du site : page d'accueil seulement (appel unique, déclenché par Robin). */
async function siteExcerpt(domain: string | null): Promise<string> {
  if (!domain) return "";
  try {
    const html = await new HttpClient().getText(`https://${domain}/`, {
      retries: 0,
      timeoutMs: 10_000,
      headers: { accept: "text/html" },
    });
    return htmlToText(html).slice(0, 6000);
  } catch {
    return "";
  }
}

/** Génère (ou régénère) le brouillon de candidature spontanée pour un contact. */
export async function generateOutreachDraft(companyId: string, contactId: string, excerpt?: string) {
  const client = getAnthropic();
  if (!client) throw new DomainError("VALIDATION", "ANTHROPIC_API_KEY absente : génération indisponible");
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw new DomainError("NOT_FOUND", "Entreprise inconnue");
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)));
  if (!contact || contact.deletedAt || !contact.email)
    throw new DomainError("NOT_FOUND", "Contact inconnu ou supprimé");
  if (contact.optedOutAt) throw new DomainError("CONFLICT", "Ce contact a demandé à ne plus être contacté");

  const prompt = loadPrompt(OUTREACH_PROMPT_VERSION);
  const text = excerpt ?? (await siteExcerpt(company.domain));
  let draft: z.infer<typeof Draft>;
  try {
    const res = await client.messages.parse({
      model: outreachModel(),
      max_tokens: 2048,
      system: render(prompt.system, { CV: loadCv(), SIGNATURE: signature() }),
      messages: [
        {
          role: "user",
          content: render(prompt.user, {
            company: company.name,
            website: company.website ?? "inconnu",
            notes: company.notes || "aucune",
            site_excerpt: text || "(aucun extrait disponible)",
            recipient:
              contact.kind === "personal"
                ? `${contact.label ?? "personne"} (${contact.email})`
                : contact.email,
          }),
        },
      ],
      output_config: { format: zodOutputFormat(Draft) },
    });
    const parsed = Draft.safeParse(res.parsed_output);
    if (!parsed.success) throw new DomainError("UPSTREAM", "Brouillon inexploitable, réessaie");
    draft = parsed.data;
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError(
      isTransientLlmError(err) ? "UPSTREAM" : "INTERNAL",
      `Génération impossible : ${errorMessage(err)}`,
    );
  }

  const body =
    contact.kind === "personal"
      ? `${draft.body.trim()}\n\n${privacyNotice(contact.source)}`
      : draft.body.trim();
  const [existing] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.companyId, companyId),
        eq(applications.kind, "spontaneous"),
        eq(applications.status, "to_apply"),
      ),
    )
    .orderBy(desc(applications.createdAt))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(applications)
      .set({ contactId, draftSubject: draft.subject, draftBody: body, channel: "email" })
      .where(eq(applications.id, existing.id))
      .returning();
    return { application: updated, personalization: draft.personalization_points };
  }
  const [created] = await db
    .insert(applications)
    .values({
      kind: "spontaneous",
      companyId,
      contactId,
      status: "to_apply",
      channel: "email",
      draftSubject: draft.subject,
      draftBody: body,
    })
    .returning();
  if (!created) throw new Error("création du brouillon impossible");
  await logApplicationEvent(created.id, {
    type: "status_change",
    toStatus: "to_apply",
    note: "Brouillon généré",
  });
  if (company.outreachStatus === "none") {
    await db.update(companies).set({ outreachStatus: "to_contact" }).where(eq(companies.id, companyId));
  }
  return { application: created, personalization: draft.personalization_points };
}

export async function saveOutreachDraft(applicationId: string, subject: string, body: string) {
  const res = await getDb()
    .update(applications)
    .set({ draftSubject: subject, draftBody: body })
    .where(and(eq(applications.id, applicationId), eq(applications.kind, "spontaneous")))
    .returning({ id: applications.id });
  if (res.length === 0) throw new DomainError("NOT_FOUND", "Brouillon inconnu");
}

/** Robin a envoyé le message depuis son client mail. */
export async function markOutreachSent(applicationId: string) {
  const db = getDb();
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  if (app?.kind !== "spontaneous") throw new DomainError("NOT_FOUND", "Candidature spontanée inconnue");
  const now = new Date();
  await db
    .update(applications)
    .set({ status: "applied", appliedAt: now, nextActionAt: nextActionFor("applied", now) })
    .where(eq(applications.id, applicationId));
  await logApplicationEvent(applicationId, { type: "sent", fromStatus: app.status, toStatus: "applied" });
  if (app.contactId) {
    await db
      .update(contacts)
      .set({ infoNoticeSentAt: now })
      .where(and(eq(contacts.id, app.contactId), eq(contacts.kind, "personal")));
  }
  if (app.companyId) {
    await db.update(companies).set({ outreachStatus: "contacted" }).where(eq(companies.id, app.companyId));
  }
}

export { mailtoLink } from "../domain/mail";
