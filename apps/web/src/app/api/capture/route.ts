import { timingSafeEqual } from "node:crypto";
import { ingestCapture, NotAJobPostingError } from "@jobhunt/core/capture";
import { DomainError } from "@jobhunt/core/domain";
import { env } from "@jobhunt/core/env";
import { errorMessage, logger } from "@jobhunt/core/logger";

const MAX_BYTES = 2 * 1024 * 1024;

function authorized(header: string | null, token: string): boolean {
  const provided = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(token);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const STATUS: Record<string, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPSTREAM: 502,
  INTERNAL: 500,
};

/** Capture manuelle depuis l'extension (PLAN §8.2). */
export async function POST(request: Request) {
  const token = env().CAPTURE_TOKEN;
  if (!token) {
    return Response.json({ error: "DISABLED", message: "CAPTURE_TOKEN absent de .env" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), token)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) {
    return Response.json({ error: "TOO_LARGE" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "VALIDATION", message: "JSON invalide" }, { status: 400 });
  }

  try {
    const result = await ingestCapture(body);
    return Response.json(
      { ...result, url: `/jobs/${result.clusterId}` },
      { status: result.status === "created" ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof NotAJobPostingError) {
      return Response.json({ error: "EXTRACTION_FAILED", message: err.message }, { status: 422 });
    }
    if (err instanceof DomainError) {
      return Response.json({ error: err.code, message: err.message }, { status: STATUS[err.code] ?? 500 });
    }
    logger.error("capture en échec", { error: errorMessage(err) });
    return Response.json({ error: "INTERNAL", message: errorMessage(err) }, { status: 500 });
  }
}
