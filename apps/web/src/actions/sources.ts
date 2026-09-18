"use server";

import { refilterOpenJobs } from "@jobhunt/core/applications";
import type { ActionResult } from "@jobhunt/core/domain";
import { dueSourceIds, type RunSummary, runSource, runSources } from "@jobhunt/core/ingest";
import { scorePending } from "@jobhunt/core/scoring";
import {
  type AddSourceResult,
  addSourceFromUrl,
  deleteSource,
  seedSourcesFromProfile,
  setSourceEnabled,
  setSourceInterval,
} from "@jobhunt/core/sources";
import { z } from "zod";
import { parseForm, runAction } from "@/lib/action";

const SourceId = z.string().min(1).max(200);

const AddForm = z.object({
  url: z.url("URL invalide"),
  company: z.string().trim().max(100).optional(),
});

export async function addSourceAction(
  _prev: ActionResult<AddSourceResult> | null,
  formData: FormData,
): Promise<ActionResult<AddSourceResult>> {
  return runAction(async () => {
    const { url, company } = parseForm(AddForm, formData);
    return addSourceFromUrl(url, company);
  });
}

export async function toggleSourceAction(sourceId: string, enabled: boolean) {
  return runAction(() => setSourceEnabled(SourceId.parse(sourceId), enabled));
}

export async function setIntervalAction(sourceId: string, minutes: number) {
  return runAction(() =>
    setSourceInterval(SourceId.parse(sourceId), z.number().int().min(30).max(10_080).parse(minutes)),
  );
}

export async function deleteSourceAction(sourceId: string) {
  return runAction(() => deleteSource(SourceId.parse(sourceId)));
}

/** « Lancer maintenant » : exécution directe dans l'action (pas de passage par le worker, ADR-002). */
export async function runSourceNowAction(
  sourceId: string,
): Promise<ActionResult<RunSummary & { message: string }>> {
  return runAction(async () => {
    const summary = await runSource(SourceId.parse(sourceId), { trigger: "manual" });
    await scorePending({ limit: 50 });
    const message =
      summary.status === "failed"
        ? `échec : ${summary.error ?? "?"}`
        : `${summary.created} nouvelle(s), ${summary.updated} modifiée(s)`;
    return { ...summary, message };
  });
}

export async function runDueSourcesAction(): Promise<ActionResult<{ message: string }>> {
  return runAction(async () => {
    const runs = await runSources(await dueSourceIds(), { trigger: "manual" });
    await scorePending({ limit: 100 });
    const created = runs.reduce((n, r) => n + r.created, 0);
    const failed = runs.filter((r) => r.status === "failed").length;
    return {
      message: `${runs.length} source(s), ${created} nouvelle(s)${failed ? `, ${failed} en échec` : ""}`,
    };
  });
}

export async function seedSourcesAction() {
  return runAction(async () => {
    const { created } = await seedSourcesFromProfile();
    return { message: `${created.length} source(s) importée(s)` };
  });
}

export async function refilterAction() {
  return runAction(async () => {
    const { changed } = await refilterOpenJobs();
    return { message: `${changed} offre(s) ont changé de statut` };
  });
}
