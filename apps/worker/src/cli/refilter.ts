// Réévalue le filtre après modification de profile/criteria.json.
import { refilterOpenJobs } from "@jobhunt/core/applications";
import { closeDb } from "@jobhunt/core/db";

const { changed } = await refilterOpenJobs();
console.log(`${changed} offre(s) ont changé de statut.`);
await closeDb();
