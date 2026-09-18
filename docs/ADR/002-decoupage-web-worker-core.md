# ADR-002 — Découpage : app Next / worker / core (+ extension)

**Statut** : accepté — 2026-09-17

## Contexte

Il faut à la fois :

- une UI de tri et quelques endpoints (≈ 15 opérations, un seul utilisateur) ;
- un polling planifié de dizaines de sources, avec retries, qui tourne en continu ;
- une capture depuis le navigateur ;
- la même logique de normalisation, filtre et scoring pour l'ingestion planifiée **et** pour la capture.

NestJS est écarté par décision de cadrage.

## Options

1. **Tout dans Next** : cron via route handler + `node-cron` dans `instrumentation.ts`. Le cycle de vie du serveur Next n'est pas conçu pour ça : HMR en dev qui duplique les timers, pas de garantie de process unique, arrêt non maîtrisé. Rejeté.
2. **Next + scripts lancés à la main** (`pnpm ingest`). Suffisant **pour J1** (et c'est ce que fait J1), insuffisant ensuite : l'ingestion dépend de la mémoire de Robin.
3. **Next + worker Node séparé + `packages/core`**. Deux processus aux rôles nets ; la base est le seul canal entre eux.

## Décision

Option 3, en quatre paquets :

- `apps/web` : Next.js 16. UI en Server Components, mutations en server actions, `POST /api/capture` et `GET /api/health` en route handlers.
- `apps/worker` : `croner`, **fenêtres** à 7 h, 12 h, 17 h et 22 h, plus une au démarrage (rattrapage après une nuit PC éteint). Chaque fenêtre exécute les sources dues puis le scoring, et écrit le heartbeat.
- `packages/core` : **toute** la logique métier et le schéma de base. Consommé en source TypeScript (pas de build) : `transpilePackages` côté Next, `tsx` côté worker.
- `apps/extension` : JS pur MV3, **n'importe pas `core`** (aucun build). Elle poste du texte ; le serveur fait le reste.

Frontières détaillées : PLAN §3.1. En résumé : un `if` métier dans `apps/*` est un bug de revue.

Communication web → worker : **aucune**. Le « lancer maintenant » exécute `core.ingest.runSource()` dans la server action. Un verrou en colonne (`sources.running_since`) évite qu'un run manuel et un run du worker se chevauchent. Pas d'IPC, pas de file. (Version initiale : le web écrivait `next_run_at = now()` et le worker scrutait la base chaque minute. Abandonné : le run direct est plus simple et donne un retour immédiat.)

Les appels LLM **synchrones** depuis le web (rescoring, capture, brouillons) sont autorisés : ils passent par `core` et l'app est locale, donc sans timeout serverless.

## Conséquences

- `pnpm dev` doit lancer deux processus (`pnpm -r --parallel dev`).
- L'état « le worker tourne-t-il ? » doit être visible : table `worker_heartbeat` + bandeau dans l'UI.
- Le seul paquet partagé est `core`. Pas de `packages/ui`, `packages/config` ni `packages/db` sans besoin constaté.
- Les sous-chemins d'export (`@jobhunt/core/domain` pur vs le reste `server-only`) empêchent d'embarquer du code serveur dans le bundle client.
