import { createHash } from "node:crypto";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { getClusterDetail } from "../db/queries/jobs";
import { jobs } from "../db/schema";
import { DomainError } from "../domain/action-result";
import { CONTRACT_TYPES, REMOTE_POLICIES, SENIORITIES } from "../domain/enums";
import type { NormalizedJob } from "../domain/job";
import { prepareJob, processJob } from "../ingest/process-job";
import { errorMessage, logger } from "../logger";
import { buildJob } from "../normalize/build";
import { normalizeWhitespace } from "../normalize/text";
import { loadCriteria } from "../profile";
import { getAnthropic, isTransientLlmError } from "../scoring/anthropic";
import { EXTRACTION_PROMPT_VERSION, scoringModel } from "../scoring/config";
import { loadPrompt, render } from "../scoring/prompt";
import { scoreCluster } from "../scoring/score";
import { ensureCaptureSource } from "../sources/manage";

const log = logger.child("capture");

/** La page capturée ne contient pas d'offre d'emploi (HTTP 422). */
export class NotAJobPostingError extends DomainError {
  constructor() {
    super("VALIDATION", "Aucune offre d'emploi détectée dans la page.");
  }
}

export const CapturePayload = z.object({
  url: z.url().refine((u) => /^https?:/i.test(u), "URL http(s) attendue"),
  pageTitle: z.string().max(500).default(""),
  text: z.string().min(50, "texte trop court").max(200_000, "texte trop long"),
  selectionOnly: z.boolean().default(false),
  capturedAt: z.iso.datetime().optional(),
});
export type CapturePayload = z.infer<typeof CapturePayload>;

const Extraction = z.object({
  is_job_posting: z.boolean(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  remote_policy: z.enum(REMOTE_POLICIES),
  contract: z.enum(CONTRACT_TYPES),
  seniority: z.enum(SENIORITIES),
  salary: z.string(),
  description_start: z.string(),
  description_end: z.string(),
});

const TRACKING_PARAMS =
  /^(utm_|trk|ref|refId|trackingId|lipi|src|source|origin|eBP|position|pageNum|gclid|fbclid)/i;

/** URL canonique : sans paramètres de suivi ; LinkedIn → /jobs/view/{id}. */
export function canonicalUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  if (/(^|\.)linkedin\.com$/.test(url.hostname)) {
    const id =
      url.searchParams.get("currentJobId") ?? url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1];
    if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
  }
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  return url.toString();
}

/** Découpe la description grâce aux bornes renvoyées par le LLM ; sinon garde le texte entier. */
function sliceDescription(text: string, start: string, end: string): string {
  const s = start ? text.indexOf(start) : -1;
  const eIdx = end ? text.lastIndexOf(end) : -1;
  if (s >= 0 && eIdx > s) return text.slice(s, eIdx + end.length);
  return text;
}

async function extract(payload: CapturePayload): Promise<z.infer<typeof Extraction> | null> {
  const client = getAnthropic();
  if (!client) return null;
  const prompt = loadPrompt(EXTRACTION_PROMPT_VERSION);
  const res = await client.messages.parse({
    model: scoringModel(),
    max_tokens: 1024,
    system: prompt.system,
    messages: [
      {
        role: "user",
        content: render(prompt.user, {
          page_title: payload.pageTitle,
          page_url: payload.url,
          page_text: payload.text,
        }),
      },
    ],
    output_config: { format: zodOutputFormat(Extraction) },
  });
  const parsed = Extraction.safeParse(res.parsed_output);
  return parsed.success ? parsed.data : null;
}

export interface CaptureResult {
  status: "created" | "duplicate";
  clusterId: string;
  score: number | null;
  warning?: string;
}

/** Pipeline de la capture manuelle (PLAN §8.2). Le serveur ne requête jamais l'URL capturée. */
export async function ingestCapture(input: unknown): Promise<CaptureResult> {
  const parsed = CapturePayload.safeParse(input);
  if (!parsed.success)
    throw new DomainError("VALIDATION", parsed.error.issues.map((i) => i.message).join(" ; "));
  const payload = parsed.data;
  const url = canonicalUrl(payload.url);
  const externalId = createHash("sha256").update(url).digest("hex").slice(0, 40);
  const sourceId = await ensureCaptureSource();
  const db = getDb();

  const [dup] = await db
    .select({ clusterId: jobs.clusterId })
    .from(jobs)
    .where(and(eq(jobs.sourceId, sourceId), eq(jobs.externalId, externalId)));
  if (dup?.clusterId) return { status: "duplicate", clusterId: dup.clusterId, score: null };

  const text = normalizeWhitespace(payload.text);
  let warning: string | undefined;
  let extraction: z.infer<typeof Extraction> | null = null;
  try {
    extraction = await extract({ ...payload, text });
  } catch (err) {
    if (!isTransientLlmError(err))
      throw new DomainError("UPSTREAM", `Extraction impossible : ${errorMessage(err)}`);
    warning = "API Anthropic indisponible : métadonnées déduites du texte, à vérifier.";
    log.warn("extraction reportée", { error: errorMessage(err) });
  }
  if (extraction && !extraction.is_job_posting) {
    throw new NotAJobPostingError();
  }
  if (!extraction && !warning) warning = "Pas de clé API : métadonnées déduites du titre de la page.";

  const fallbackTitle = payload.pageTitle.split(/\s[|–-]\s/)[0]?.trim() || "Offre capturée";
  const job: NormalizedJob = buildJob({
    externalId,
    url,
    applyUrl: url,
    title: extraction?.title || fallbackTitle,
    companyName: extraction?.company || null,
    locationRaw: extraction?.location || null,
    descriptionText: extraction
      ? sliceDescription(text, extraction.description_start, extraction.description_end)
      : text,
    remotePolicy: extraction?.remote_policy ?? null,
    contractType: extraction?.contract ?? null,
    seniority: extraction?.seniority ?? null,
    salaryRaw: extraction?.salary || null,
    tags: ["capture", new URL(url).hostname.replace(/^www\./, "")],
    publishedAt: null,
    raw: {
      pageTitle: payload.pageTitle,
      url: payload.url,
      capturedAt: payload.capturedAt ?? new Date().toISOString(),
    },
  });

  const criteria = loadCriteria();
  const { clusterId } = await db.transaction((tx) =>
    processJob(
      tx,
      { sourceId, sourceCompanyId: null, criteria, advisory: true },
      prepareJob(job, null),
      undefined,
    ),
  );

  let score: number | null = null;
  if (getAnthropic()) {
    try {
      const outcome = await scoreCluster(clusterId, { force: true });
      if (outcome === "scored" || outcome === "cached") {
        score = (await getClusterDetail(clusterId))?.score?.score ?? null;
      }
    } catch (err) {
      warning = `Offre enregistrée, scoring reporté : ${errorMessage(err)}`;
    }
  }
  return { status: "created", clusterId, score, warning };
}
