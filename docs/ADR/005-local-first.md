# ADR-005 — Tout en local (app, worker, base)

**Statut** : accepté — 2026-09-17 (validé par Robin, y compris PC éteint le soir et la nuit)

## Contexte

L'outil sert à une seule personne, sur sa machine de travail. Robin éteint son PC le soir et la nuit, et l'accepte : le worker ne tourne que quand le PC est allumé.

## Options

1. **Tout en local** : app Next, worker et PostgreSQL 18 dans un conteneur sur la même machine (ADR-008).
2. **App et worker en local, base hébergée (Neon)** : écarté, voir ADR-008.
3. **Worker seul hébergé** (Railway, ou `pnpm ingest` planifié dans GitHub Actions) : ingestion même PC éteint, sans authentification puisque rien n'est exposé. Mais il faut une base accessible depuis Internet, un service de plus et un coût éventuel, pour un gain limité aux offres de la nuit.
4. **Tout déployé** : disponible 24/7 et depuis le mobile, mais il faut une authentification, des secrets et un déploiement à maintenir.
5. **Vercel + cron serverless** : incompatible avec le polling de dizaines de sources (timeouts, limites de cron) et avec un processus long. Exclu par le cadrage.

## Décision

Option 1.

- Next écoute sur `127.0.0.1`, Postgres sur `localhost` : **pas d'authentification**.
- Seul `/api/capture` exige un token (`CAPTURE_TOKEN`) : n'importe quelle page web ouverte dans le navigateur pourrait sinon tenter un POST vers localhost.
- **Rattrapage** : la fenêtre de démarrage du worker exécute toutes les sources dont `next_run_at` est dépassé. Les offres publiées la nuit sont récupérées le matin : les ATS les gardent ouvertes des semaines, et France Travail est interrogé par plage de dates avec recouvrement.
- Pas d'hypothèse « serverless » dans le code (actions longues autorisées), mais pas non plus d'hypothèse « machine unique » difficile à défaire : état en base uniquement, configuration par variables d'environnement, aucun fichier d'état local.

## Conséquences

- Seule perte : une offre publiée puis retirée pendant que le PC est éteint. Rare, et acceptée.
- Sauvegarde locale nécessaire (`pnpm db:backup`).
- Chemin de sortie, par ordre de légèreté :
  1. worker seul hébergé (GitHub Actions ou Railway), avec base hébergée ;
  2. tout déployé, avec authentification via `proxy.ts` (le nouveau nom de `middleware` en Next 16).

  Le découpage ADR-002 rend ces passages directs. Signaux : voir ROADMAP « Reporté ».
