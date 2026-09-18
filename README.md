# JobHunt

Outil personnel de recherche d'emploi (CDI full remote en France, front-end React/Next.js ou fullstack JS/TS) :
agrégation d'offres depuis les ATS publics et quelques job boards, filtre déterministe, scoring LLM, tri au clavier,
suivi des candidatures, capture manuelle depuis le navigateur, candidatures spontanées.

Tout tourne en local. Documentation : [docs/PLAN.md](docs/PLAN.md), [docs/ROADMAP.md](docs/ROADMAP.md),
[docs/ADR/](docs/ADR/), conventions de développement : [CLAUDE.md](CLAUDE.md).

## Démarrage

Prérequis : Node 24 LTS, corepack (fournit pnpm 12), Docker Desktop (WSL2).

> La base tourne dans Docker parce que Smart App Control bloque les binaires PostgreSQL pour Windows sur ce poste : voir [ADR-008](docs/ADR/008-postgres-docker.md).

```bash
# 1. Base (rôle, mot de passe et base « jobhunt » créés par l'image)
docker compose up -d

# 2. Configuration
cp .env.example .env            # DATABASE_URL est déjà bonne ; renseigner ANTHROPIC_API_KEY et CAPTURE_TOKEN

# 3. Installation et schéma
pnpm install
pnpm db:migrate

# 4. Registre de départ (34 entreprises + Jobicy ; France Travail désactivé tant que les identifiants manquent)
pnpm --filter @jobhunt/worker seed-sources

# 5. Premier remplissage, puis l'app + le worker
pnpm ingest --all
pnpm dev                        # http://127.0.0.1:3000
```

Au quotidien : `docker compose up -d` puis `pnpm start:all` (build + web + worker). Le worker passe à 7 h, 12 h, 17 h, 22 h et au démarrage.

## Commandes utiles

| Commande | Effet |
|---|---|
| `pnpm ingest [--all \| --source <id>] [--no-score]` | Exécute les sources dues (ou toutes, ou une) puis le scoring |
| `pnpm score [--cluster <id> --force]` | Score les offres en attente |
| `pnpm --filter @jobhunt/worker dry-run [--verbose]` | Teste les boards et le filtre **sans base** |
| `pnpm --filter @jobhunt/worker refilter` | Réapplique `profile/criteria.json` |
| `pnpm db:backup` | `pg_dump` dans `./backups/` (8 derniers conservés ; passe par le conteneur si `pg_dump` n'est pas sur le poste) |
| `pnpm db:purge-contacts --yes` | Supprime tous les contacts (fin de recherche, RGPD) |
| `pnpm typecheck && pnpm lint && pnpm test` | Vérifications |
| `DATABASE_URL_TEST=… pnpm test` | + tests d'intégration sur une base **dédiée** (vidée) |

## Personnalisation

- `profile/cv.md` : CV injecté dans les prompts.
- `profile/criteria.json` : critères du filtre (regex), relus à chaud.
- `profile/boards.json` : registre de départ. Ensuite, ajouter des entreprises depuis `/sources` en collant l'URL de leur page carrières.
- `packages/core/prompts/*.vN.md` : prompts versionnés (ne jamais modifier une version utilisée).

## Extension de capture

Voir [apps/extension/README.md](apps/extension/README.md).
