import { execFile, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { lt, sql } from "drizzle-orm";
import { purgeDeletedContacts } from "../contacts/service";
import { getDb } from "../db/client";
import { sourceRuns, workerHeartbeat } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { repoRoot } from "../paths";

const run = promisify(execFile);

/** Heures des fenêtres du worker (Europe/Paris). Utilisé aussi par l'UI pour détecter une fenêtre manquée. */
export const WINDOW_HOURS = [7, 12, 17, 22] as const;
export const WINDOW_CRON = `0 ${WINDOW_HOURS.join(",")} * * *`;
export const WORKER_TIMEZONE = "Europe/Paris";

type HeartbeatPatch = Partial<typeof workerHeartbeat.$inferInsert>;

export async function writeHeartbeat(patch: HeartbeatPatch): Promise<void> {
  await getDb()
    .insert(workerHeartbeat)
    .values({ id: 1, ...patch })
    .onConflictDoUpdate({ target: workerHeartbeat.id, set: patch });
}

/** Rétention (PLAN §12) + purge RGPD des contacts supprimés depuis plus de 30 jours. */
export async function runRetention(): Promise<{ runs: number; contacts: number }> {
  const runs = await getDb()
    .delete(sourceRuns)
    .where(lt(sourceRuns.startedAt, sql`now() - interval '60 days'`))
    .returning({ id: sourceRuns.id });
  const contacts = await purgeDeletedContacts();
  if (runs.length || contacts) logger.info("rétention", { runs: runs.length, contacts });
  return { runs: runs.length, contacts };
}

/** Dernière fenêtre prévue avant `now` (heure de Paris). */
export function lastScheduledWindow(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: WORKER_TIMEZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const past = [...WINDOW_HOURS].reverse().find((h) => h <= hour);
  const hoursBack = past === undefined ? hour + (24 - (WINDOW_HOURS.at(-1) ?? 0)) : hour - past;
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() - hoursBack);
  return d;
}

/** Le worker est-il en retard ? (fenêtre prévue passée depuis > 30 min sans heartbeat postérieur). */
export function isWorkerStale(lastTickAt: Date | null, now = new Date()): boolean {
  if (!lastTickAt) return true;
  const window = lastScheduledWindow(now);
  return now.getTime() - window.getTime() > 30 * 60_000 && lastTickAt.getTime() < window.getTime();
}

const KEEP_BACKUPS = 8;
/** Service et rôle définis dans docker-compose.yml. */
const DB_SERVICE = "db";
const DB_ROLE = "jobhunt";

/** `docker compose exec` écrit le dump sur stdout ; on le redirige vers le fichier. */
async function dumpViaDocker(file: string): Promise<void> {
  const out = createWriteStream(file);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "docker",
      ["compose", "exec", "-T", DB_SERVICE, "pg_dump", "--format=custom", "-U", DB_ROLE, "-d", DB_ROLE],
      { cwd: repoRoot(), stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.pipe(out);
    child.on("error", reject);
    child.on("close", (code) => {
      out.close();
      if (code === 0) resolve();
      else reject(new Error(`docker compose exec pg_dump a échoué (code ${code}) : ${stderr.slice(0, 300)}`));
    });
  });
}

/** pg_dump -Fc dans ./backups (garde les 8 derniers) : celui du poste s'il existe, sinon celui du conteneur. */
export async function backupDatabase(): Promise<string> {
  const dir = join(repoRoot(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const file = join(dir, `jobhunt-${stamp}.dump`);
  const isEnoent = (err: unknown) => (err as NodeJS.ErrnoException).code === "ENOENT";
  try {
    // 1. pg_dump du poste, s'il est installé.
    await run("pg_dump", ["--format=custom", `--file=${file}`, `--dbname=${env().DATABASE_URL}`], {
      timeout: 5 * 60_000,
    });
  } catch (err) {
    if (!isEnoent(err)) throw err;
    // 2. Sinon, celui du conteneur (docker compose, ADR-008).
    try {
      await dumpViaDocker(file);
    } catch (dockerErr) {
      if (isEnoent(dockerErr)) {
        throw new Error(
          "Sauvegarde impossible : ni pg_dump ni docker sur le PATH. Démarre la base (docker compose up -d) " +
            "ou installe les outils client PostgreSQL.",
        );
      }
      throw dockerErr;
    }
  }
  const dumps = readdirSync(dir)
    .filter((f) => /^jobhunt-.*\.dump$/.test(f))
    .sort();
  for (const old of dumps.slice(0, Math.max(0, dumps.length - KEEP_BACKUPS))) unlinkSync(join(dir, old));
  await writeHeartbeat({ lastBackupAt: new Date() });
  return file;
}
