import { getHeartbeat, pingDb } from "@jobhunt/core/db";
import { isWorkerStale } from "@jobhunt/core/maintenance";

export async function GET() {
  const db = await pingDb();
  const hb = db ? await getHeartbeat().catch(() => null) : null;
  return Response.json(
    {
      ok: db,
      db: db ? "up" : "down",
      worker: {
        lastTickAt: hb?.lastTickAt ?? null,
        stale: isWorkerStale(hb?.lastTickAt ?? null),
        scoringEnabled: hb?.scoringEnabled ?? false,
      },
    },
    { status: db ? 200 : 503 },
  );
}
