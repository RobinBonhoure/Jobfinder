// Diagnostic sans base : interroge les boards de profile/boards.json, normalise et filtre.
// Usage : pnpm --filter @jobhunt/worker dry-run [--verbose] [--only <slug>]
import { readFileSync } from "node:fs";
import { dryRunSource } from "@jobhunt/core/ingest";
import { errorMessage } from "@jobhunt/core/logger";
import { profilePath } from "@jobhunt/core/paths";
import { detectAtsFromUrl } from "@jobhunt/core/sources";
import { option } from "./util";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const only = option(args, "only");

const file = JSON.parse(readFileSync(profilePath("boards.json"), "utf8")) as {
  boards: Array<{ company: string; url: string }>;
};

const reasonsCount = new Map<string, number>();
let totalFetched = 0;
let totalPassed = 0;

for (const b of file.boards) {
  const d = detectAtsFromUrl(b.url);
  if (!d || (only && d.slug !== only)) continue;
  try {
    const r = await dryRunSource(d.kind, d.config, b.company);
    totalFetched += r.fetched;
    totalPassed += r.passed.length;
    console.log(
      `${d.sourceId.padEnd(28)} ${String(r.fetched).padStart(4)} offres → ${r.passed.length} retenues`,
    );
    for (const j of r.passed) {
      console.log(
        `   ✓ [${j.filter.ruleScore}] ${j.title} — ${j.location ?? "?"} (${j.remotePolicy}, ${j.contractType})`,
      );
      if (verbose) console.log(`      flags: ${j.filter.flags.join(", ")}  ${j.url}`);
    }
    for (const j of r.rejected) {
      for (const reason of j.filter.reasons) {
        const key = reason.split(":")[0] ?? reason;
        reasonsCount.set(key, (reasonsCount.get(key) ?? 0) + 1);
      }
      if (verbose && j.filter.reasons.length === 1 && j.filter.matchedStack.length > 0) {
        console.log(`   ✗ ${j.title} — ${j.filter.reasons[0]}`);
      }
    }
  } catch (err) {
    console.log(`${d.sourceId.padEnd(28)} ERREUR ${errorMessage(err)}`);
  }
}

console.log(`\nTotal : ${totalFetched} offres, ${totalPassed} retenues.`);
console.log("Motifs de rejet (une offre peut en cumuler plusieurs) :");
for (const [k, v] of [...reasonsCount.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(20)} ${v}`);
