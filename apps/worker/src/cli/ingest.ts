// pnpm ingest                  → sources dues
// pnpm ingest --all            → toutes les sources activées
// pnpm ingest --source <id>    → une source (même désactivée)
// Enchaîne le scoring sauf avec --no-score.
import { closeDb } from "@jobhunt/core/db";
import { dueSourceIds, enabledSourceIds, runSources } from "@jobhunt/core/ingest";
import { scorePending } from "@jobhunt/core/scoring";
import { option } from "./util";

const args = process.argv.slice(2);
const source = option(args, "source");

let ids: string[];
if (source) ids = [source];
else if (args.includes("--all")) ids = await enabledSourceIds();
else ids = await dueSourceIds();

console.log(`${ids.length} source(s) à exécuter`);
const runs = await runSources(ids, { trigger: "cli" });
for (const r of runs) {
  console.log(
    `${r.sourceId.padEnd(32)} ${r.status.padEnd(8)} ${r.fetched} lues, ${r.created} nouvelles, ${r.updated} modifiées, ${r.closed} closes${r.error ? ` — ${r.error}` : ""}`,
  );
}
if (!args.includes("--no-score")) {
  const s = await scorePending();
  console.log(
    `Scoring : ${s.scored} scorées, ${s.cached} en cache, ${s.failed} en échec, ${s.deferred} reportées${s.fatalError ? ` — ${s.fatalError}` : ""}`,
  );
}
await closeDb();
