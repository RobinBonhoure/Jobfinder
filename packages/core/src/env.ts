import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { repoRoot } from "./paths";

const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL manquante (voir .env.example)"),
  /** Taille du pool postgres.js (1 pour les bancs de test PGlite). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  ANTHROPIC_API_KEY: optionalString,
  SCORING_MODEL: z.string().default("claude-haiku-4-5"),
  OUTREACH_MODEL: z.string().default("claude-sonnet-5"),
  CAPTURE_TOKEN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(32, "CAPTURE_TOKEN doit faire au moins 32 caractères").optional(),
  ),
  FRANCE_TRAVAIL_CLIENT_ID: optionalString,
  FRANCE_TRAVAIL_CLIENT_SECRET: optionalString,
  APP_URL: z.string().default("http://127.0.0.1:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Seul point d'accès à process.env dans le projet. */
export function env(): Env {
  if (cached) return cached;
  loadDotenv({ path: join(repoRoot(), ".env"), quiet: true });
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration invalide (.env) :\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
