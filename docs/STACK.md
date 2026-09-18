# JobHunt — Stack vérifiée

> **Date de vérification : 2026-09-17.** Toute version absente de ce tableau n'a pas été vérifiée : la vérifier avant de l'utiliser (`npm view <pkg> version dist-tags engines`).
> **Context7 et nextjs-mcp n'étaient pas disponibles** dans la session de planification : aucun outil MCP de ce type n'était exposé. Les vérifications viennent de `npm view` (registre npm), des pages officielles (WebFetch) et, à défaut, de recherches web, signalées comme telles.

## Environnement

| Élément | Version retenue | Vérifiée le | Méthode | Notes |
|---|---|---|---|---|
| Node.js | **24.x LTS** (dernière : 24.21.0 « Krypton ») | 2026-09-17 | `nodejs.org/dist/index.json` | Node 26.9.0 est la « Current », non LTS. Poste de Robin : **24.15.0** installé, compatible. Épingler `"engines": { "node": ">=24.12 <25" }` (plancher imposé par Vitest 5 : `^22.12 \|\| ^24 \|\| >=26`). |
| pnpm | **12.4.2** | 2026-09-17 | `npm view pnpm` | Le pnpm du poste (11.6.0) est géré par corepack : `packageManager: pnpm@12.4.2` suffit, corepack fournit la 12.4.2 dans le projet. |
| PostgreSQL | **18.6**, natif Windows (`winget install PostgreSQL.PostgreSQL.18`, paquet 18.6-3) | 2026-09-17 | `winget search` + Docker Hub (même mineure 18.6) | **Bloqué par Smart App Control sur le poste** (DLL non signée), voir ADR-008. PostgreSQL 19 existe en bêta. |
| Docker | **Non utilisé** | 2026-09-17 | — | Absent du poste (WSL non installé). |

## Dépendances structurantes

| Paquet | Version stable vérifiée | Node requis (`engines`) | Méthode | Rôle |
|---|---|---|---|---|
| `next` | **16.3.5** | `>=20.9.0` | npm + guide de migration v16 (nextjs.org, mis à jour le 2026-08-25) | App web |
| `react` / `react-dom` | **19.3.0** | — | npm | UI |
| `@types/react` | 19.3.0 | — | npm | |
| `typescript` | **7.0.2** (repli : 6.0.3) | `>=16.20` | npm + annonce TS 7 + recherche web | Typecheck (ADR-007) |
| `@biomejs/biome` | **2.5.14** | `>=14.21.3` | npm | Lint + format |
| `tailwindcss` / `@tailwindcss/postcss` | **4.3.3** | Node ≥ 20 (outil d'upgrade) | npm + guide d'upgrade v4 | Styles |
| `drizzle-orm` | **0.45.2** (1.0.0-rc.4 en RC) | — | npm + guide v0→v1 | ORM (ADR-001) |
| `drizzle-kit` | **0.31.10** | — | npm | Migrations |
| `postgres` (postgres.js) | **3.4.9** | `>=12` | npm | Driver PG (peer de drizzle-orm : `postgres >=3`) |
| `zod` | **4.6.5** | — | npm + changelog v4 | Validation / contrats |
| `@anthropic-ai/sdk` | **0.126.0** | — | npm + skill claude-api | LLM (peer : `zod ^3.25 \|\| ^4`) |
| `croner` | **10.0.1** | `>=18.0` | npm | Planification du worker |
| `tsx` | **4.23.13** | `>=18` | npm | Exécution TS du worker et des scripts |
| `vitest` | **5.0.1** | `^22.12 \|\| ^24 \|\| >=26` | npm | Tests de `core` |
| `dotenv` | **17.4.2** | `>=12` | npm | Chargement de `.env` (worker et scripts) |
| `linkedom` | **0.18.13** | — | npm | `htmlToText`, parsing des pages de contact |
| `fast-xml-parser` | **5.11.1** | — | npm | Flux RSS (Teamtailor) |
| `@types/node` | **24.13.5** (ligne 24) | — | npm | |

Outils de test utilisés **hors dépôt** (scratchpad, 2026-09-17) : `@electric-sql/pglite` 0.5.8 + `@electric-sql/pglite-socket` 0.2.11 (base de test), `playwright-core` piloté sur Edge (test de l'UI).

Modèles Claude (skill `claude-api`, table datée du 2026-06-24, et doc structured outputs consultée le 2026-09-17) :

| Modèle | ID | Prix ($/M, entrée/sortie) | Usage |
|---|---|---|---|
| Claude Haiku 4.5 | `claude-haiku-4-5` | 1 / 5 | Scoring, extraction de capture |
| Claude Sonnet 5 | `claude-sonnet-5` | 2 / 10 | Brouillons du module B |

### Évalués et **non retenus**

| Paquet | Version vue | Pourquoi pas |
|---|---|---|
| `turbo` | 2.10.13 | Aucun build interne à mettre en cache (ADR-006). |
| `prisma` / `@prisma/client` | 7.10.0 stable (**`latest` du CLI = 8.0.0-rc.15**) | ADR-001. Attention : `npm i prisma@latest` installerait une RC. |
| `node-cron` | 4.6.0 (`>=20`) | `croner` fournit `protect` (anti-chevauchement) et les fuseaux sans dépendance. |
| `@tanstack/react-query` | 5.103.1 | Pas d'état serveur côté client (PLAN §8.1). |
| `pg` | 8.23.0 | `postgres` suffit, avec une API plus simple. |
| `babel-plugin-react-compiler` | 1.0.0 | React Compiler non activé (pas de besoin, builds plus lents). |
| `@typescript/typescript6` | 6.0.2 | Seulement utile avec typescript-eslint (ADR-007). |
| `@mozilla/readability` | 0.6.0 | La capture envoie `innerText` ou la sélection ; l'extraction se fait par LLM. |
| `rss-parser` | 3.13.0 | `fast-xml-parser` suffit et expose les balises namespacées (`tt:*`). |

---

## Points d'attention issus des guides de migration

### Next.js 16 (guide « Upgrading to version 16 »)

- **Turbopack par défaut** pour `next dev` **et** `next build` ; le flag `--turbopack` est inutile. **Une config `webpack` custom fait échouer `next build`** (opt-out : `--webpack`). → Ne jamais ajouter de clé `webpack` ; la config Turbopack se met au niveau racine (`turbopack: {}`), plus dans `experimental`.
- Cache disque de Turbopack activé par défaut en dev et en build.
- **APIs de requête 100 % asynchrones** : `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` doivent être `await`és. Utiliser les helpers générés `PageProps<'/jobs/[clusterId]'>`, `LayoutProps`, `RouteContext` (`next typegen`).
- `middleware` est renommé **`proxy`** (`proxy.ts`, fonction `proxy`, runtime Node uniquement). Utile seulement si l'auth arrive un jour.
- **`next lint` supprimé**, et `next build` ne lance plus le lint ; l'option `eslint` du config est supprimée. → Biome lancé séparément (`pnpm lint`).
- **React Compiler** : stable mais **désactivé par défaut** (`reactCompiler: true` + `babel-plugin-react-compiler`), avec des builds plus lents. → Non activé.
- `cacheComponents` remplace PPR, `dynamicIO` et `useCache`. Ce n'est pas un simple renommage : il impose le modèle Cache Components. → Non activé.
- `revalidateTag(tag, profile)` exige un 2ᵉ argument. Nouveaux helpers de server action : `updateTag` (lecture de ses écritures) et `refresh()`. → Après une mutation, utiliser `refresh()` ou `revalidatePath`.
- `next dev` écrit dans `.next/dev` ; un lockfile empêche deux `next dev` simultanés sur le même projet.
- `serverRuntimeConfig` et `publicRuntimeConfig` supprimés → variables d'environnement.
- `next/image` : `qualities` = `[75]` par défaut, `minimumCacheTTL` = 4 h, IP locales bloquées. Sans objet ici.
- Les slots de routes parallèles exigent un `default.js`. Sans objet ici.
- ESLint en flat config par défaut. Sans objet (Biome).
- Next 16.2 et plus génèrent et maintiennent un bloc dans **`AGENTS.md`** qui pointe vers la doc embarquée `node_modules/next/dist/docs/`. **Le lire avant d'écrire du code Next**, et committer ce bloc.
- Node ≥ 20.9, TypeScript ≥ 5.1, navigateurs Chrome/Edge/Firefox 111+ et Safari 16.4+.

### React 19.3

- Mineure de la ligne 19 : pas de guide de migration majeure à appliquer. Les fonctionnalités de 19.2 (`<Activity>`, `useEffectEvent`, View Transitions) sont disponibles via l'App Router, sans besoin identifié ici.

### TypeScript 7.0

- Compilateur natif en Go, **sans API JavaScript** (prévue en 7.1) → typescript-eslint, ts-morph et ts-jest cassés. Béquille : `@typescript/typescript6`.
- Next 16.3 utilise le CLI `tsc` local : **vérifié le 2026-09-17**, `next build` et `next typegen && tsc` passent dans le monorepo avec TS 7.0.2.
- Inférence différente sur `fn.bind(...)` passé à une prop générique : préciser le générique si besoin.
- Décision et repli : ADR-007.

### Tailwind CSS 4

- Plugin PostCSS `@tailwindcss/postcss` ; `postcss-import` et `autoprefixer` sont inutiles.
- `@import "tailwindcss";` remplace les directives `@tailwind`.
- **Configuration en CSS** (`@theme`). `tailwind.config.js` n'est plus détecté automatiquement (il faudrait `@config`) → ne pas en créer.
- Renommages : `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded-sm`→`rounded-xs`, `outline-none`→`outline-hidden`, `ring`→`ring-3`. Suppression de `bg-opacity-*`, `flex-shrink-*` et `flex-grow-*`.
- Nouveaux défauts : bordure `currentColor` (toujours préciser la couleur), `ring` de 1 px, curseur des boutons `default` (ajouter `cursor-pointer`), `hover` seulement sur les appareils qui le supportent.
- Variables CSS en valeur arbitraire : `bg-(--brand)` au lieu de `bg-[--brand]`. `!important` en suffixe : `bg-red-500!`.
- **Pas de Sass/Less avec v4** → pas de SCSS dans ce projet.
- Navigateurs : Safari 16.4+, Chrome 111+, Firefox 128+.

### Drizzle ORM (0.45 → 1.0, à anticiper)

- 1.0 (RC) : API relationnelle v1 **supprimée** (→ `defineRelations()`) ; `drizzle-zod` absorbé dans `drizzle-orm/zod` ; `casing` remplacé par `snakeCase.table()` ; nouveau format de dossier de migrations (plus de `journal.json`, commande `drizzle-kit up`) ; `drizzle-kit drop` supprimé ; `push`/`pull` gèrent tous les schémas par défaut.
- → Règles de codage pour neutraliser ces changements : ADR-001.

### Zod 4

- `error` unifié (plus de `invalid_type_error`, `required_error` ni `message`).
- Formats au niveau racine : `z.email()`, `z.url()`, `z.uuid()`.
- `z.strictObject()` / `z.looseObject()` à la place de `.strict()` / `.passthrough()` ; `.extend()` à la place de `.merge()`.
- `z.record()` exige deux arguments ; avec des clés enum, il est exhaustif.
- Les `default()` s'appliquent aussi dans les champs optionnels.
- `z.function()` n'est plus un schéma.

### pnpm 11 → 12

- La configuration est lue dans **`pnpm-workspace.yaml`**, plus dans `package.json#pnpm`. `.npmrc` ne sert plus qu'à l'auth et au registre.
- **`allowBuilds`** remplace `onlyBuiltDependencies` et les réglages voisins. Vérifié : seul `esbuild` (via `tsx` et `drizzle-kit`) a besoin d'un script d'installation ; `sharp` et `unrs-resolver` sont refusés sans effet.
- Variables d'environnement `pnpm_config_*` (plus `npm_config_*`).
- Les scripts nommés `clean`, `setup`, `deploy` ou `rebuild` masquent les commandes intégrées → éviter ces noms.
- pnpm 12 **signale les réglages inconnus** de `pnpm-workspace.yaml` et échoue si la version est épinglée.

### PostgreSQL 18 (natif Windows)

- Installeur EDB via winget. Le service démarre avec Windows. `bin` à ajouter au `PATH` (`psql`, `pg_dump`, `pg_restore`).
- `pg_trgm`, `pgcrypto` et `citext` sont des modules `contrib` créés par `CREATE EXTENSION` dans la migration initiale `[À VÉRIFIER sur l’installation réelle : présents et créables par le rôle jobhunt]` (validé sur PGlite).
- `pg_dump` doit être de version ≥ celle du serveur (ici les deux sont en 18).
- Pour mémoire (option écartée, ADR-008) : Neon gratuit = 100 CU-h par mois, 0,5 Go, mise en veille après 5 min, pooler en mode transaction.

### API Anthropic

- Structured outputs via `output_config.format` (l'ancien `output_format` est déprécié) ; en TS, `client.messages.parse()` + `zodOutputFormat()`.
- Pas de `minimum`/`maximum`/`minLength` côté API : le SDK les retire et valide localement.
- Haiku 4.5 : thinking par `budget_tokens` uniquement (non utilisé ici), `effort` non pris en charge, minimum de cache de 4 096 tokens.
- Pas de prefill d'assistant sur les modèles 4.6+ (dont Sonnet 5) → utiliser les structured outputs.
- `maxRetries` par défaut = 2 (408/409/429/5xx) ; en TS, le `timeout` s'exprime en millisecondes.
