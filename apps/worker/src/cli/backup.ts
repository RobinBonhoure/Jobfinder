import { closeDb } from "@jobhunt/core/db";
import { backupDatabase } from "@jobhunt/core/maintenance";

const file = await backupDatabase();
console.log(`Sauvegarde écrite : ${file}`);
await closeDb();
