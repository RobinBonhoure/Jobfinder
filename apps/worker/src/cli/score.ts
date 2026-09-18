// pnpm score [--limit 50]              → clusters en attente
// pnpm score --cluster <id> [--force]  → un cluster
import { closeDb } from "@jobhunt/core/db";
import { scoreCluster, scorePending } from "@jobhunt/core/scoring";
import { option } from "./util";

const args = process.argv.slice(2);
const cluster = option(args, "cluster");

if (cluster) {
  console.log(await scoreCluster(cluster, { force: args.includes("--force") }));
} else {
  const limit = Number(option(args, "limit") ?? 500);
  const s = await scorePending({ limit });
  console.log(s);
}
await closeDb();
