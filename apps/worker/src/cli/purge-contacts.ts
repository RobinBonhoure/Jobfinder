// Fin de recherche : suppression définitive de tous les contacts (RGPD). Exige --yes.
import { purgeAllContacts } from "@jobhunt/core/contacts";
import { closeDb } from "@jobhunt/core/db";

if (!process.argv.includes("--yes")) {
  console.log("Supprime définitivement TOUS les contacts. Relance avec : pnpm db:purge-contacts --yes");
  process.exit(1);
}
const n = await purgeAllContacts();
console.log(`${n} contact(s) supprimé(s).`);
await closeDb();
