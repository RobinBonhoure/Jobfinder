import { type ActionResult, DomainError, fail, ok } from "@jobhunt/core/domain";
import { errorMessage, logger } from "@jobhunt/core/logger";
import { refresh } from "next/cache";
import { z } from "zod";

/**
 * Enveloppe commune des server actions : traduit les erreurs métier en ActionResult
 * (jamais de throw vers le client) et rafraîchit la page après une mutation réussie.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  opts: { refresh?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (opts.refresh !== false) refresh();
    return ok(data);
  } catch (err) {
    if (err instanceof DomainError) return fail(err.code, err.message);
    if (err instanceof z.ZodError) return fail("VALIDATION", err.issues.map((i) => i.message).join(" ; "));
    logger.error("server action en échec", { error: errorMessage(err) });
    return fail("INTERNAL", errorMessage(err));
  }
}

/** Lecture typée d'un FormData via un schéma zod. */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): z.infer<S> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

export const idSchema = z.uuid();
