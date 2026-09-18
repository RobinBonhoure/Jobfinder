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
