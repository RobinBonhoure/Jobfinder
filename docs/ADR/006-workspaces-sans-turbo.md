# ADR-006 — Workspaces pnpm, sans Turborepo

**Statut** : accepté — 2026-09-17

## Contexte

Quatre paquets : `apps/web`, `apps/worker`, `apps/extension` (sans dépendances) et `packages/core`. `core` est consommé en source TypeScript, sans étape de build. Versions vérifiées : `pnpm` 12.4.2 (11.6.0 installé sur le poste), `turbo` 2.10.13.

## Options

1. **Un seul projet Next + un script `worker.ts` dans le même package**. Faisable, mais le worker hérite des dépendances et de la config de Next, et la frontière métier (`core`) n'est plus matérialisée : la logique finit dans `app/`.
2. **Workspaces pnpm seuls**. Le paquet `@jobhunt/core` est matérialisé (`workspace:*`), et les scripts transverses passent par `pnpm -r` / `pnpm --filter`.
3. **Workspaces pnpm + Turborepo**. Apporte un cache de tâches et un ordonnancement des builds. Or aucun paquet interne n'a de build : il n'y a rien à mettre en cache ni à ordonner.

## Décision

**Option 2.** Turborepo n'est pas utilisé : son seul apport (le cache et l'ordonnancement des builds) n'a pas d'objet sans build interne.

- `pnpm-workspace.yaml` porte aussi la configuration pnpm. Depuis pnpm 11, les réglages ne sont plus lus dans `package.json#pnpm`, et `allowBuilds` remplace `onlyBuiltDependencies`.
- `packageManager` est épinglé dans le `package.json` racine.

## Conséquences

- Scripts racine : `dev` (`pnpm -r --parallel dev`), `test` (`pnpm -r test`), `typecheck` (`pnpm -r typecheck`), `lint` (`biome check .`), `db:*` (`pnpm --filter @jobhunt/core …`).
- pnpm 12 (réécriture en Rust) garde les commandes et le format de lockfile de la v11 ; il signale les réglages inconnus dans `pnpm-workspace.yaml` et échoue si la version est épinglée. Il faut garder ce fichier propre.
- Le poste a pnpm 11.6.0 : le mettre à jour via `corepack` ou `pnpm self-update`, ou épingler 11.x. Choix recommandé : **épingler 12.4.2**, la réécriture étant annoncée sans changement de commandes.
- Signal de révision : apparition d'une étape de build dans un paquet interne **et** CI lente.
