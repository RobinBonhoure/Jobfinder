# ADR-008 — Base de données : PostgreSQL 18 natif sous Windows

**Statut** : accepté — 2026-09-17 (choix de Robin). Remplace l'hypothèse « Postgres en Docker Compose » du cadrage.

## Contexte

Tout doit tourner sur la machine de Robin : app, worker et base. Le PC est éteint le soir et la nuit, ce qui est accepté. Docker n'est pas installé, WSL non plus (constaté le 2026-09-17).

## Options

1. **Docker Desktop + `postgres:18`** : version épinglée dans le repo, remise à zéro facile. Mais il faut installer WSL2, redémarrer, et une VM tourne en arrière-plan. Trop lourd pour une base mono-utilisateur.
2. **Neon, offre gratuite** (vérifié le 2026-09-17), envisagé puis écarté le même jour :
   - rien à installer ;
   - mais un quota de 100 CU-h par mois (au-delà, base suspendue jusqu'au mois suivant) ;
   - 0,5 Go de stockage ;
   - mise en veille après 5 min, non modifiable ;
   - restauration à un instant T limitée à 6 h ;
   - pooler en mode transaction (pas de `SET` de session, `LISTEN/NOTIFY` ni verrou consultatif) ;
   - latence réseau vers Francfort ;
   - données hébergées par un tiers.

   Ces contraintes imposaient une rétention, un export JSON et un worker conçu pour laisser la base dormir.
3. **PostgreSQL 18 natif** : `winget install PostgreSQL.PostgreSQL.18` (18.6 disponible le 2026-09-17), service Windows démarré automatiquement, `pg_dump`/`psql` fournis.

## Décision

**Option 3.**

- PostgreSQL 18 installé via winget, qui utilise l'installeur EDB.
- Écoute limitée à `localhost` (réglage par défaut de l'installeur `[À VÉRIFIER : listen_addresses après installation]`).
- Base `jobhunt` et rôle `jobhunt` dédié, sans utiliser le superutilisateur `postgres` dans l'app.
- Une seule variable `DATABASE_URL`.
- Extensions `pg_trgm`, `pgcrypto` et `citext` : ce sont des modules `contrib` livrés avec Postgres, créés par la première migration `[À VÉRIFIER au J1 : présents dans l'installation EDB]`.

## Conséquences

- Prérequis machine : Node 24, pnpm, PostgreSQL 18.
- Aucun quota, aucune latence, données sur la machine de Robin.
- Sauvegarde standard : `pnpm db:backup` (`pg_dump -Fc` dans `./backups/`, ignoré par git). `pg_dump` doit être dans le `PATH` (`C:\Program Files\PostgreSQL\18\bin`).
- Le worker garde son fonctionnement par fenêtres (PLAN §6.3). Ce n'est plus une contrainte, mais c'est plus simple : les intervalles des sources sont de 6 h ou plus, et le heartbeat est lisible.
- La version n'est pas épinglée dans le repo : `STACK.md` et `CLAUDE.md` indiquent Postgres 18.
- Une montée de version majeure (19+) passera par `pg_upgrade` ou dump/restore. Improbable pendant la durée de la recherche.
- Un déploiement futur demandera une base hébergée (Neon ou celle de Railway) : restauration d'un `pg_dump`, puis on change `DATABASE_URL`.

## Constat du 2026-09-17 : Smart App Control bloque PostgreSQL

L'installation via winget (EDB 18.6-3) dépose les fichiers, mais `initdb` échoue (code `-1058471934` = `0xC0E90002`, *STATUS_SYSTEM_INTEGRITY_POLICY_VIOLATION*). Le journal *CodeIntegrity* montre que **Smart App Control**, actif sur le poste (`VerifiedAndReputablePolicyState = 1`), refuse de charger `libcrypto-3-x64.dll`, qui n'est pas signée. Aucun exécutable Postgres (`initdb`, `psql`, `pg_ctl`, `pg_dump`) ne démarre. Robin a choisi d'installer Postgres lui-même.

Pistes, par ordre de préférence :
1. un Postgres Windows dont toutes les DLL sont signées ou reconnues par Smart App Control `[À VÉRIFIER]` ;
2. Docker Desktop (binaire signé, Postgres dans la VM Linux ; demande WSL2) ;
3. Neon (option documentée ci-dessus) ;
4. désactiver Smart App Control : décision de Robin, pas toujours réversible.

Le code ne dépend que de `DATABASE_URL` : les quatre pistes n'impliquent aucune modification de l'application.

Pour les tests pendant le développement, l'application a été validée contre PGlite (Postgres compilé en WebAssembly, non bloqué), exposé par `@electric-sql/pglite-socket` avec `pg_trgm`, `citext` et `pgcrypto`, hors du dépôt. PGlite multiplexe toutes les connexions sur un seul backend : il faut alors `DATABASE_POOL_MAX=1`.

## Signal de révision

Besoin d'accéder aux données hors de ce PC (déploiement, second poste) → base hébergée ; Neon reste l'option documentée ci-dessus.
