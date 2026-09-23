import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createApplicationForCluster, logApplicationEvent } from "../applications/service";
import { getDb } from "../db/client";
import { applications, jobClusters, jobs, llmScores } from "../db/schema";
import { DomainError } from "../domain/action-result";
import { contractLabel, remotePolicyLabel } from "../domain/labels";
import { errorMessage } from "../logger";
import { CANDIDATE, loadCv } from "../profile";
import { getAnthropic, isTransientLlmError } from "../scoring/anthropic";
import {
  COVER_LETTER_PROMPT_VERSION,
  outreachModel,
  PROMPT_VERSION,
  scoringModel,
  WRITING_REQUEST,
} from "../scoring/config";
import { loadPrompt, render } from "../scoring/prompt";

const Letter = z.object({
  subject: z.string(),
  body: z.string(),
  talking_points: z.array(z.string()),
  gaps: z.array(z.string()),
});

/** Le prompt ne voit qu'un extrait : au-delà, l'annonce répète les mêmes éléments. */
const MAX_DESCRIPTION_CHARS = 12_000;

export interface CoverLetterResult {
  applicationId: string;
  subject: string;
  body: string;
  talkingPoints: string[];
  gaps: string[];
}

/**
 * Rédige la lettre de motivation d'une offre et la range dans le brouillon de sa candidature
 * (créée au statut « à postuler » si elle n'existe pas encore). Relancer écrase le brouillon.
 */
export async function generateCoverLetter(clusterId: string, extra?: string): Promise<CoverLetterResult> {
  const client = getAnthropic();
  if (!client) throw new DomainError("VALIDATION", "ANTHROPIC_API_KEY absente : génération indisponible");
  const db = getDb();
  const [row] = await db
    .select({
      title: jobs.title,
      company: jobs.companyNameRaw,
      location: jobs.locationRaw,
      description: jobs.descriptionText,
      remotePolicy: jobs.remotePolicy,
      contractType: jobs.contractType,
      salaryRaw: jobs.salaryRaw,
      hook: llmScores.hook,
    })
    .from(jobClusters)
    .innerJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .leftJoin(
      llmScores,
      and(
        eq(llmScores.contentHash, jobs.contentHash),
        eq(llmScores.promptVersion, PROMPT_VERSION),
        eq(llmScores.model, scoringModel()),
      ),
    )
    .where(eq(jobClusters.id, clusterId));
  if (!row) throw new DomainError("NOT_FOUND", "Offre inconnue");
  if (row.description.trim().length < 200)
    throw new DomainError("VALIDATION", "Description trop courte pour écrire une lettre honnête");

  const prompt = loadPrompt(COVER_LETTER_PROMPT_VERSION);
  let letter: z.infer<typeof Letter>;
  try {
    const res = await client.messages.parse({
      model: outreachModel(),
      max_tokens: WRITING_REQUEST.max_tokens,
      system: render(prompt.system, {
        CV: loadCv(),
        SIGNATURE: `${CANDIDATE.name} — ${CANDIDATE.website} — ${CANDIDATE.email}`,
      }),
      messages: [
        {
          role: "user",
          content: render(prompt.user, {
            title: row.title,
            company: row.company ?? "entreprise non nommée dans l'annonce",
            location: row.location ?? "non précisé",
            remote_policy: remotePolicyLabel[row.remotePolicy],
            contract_type: contractLabel[row.contractType],
            salary: row.salaryRaw ?? "non communiqué",
            hook: row.hook ?? "(aucun, appuie-toi sur le texte de l'offre)",
            description: row.description.slice(0, MAX_DESCRIPTION_CHARS),
            extra: extra?.trim() || "aucune",
          }),
        },
      ],
      output_config: { format: zodOutputFormat(Letter), effort: WRITING_REQUEST.effort },
    });
    const parsed = Letter.safeParse(res.parsed_output);
    if (!parsed.success) throw new DomainError("UPSTREAM", "Lettre inexploitable, réessaie");
    letter = parsed.data;
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError(
      isTransientLlmError(err) ? "UPSTREAM" : "INTERNAL",
      `Génération impossible : ${errorMessage(err)}`,
    );
  }

  const [existing] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.clusterId, clusterId));
  const applicationId = existing?.id ?? (await createApplicationForCluster(clusterId, "to_apply")).id;
  const subject = letter.subject.trim();
  const body = letter.body.trim();
  await db
    .update(applications)
    .set({ draftSubject: subject, draftBody: body })
    .where(eq(applications.id, applicationId));
  await logApplicationEvent(applicationId, { type: "note", note: "Lettre de motivation générée" });
  return { applicationId, subject, body, talkingPoints: letter.talking_points, gaps: letter.gaps };
}

/** Enregistre la lettre corrigée à la main. */
export async function saveCoverLetter(applicationId: string, subject: string, body: string): Promise<void> {
  const res = await getDb()
    .update(applications)
    .set({ draftSubject: subject, draftBody: body })
    .where(and(eq(applications.id, applicationId), eq(applications.kind, "job")))
    .returning({ id: applications.id });
  if (res.length === 0) throw new DomainError("NOT_FOUND", "Candidature inconnue");
}
