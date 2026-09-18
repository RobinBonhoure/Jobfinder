import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { jobClusters, jobs, llmScores, sources } from "../db/schema";
import { refreshCluster } from "../dedup/refresh";
import { DomainError } from "../domain/action-result";
import { errorMessage, logger } from "../logger";
import { loadCv } from "../profile";
import { getAnthropic, isFatalLlmError, isTransientLlmError } from "./anthropic";
import { LONG_DESCRIPTION_CHARS, PROMPT_VERSION, scoringModel } from "./config";
import { loadPrompt, render } from "./prompt";
import { type JobScore, JobScoreSchema } from "./schema";

const log = logger.child("scoring");
const MAX_ATTEMPTS = 2;

type CanonicalJob = {
  title: string;
  companyNameRaw: string | null;
  locationRaw: string | null;
  remotePolicy: string;
  remoteScope: string;
  contractType: string;
  seniority: string;
  salaryRaw: string | null;
  descriptionText: string;
  contentHash: string;
  kind: string;
};

class ContentFailure extends Error {}

async function callModel(
  job: CanonicalJob,
): Promise<{ score: JobScore; inputTokens: number; outputTokens: number }> {
  const client = getAnthropic();
  if (!client) throw new DomainError("VALIDATION", "ANTHROPIC_API_KEY absente : scoring désactivé");
  if (job.descriptionText.length > LONG_DESCRIPTION_CHARS) {
    log.warn("description anormalement longue (envoyée entière)", { chars: job.descriptionText.length });
  }
  const prompt = loadPrompt(PROMPT_VERSION);
  const system = render(prompt.system, { CV: loadCv() });
  const user = render(prompt.user, {
    title: job.title,
    company: job.companyNameRaw ?? "inconnue",
    location: job.locationRaw ?? "non précisée",
    remote_policy: job.remotePolicy,
    remote_scope: job.remoteScope,
    contract_type: job.contractType,
    seniority: job.seniority,
    salary: job.salaryRaw ?? "non communiqué",
    source_kind: job.kind,
    description: job.descriptionText,
  });

  let res: Awaited<ReturnType<typeof client.messages.parse>>;
  try {
    res = await client.messages.parse({
      model: scoringModel(),
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: zodOutputFormat(JobScoreSchema) },
    });
  } catch (err) {
    if (isTransientLlmError(err) || isFatalLlmError(err)) throw err;
    // Erreur de parsing/validation côté SDK : échec de contenu.
    throw new ContentFailure(errorMessage(err));
  }
  if (res.stop_reason !== "end_turn") throw new ContentFailure(`stop_reason=${res.stop_reason}`);
  const parsed = JobScoreSchema.safeParse(res.parsed_output);
  if (!parsed.success) throw new ContentFailure(`sortie invalide : ${parsed.error.message}`);
  return { score: parsed.data, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}

async function loadCanonical(clusterId: string) {
  const [row] = await getDb()
    .select({
      scoreStatus: jobClusters.scoreStatus,
      job: {
        title: jobs.title,
        companyNameRaw: jobs.companyNameRaw,
        locationRaw: jobs.locationRaw,
        remotePolicy: jobs.remotePolicy,
        remoteScope: jobs.remoteScope,
        contractType: jobs.contractType,
        seniority: jobs.seniority,
        salaryRaw: jobs.salaryRaw,
        descriptionText: jobs.descriptionText,
        contentHash: jobs.contentHash,
        kind: sources.kind,
      },
    })
    .from(jobClusters)
    .innerJoin(jobs, eq(jobs.id, jobClusters.canonicalJobId))
    .innerJoin(sources, eq(sources.id, jobs.sourceId))
    .where(eq(jobClusters.id, clusterId));
  return row;
}

export type ScoreOutcome = "scored" | "cached" | "failed" | "skipped";

/**
 * Score un cluster via son annonce canonique (PLAN §7.2). Cache par (content_hash, prompt, modèle).
 * `force` : ignore un échec mémorisé (bouton « rescorer ») et un statut not_needed.
 */
export async function scoreCluster(clusterId: string, opts: { force?: boolean } = {}): Promise<ScoreOutcome> {
  const db = getDb();
  const row = await loadCanonical(clusterId);
  if (!row) throw new DomainError("NOT_FOUND", "Offre inconnue");
  if (row.scoreStatus === "not_needed" && !opts.force) return "skipped";
  const { job } = row;
  const model = scoringModel();
  const key = and(
    eq(llmScores.contentHash, job.contentHash),
    eq(llmScores.promptVersion, PROMPT_VERSION),
    eq(llmScores.model, model),
  );
  const [cached] = await db.select().from(llmScores).where(key);
  if (cached?.status === "ok") {
    await refreshCluster(db, clusterId);
    return "cached";
  }
  if (cached?.status === "failed" && cached.attempts >= MAX_ATTEMPTS && !opts.force) {
    await refreshCluster(db, clusterId);
    return "failed";
  }

  let lastError = "";
  let attempts = opts.force ? 0 : (cached?.attempts ?? 0);
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    try {
      const { score, inputTokens, outputTokens } = await callModel(job);
      const values = {
        contentHash: job.contentHash,
        promptVersion: PROMPT_VERSION,
        model,
        status: "ok" as const,
        score: score.score,
        justification: score.justification,
        matchedSkills: score.matched_skills,
        missingSkills: score.missing_skills,
        redFlags: score.red_flags,
        hook: score.hook,
        remoteVerdict: score.remote_verdict,
        contractVerdict: score.contract_verdict,
        inputTokens: sql`${llmScores.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${llmScores.outputTokens} + ${outputTokens}`,
        attempts,
        error: null,
      };
      await db
        .insert(llmScores)
        .values({ ...values, inputTokens, outputTokens })
        .onConflictDoUpdate({
          target: [llmScores.contentHash, llmScores.promptVersion, llmScores.model],
          set: values,
        });
      await refreshCluster(db, clusterId);
      return "scored";
    } catch (err) {
      if (!(err instanceof ContentFailure)) throw err;
      lastError = err.message;
      log.warn("sortie LLM inexploitable", { clusterId, attempts, error: lastError });
    }
  }
  const failed = {
    contentHash: job.contentHash,
    promptVersion: PROMPT_VERSION,
    model,
    status: "failed" as const,
    attempts,
    error: lastError.slice(0, 1000),
  };
  await db
    .insert(llmScores)
    .values(failed)
    .onConflictDoUpdate({
      target: [llmScores.contentHash, llmScores.promptVersion, llmScores.model],
      set: failed,
    });
  await refreshCluster(db, clusterId);
  return "failed";
}

export interface ScorePendingSummary {
  scored: number;
  cached: number;
  failed: number;
  deferred: number;
  fatalError?: string;
}

/** Score les clusters en attente (fenêtre du worker, CLI). Arrête tout sur erreur de configuration. */
export async function scorePending(
  opts: { limit?: number; signal?: AbortSignal; concurrency?: number } = {},
): Promise<ScorePendingSummary> {
  const summary: ScorePendingSummary = { scored: 0, cached: 0, failed: 0, deferred: 0 };
  if (!getAnthropic()) {
    summary.fatalError = "ANTHROPIC_API_KEY absente : scoring désactivé";
    return summary;
  }
  const pending = await getDb()
    .select({ id: jobClusters.id })
    .from(jobClusters)
    .where(eq(jobClusters.scoreStatus, "pending"))
    .orderBy(desc(jobClusters.firstSeenAt))
    .limit(opts.limit ?? 500);
  const queue = pending.map((p) => p.id);
  let stop = false;

  const worker = async () => {
    while (!stop && !opts.signal?.aborted) {
      const id = queue.shift();
      if (!id) return;
      try {
        const outcome = await scoreCluster(id);
        if (outcome === "scored") summary.scored++;
        else if (outcome === "cached") summary.cached++;
        else if (outcome === "failed") summary.failed++;
      } catch (err) {
        if (isFatalLlmError(err) || err instanceof DomainError) {
          stop = true;
          summary.fatalError = errorMessage(err);
          log.error("scoring interrompu", { error: summary.fatalError });
        } else if (isTransientLlmError(err)) {
          summary.deferred++;
          log.warn("scoring reporté (erreur transitoire)", { id, error: errorMessage(err) });
        } else {
          summary.deferred++;
          log.error("scoring : erreur inattendue", { id, error: errorMessage(err) });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 2 }, worker));
  log.info("scoring terminé", { ...summary });
  return summary;
}
