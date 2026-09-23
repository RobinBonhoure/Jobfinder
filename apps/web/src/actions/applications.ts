"use server";

import {
  addApplicationNote,
  createApplicationForCluster,
  createExternalApplication,
  deleteApplication,
  setNextAction,
  updateApplicationStatus,
} from "@jobhunt/core/applications";
import { type ActionResult, APPLICATION_STATUSES } from "@jobhunt/core/domain";
import { type CoverLetterResult, generateCoverLetter, saveCoverLetter } from "@jobhunt/core/outreach";
import { z } from "zod";
import { idSchema, parseForm, runAction } from "@/lib/action";

const Status = z.enum(APPLICATION_STATUSES);

export async function createApplicationAction(clusterId: string, status: string) {
  return runAction(async () => {
    const app = await createApplicationForCluster(idSchema.parse(clusterId), Status.parse(status));
    return { id: app.id };
  });
}

export async function updateStatusAction(applicationId: string, status: string) {
  return runAction(async () => {
    await updateApplicationStatus(idSchema.parse(applicationId), Status.parse(status));
  });
}

export async function addNoteAction(applicationId: string, note: string) {
  return runAction(async () => {
    await addApplicationNote(
      idSchema.parse(applicationId),
      z.string().trim().min(1, "Note vide").max(2000).parse(note),
    );
  });
}

export async function setNextActionAction(applicationId: string, date: string) {
  return runAction(async () => {
    const value = date ? z.iso.date().parse(date) : null;
    await setNextAction(idSchema.parse(applicationId), value);
  });
}

export async function deleteApplicationAction(applicationId: string) {
  return runAction(() => deleteApplication(idSchema.parse(applicationId)));
}

export async function generateCoverLetterAction(
  clusterId: string,
  extra?: string,
): Promise<ActionResult<CoverLetterResult & { message: string }>> {
  return runAction(async () => {
    const letter = await generateCoverLetter(
      idSchema.parse(clusterId),
      z.string().trim().max(1000).optional().parse(extra),
    );
    const message = letter.gaps.length
      ? `Lettre générée · à préparer pour l'entretien : ${letter.gaps.join(", ")}`
      : "Lettre générée";
    return { ...letter, message };
  });
}

export async function saveCoverLetterAction(applicationId: string, subject: string, body: string) {
  return runAction(() =>
    saveCoverLetter(
      idSchema.parse(applicationId),
      z.string().trim().min(1, "Objet requis").max(200).parse(subject),
      z.string().trim().min(50, "Lettre trop courte").max(20_000).parse(body),
    ),
  );
}

const ExternalForm = z.object({
  url: z.url("URL invalide"),
  title: z.string().trim().min(2, "Intitulé requis"),
  company: z.string().trim().min(1, "Entreprise requise"),
  status: Status.default("applied"),
  channel: z.string().trim().max(50).optional(),
  notes: z.string().max(2000).optional(),
});

export async function createExternalApplicationAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const app = await createExternalApplication(parseForm(ExternalForm, formData));
    return { id: app.id };
  });
}
