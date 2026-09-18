import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

let client: Anthropic | null | undefined;

/** Client partagé ; null si ANTHROPIC_API_KEY est absente (scoring désactivé). */
export function getAnthropic(): Anthropic | null {
  if (client !== undefined) return client;
  const key = env().ANTHROPIC_API_KEY;
  client = key ? new Anthropic({ apiKey: key, timeout: 60_000 }) : null;
  return client;
}

export const isLlmEnabled = () => getAnthropic() !== null;

/** Tests uniquement : remplace le client (null = désactivé, undefined = relire l'environnement). */
export function setAnthropicClientForTests(fake: Anthropic | null | undefined): void {
  client = fake;
}

/** Erreurs d'infrastructure : rien n'est écrit en cache, on retentera plus tard. */
export function isTransientLlmError(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.InternalServerError ||
    (err instanceof Anthropic.APIError && typeof err.status === "number" && err.status >= 500)
  );
}

/** Erreurs de configuration : on arrête le scoring et on le signale dans l'UI. */
export function isFatalLlmError(err: unknown): boolean {
  return (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.BadRequestError ||
    err instanceof Anthropic.NotFoundError
  );
}
