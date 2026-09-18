// Importe profile/boards.json dans la table sources (idempotent).
import { closeDb } from "@jobhunt/core/db";
import { seedSourcesFromProfile } from "@jobhunt/core/sources";

const { created, skipped } = await seedSourcesFromProfile();
console.log(`${created.length} source(s) créée(s), ${skipped.length} déjà présente(s) ou ignorée(s).`);
for (const id of created) console.log(`  + ${id}`);
await closeDb();
