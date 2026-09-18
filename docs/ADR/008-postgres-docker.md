# ADR-008 — Base de données : PostgreSQL 18 dans Docker Compose

**Statut** : accepté — 2026-09-18 (choix de Robin). Révise la décision du 2026-09-17 (« Postgres 18 natif »), abandonnée : les binaires PostgreSQL pour Windows ne démarrent pas sur ce poste.

## Contexte

Tout tourne sur la machine de Robin : app, worker et base. Le PC est éteint le soir et la nuit, ce qui est accepté.

**Constat du 2026-09-17 : Smart App Control bloque les binaires PostgreSQL.** L'installation via winget (EDB 18.6-3) dépose les fichiers, mais `initdb` échoue avec le code `-1058471934` (`0xC0E90002`, *STATUS_SYSTEM_INTEGRITY_POLICY_VIOLATION*). Le journal *CodeIntegrity* montre que Smart App Control, actif sur le poste (`VerifiedAndReputablePolicyState = 1`), refuse de charger `libcrypto-3-x64.dll`, non signée. Aucun exécutable Postgres ne démarre : `initdb`, `psql`, `pg_ctl`, `pg_dump`.

Docker Desktop est signé et exécute Postgres dans sa VM Linux : Smart App Control n'est pas concerné.

## Options

1. **Postgres natif Windows** : écarté, voir ci-dessus. Il faudrait désactiver Smart App Control (protection du système, pas toujours réactivable) ou trouver une distribution entièrement signée `[À VÉRIFIER]`.
2. **Neon** (Postgres managé, offre gratuite), évalué le 2026-09-17 : rien à installer, mais 100 CU-h par mois (au-delà, base suspendue), 0,5 Go, mise en veille après 5 min non modifiable, restauration à un instant T limitée à 6 h, pooler en mode transaction, latence réseau, et données hébergées par un tiers. Ces contraintes imposaient une rétention, un export JSON et un worker conçu pour laisser la base dormir.
3. **Docker Compose avec `postgres:18`** : version épinglée dans le dépôt, remise à zéro en une commande, aucun quota, données sur la machine. Demande WSL2 et Docker Desktop, et un lancement du conteneur avant l'app.

## Décision

**Option 3.** `docker-compose.yml` à la racine :

- image `postgres:18`, rôle, mot de passe et base `jobhunt` ;
- port publié sur **`127.0.0.1:5432` uniquement** : la base n'est pas exposée au réseau ;
- volume nommé `jobhunt-pgdata` monté sur **`/var/lib/postgresql`** — et non `/var/lib/postgresql/data` : depuis l'image 18, `PGDATA` vaut `/var/lib/postgresql/18/docker` et c'est `/var/lib/postgresql` qui est déclaré comme `VOLUME` ;
- `restart: unless-stopped` : la base revient avec Docker Desktop au démarrage de la session ;
- `healthcheck` sur `pg_isready` ;
- `POSTGRES_INITDB_ARGS: --locale=C --encoding=UTF8`.

`POSTGRES_USER` est superutilisateur dans l'image : la migration `0000_extensions.sql` peut créer `pg_trgm`, `citext` et `pgcrypto`.

## Conséquences

- Prérequis machine : Node 24, pnpm (via corepack), **WSL2 + Docker Desktop**.
- `DATABASE_URL=postgres://jobhunt:jobhunt@localhost:5432/jobhunt`. Le mot de passe est trivial parce que la base n'écoute que sur la boucle locale ; à changer si le port est un jour publié.
- **Sauvegarde** : `pnpm db:backup` utilise le `pg_dump` du poste s'il existe, sinon celui du conteneur (`docker compose exec -T db pg_dump`). Restauration : `docker compose exec -T db pg_restore -U jobhunt -d jobhunt --clean < backups/<fichier>.dump`.
- Il faut démarrer la base avant l'app : `docker compose up -d`. L'UI affiche une bannière explicite si la base est injoignable.
- Le worker garde son fonctionnement par fenêtres (PLAN §6.3) : ce n'est pas une contrainte technique, mais c'est plus simple à lire.
- Une montée de version majeure (19+) se fera par dump/restore, en changeant la ligne `image:`.
- Un déploiement futur demandera une base hébergée : restauration d'un dump, puis changement de `DATABASE_URL`. Le code ne dépend que de cette variable.

## Banc de test pendant le développement

Docker n'étant pas installé lors de l'écriture du code, l'application a été validée contre **PGlite** (Postgres compilé en WebAssembly, non concerné par Smart App Control), exposé par `@electric-sql/pglite-socket` avec `pg_trgm`, `citext` et `pgcrypto`, installé hors du dépôt. PGlite multiplexe toutes les connexions sur un seul backend : il faut alors `DATABASE_POOL_MAX=1`. Ce banc reste utilisable pour tester sans Docker ; la vérification de référence est `DATABASE_URL_TEST` sur une vraie base Postgres.

## Signal de révision

Besoin d'accéder aux données hors de ce PC (déploiement, second poste) → base hébergée ; Neon reste l'option documentée ci-dessus.
