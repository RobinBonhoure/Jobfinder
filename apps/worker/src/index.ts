// Worker JobHunt : fenêtres planifiées (PLAN §6.3). Aucune logique métier ici : tout vient de @jobhunt/core.

import { closeDb } from "@jobhunt/core/db";
import { dueSourceIds, runSources } from "@jobhunt/core/ingest";
import { errorMessage, logger } from "@jobhunt/core/logger";
import { runRetention, WINDOW_CRON, WORKER_TIMEZONE, writeHeartbeat } from "@jobhunt/core/maintenance";
import { isLlmEnabled, scorePending } from "@jobhunt/core/scoring";
import { Cron } from "croner";

const log = logger.child("worker");
const controller = new AbortController();
let running: Promise<void> | null = null;

async function runWindow(label: string): Promise<void> {
  const started = Date.now();
  log.info(`fenêtre ${label} : début`);
  try {
    const ids = await dueSourceIds();
    const runs = await runSources(ids, { trigger: "worker", signal: controller.signal });
    const failed = runs.filter((r) => r.status === "failed").length;
    const created = runs.reduce((n, r) => n + r.created, 0);
    const scoring = await scorePending({ signal: controller.signal });
    await runRetention();
    // Une clé absente n'est pas une panne : l'UI l'affiche via scoringEnabled.
    const scoringError = isLlmEnabled() ? (scoring.fatalError ?? null) : null;
    await writeHeartbeat({
      lastTickAt: new Date(),
      lastScoringError: scoringError,
      scoringEnabled: isLlmEnabled(),
    });
    log.info(`fenêtre ${label} : fin`, {
      sources: runs.length,
      failed,
      created,
      scored: scoring.scored,
      ms: Date.now() - started,
    });
  } catch (err) {
    log.error(`fenêtre ${label} en échec`, { error: errorMessage(err) });
  }
}

function schedule(label: string) {
  if (running) {
    log.warn(`fenêtre ${label} ignorée : la précédente tourne encore`);
    return running;
  }
  running = runWindow(label).finally(() => {
    running = null;
  });
  return running;
}

async function main() {
  await writeHeartbeat({ startedAt: new Date(), version: "0.1.0", scoringEnabled: isLlmEnabled() });
  if (!isLlmEnabled()) log.warn("ANTHROPIC_API_KEY absente : scoring désactivé, tri par rule_score");

  const cron = new Cron(WINDOW_CRON, { timezone: WORKER_TIMEZONE, protect: true }, () =>
    schedule("planifiée"),
  );
  log.info("worker démarré", { prochaineFenêtre: cron.nextRun()?.toLocaleString("fr-FR") });

  const shutdown = async (signal: string) => {
    log.info(`arrêt demandé (${signal})`);
    cron.stop();
    controller.abort();
    await running?.catch(() => undefined);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Rattrapage : les sources dont next_run_at est dépassé (PC éteint) passent tout de suite.
  await schedule("démarrage");
}

main().catch(async (err) => {
  log.error("démarrage impossible", { error: errorMessage(err) });
  await closeDb();
  process.exit(1);
});
