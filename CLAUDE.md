# CLAUDE.md — JobHunt

Outil **personnel et local** de recherche d'emploi (CDI full remote France, front React/Next ou fullstack JS/TS). Un seul utilisateur : Robin. **Minimalisme agressif** : chaque ajout doit résoudre un problème constaté.

Documents de référence (à lire avant toute tâche non triviale) :
- [docs/PLAN.md](docs/PLAN.md) : architecture, modèle de données, contrats, conformité
- [docs/ROADMAP.md](docs/ROADMAP.md) : jalons et ce qui est volontairement reporté
- [docs/ADR/](docs/ADR/) : décisions (ne pas les défaire sans en écrire une nouvelle)
- [docs/STACK.md](docs/STACK.md) : versions vérifiées et pièges de migration
- [docs/SOURCES.md](docs/SOURCES.md) : APIs externes et points `[À VÉRIFIER]`

## Structure

```
apps/web         Next.js 16 App Router : UI (Server Components), server actions, /api/capture, /api/health
apps/worker      Processus Node : fenêtres croner (7 h, 12 h, 17 h, 22 h + démarrage) → sources dues → scoring
apps/extension   Chrome MV3, JS pur, aucun build, n'importe pas core
packages/core    TOUTE la logique métier + schéma Drizzle (consommé en source TS)
profile/         cv.md, criteria.json, boards.json : données de Robin, versionnées (relues à chaud)
docs/            plan, roadmap, ADR, stack, sources
```

Organisation de `packages/core` (exports par sous-chemin, voir `package.json#exports`) :
- `src/domain/` : enums, schémas zod, libellés, fonctions pures (pipeline, mailto). **Seul sous-chemin importable depuis un composant client.**
- `src/normalize/` : heuristiques textuelles partagées (HTML → texte, remote, contrat, séniorité, salaire) et `buildJob`
- `src/db/` : `schema.ts`, `client.ts` (singleton postgres.js), `queries/*` (lectures de l'UI)
- `src/sources/` : un fichier par adaptateur, `types.ts`, `registry.ts`, `detect.ts` (URL → ATS), `manage.ts` (registre)
- `src/ingest/` (runSource, dry-run), `src/dedup/` (clés, rattachement, `refreshCluster`), `src/filter/`, `src/scoring/`
- `src/clusters/` + `src/applications/` (tri, fusion, repêchage, pipeline), `src/capture/`, `src/companies/`, `src/contacts/`, `src/outreach/`, `src/maintenance/`
- `src/http/client.ts` : client HTTP unique (retry, Retry-After, throttle par hôte, User-Agent)
- `src/env.ts` : **seul** endroit qui lit `process.env` ; `src/paths.ts` / `src/profile.ts` : accès à `profile/`
- `prompts/*.vN.md` : prompts LLM versionnés (`scoring`, `capture`, `outreach`)
- `drizzle/` : migrations SQL générées (+ `0000_extensions.sql` écrite à la main)
- `test/` : unitaires (fixtures réelles) + `db.integration.test.ts` (base de test dédiée)

## Règles non négociables

1. **La logique métier va dans `packages/core`.** Un `if` métier, une regex de parsing ou du SQL métier dans `apps/*` est un bug. Les apps orchestrent et affichent.
2. **Anti-duplication** :
   - Avant d'écrire une fonction, chercher dans `core/src/domain/normalize`, `core/src/db/queries` et `core/src/http`.
   - Une heuristique textuelle (remote, contrat, séniorité, salaire) n'existe **qu'une fois**, dans `normalize/`. Les adaptateurs ne font que du mapping de champs.
   - Un schéma zod de domaine n'existe qu'une fois, dans `domain/`. Les server actions et les route handlers le réutilisent ou le composent (`.pick`, `.extend`).
   - Pas de second client HTTP, de second client Anthropic ni de second client DB : utiliser ceux de `core`.
3. **Pas de nouvelle dépendance ni de nouvelle brique** (package, service, couche d'abstraction) sans une ligne qui énonce le besoin concret constaté, dans la PR ou dans un ADR. Liste de ce qui est reporté et de ses signaux : ROADMAP.
4. **Versions** : ne jamais citer ni installer une version de mémoire. `npm view <pkg> version dist-tags engines` d'abord, puis mise à jour de `docs/STACK.md` avec la date. Attention : `prisma@latest` pointe sur une RC (non utilisé de toute façon).
5. **Conformité** (PLAN §11) :
   - jamais de requête serveur vers LinkedIn, WTTJ ou Indeed ;
   - jamais de stockage d'email nominatif issu d'un crawl ;
   - `source` et `collected_at` sont obligatoires sur `contacts` ;
   - respecter `minIntervalMinutes` et le throttle de chaque source.
6. **Prompts LLM versionnés** (`packages/core/prompts/`) : un prompt utilisé n'est jamais modifié. Pour le changer, créer `scoring.v2.md` et incrémenter la constante correspondante dans `scoring/config.ts` (le cache se réinvalide proprement).
9. **Pas de fonction passée d'un Server Component à un Client Component** (hors server actions liées par `.bind`). Un retour à afficher passe par `{ message }` dans le résultat de l'action (voir `ActionButton`).
10. **Sous-requêtes SQL corrélées** : qualifier explicitement les colonnes externes (`"companies"."id"`), Drizzle ne préfixe pas les colonnes d'une requête sans jointure.
7. **Tout est local** (ADR-005, ADR-008) : PostgreSQL 18 natif sur `localhost`, app sur `127.0.0.1`, pas d'authentification (sauf le token de `/api/capture`). Ne rien introduire qui suppose un hébergement (Docker, service cloud) sans nouvel ADR.
8. **Pas de store client, pas de TanStack Query** : lectures en Server Components, mutations en server actions renvoyant `ActionResult<T>`.

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess`. Pas de `any` ; `unknown` + zod aux frontières (payloads des sources, corps HTTP, sorties LLM).
- ESM partout. Imports internes par sous-chemin : `@jobhunt/core/domain`, `@jobhunt/core/db`…
- Fichiers en `kebab-case.ts` ; composants React en `PascalCase.tsx` ; fonctions en `camelCase` ; tables et colonnes SQL en `snake_case` (noms explicites dans le schéma Drizzle, pas d'option `casing`).
- Enums : unions de chaînes + `pgEnum`, jamais d'`enum` TypeScript.
- Dates en `timestamptz`, en UTC côté code, affichées en `Europe/Paris`.
- UI en français. Code, identifiants et commits en anglais.
- Erreurs de server action : `{ ok: false, code, message }`, jamais de `throw` vers le client.
- Tests (Vitest) sur `core` : chaque adaptateur a une **fixture réelle** dans `core/test/fixtures/<kind>/` et un test de `normalize`. Pas de test qui appelle le réseau. Les tests d'intégration (`db.integration.test.ts`) ne tournent que si `DATABASE_URL_TEST` pointe vers une base **dédiée** (elle est vidée).
- Diagnostic du filtre sans base : `pnpm --filter @jobhunt/worker dry-run [--verbose] [--only <slug>]`.

### Next.js 16 : pièges connus

- Lire le bloc géré par Next dans `AGENTS.md` et la doc embarquée `node_modules/next/dist/docs/` avant d'écrire du code Next.
- `params`, `searchParams`, `cookies()` et `headers()` sont **asynchrones**. Utiliser `PageProps<'/route/[param]'>`.
- **Aucune clé `webpack`** dans `next.config.ts` (fait échouer `next build`, qui utilise Turbopack par défaut).
- `middleware` s'appelle désormais `proxy`. `next lint` n'existe plus (on utilise Biome).
- `reactCompiler` et `cacheComponents` restent **désactivés**.
- `revalidateTag` exige deux arguments. Après une mutation, préférer `refresh()` ou `revalidatePath`.

### Drizzle : rester compatible 1.0

- Pas de `db.query.*` / `relations()` : query builder + jointures explicites.
- Pas de `drizzle-zod`. Pas d'option `casing`.

### Tailwind 4

- Configuration en CSS (`@theme`), pas de `tailwind.config.js`. Préciser la couleur des bordures. `cursor-pointer` explicite sur les boutons. Pas de SCSS.

## Commandes

```bash
# Prérequis : PostgreSQL 18 (service Windows, winget PostgreSQL.PostgreSQL.18), base et rôle "jobhunt"
pnpm install
pnpm db:generate                # drizzle-kit generate (après modification du schéma)
pnpm db:migrate                 # applique les migrations
pnpm --filter @jobhunt/worker seed-sources   # importe profile/boards.json
pnpm dev                        # web (127.0.0.1:3000) + worker en parallèle
pnpm ingest [--all | --source <id>] [--no-score]  # exécute les sources maintenant (sans worker)
pnpm score [--cluster <id> --force]              # score les clusters en attente
pnpm --filter @jobhunt/worker refilter  # réapplique profile/criteria.json aux offres ouvertes
pnpm --filter @jobhunt/worker dry-run   # teste les boards sans base
pnpm test                       # vitest (core) ; + DATABASE_URL_TEST=… pour l'intégration
pnpm typecheck                  # tsc --noEmit dans chaque paquet
pnpm lint                       # biome check .
pnpm format                     # biome format --write .
pnpm db:backup                  # pg_dump -Fc → ./backups/ (garde les 8 derniers)
pnpm db:purge-contacts          # suppression RGPD des contacts (fin de recherche)
```

Avant de considérer une tâche finie : `pnpm typecheck && pnpm lint && pnpm test`.

## Environnement

`.env` à la racine (jamais commité), validé au démarrage par `core/src/env.ts` :
`DATABASE_URL` (Postgres local), `DATABASE_POOL_MAX` (défaut 5), `ANTHROPIC_API_KEY` (optionnelle : sans elle, pas de scoring), `SCORING_MODEL` (défaut `claude-haiku-4-5`), `OUTREACH_MODEL` (défaut `claude-sonnet-5`), `CAPTURE_TOKEN`, `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET`, `APP_URL`.

Node 24 LTS, pnpm 12 (épinglé via `packageManager`, fourni par corepack).

**Poste Windows de Robin** : Smart App Control est actif et bloque les binaires non signés. PostgreSQL 18.6 (EDB) est bloqué (`libcrypto-3-x64.dll`, code `C0E90002`) : voir ADR-008. Les binaires de l'outillage (tsc 7, Biome, esbuild, SWC) fonctionnent.
