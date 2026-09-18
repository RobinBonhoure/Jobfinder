# ADR-004 — Modèle LLM et pipeline de scoring

**Statut** : accepté — 2026-09-17

## Contexte

Il faut classer quelques dizaines d'offres par semaine selon leur adéquation au profil, et produire des éléments exploitables : red flags et accroche. Le coût doit rester négligeable. Une offre ne doit jamais être scorée deux fois.

Données vérifiées le 2026-09-17 (skill `claude-api` + documentation Anthropic) :

- `claude-haiku-4-5` : 1 $/M en entrée, 5 $/M en sortie, contexte de 200 000 tokens.
- **Structured outputs** (`output_config.format`) pris en charge par Haiku 4.5. Le SDK TS fournit `client.messages.parse()` + `zodOutputFormat()` (`@anthropic-ai/sdk/helpers/zod`), compatible Zod 4 (peer `^3.25 || ^4`). Les contraintes `min`/`max` ne sont pas envoyées à l'API ; le SDK les retire et **valide localement**.
- Minimum de prompt caching pour Haiku 4.5 : **4 096 tokens**.
- `@anthropic-ai/sdk` 0.126.0.

## Options

1. **Tout au LLM**. Coût multiplié par 10 et bruit : on scorerait des offres de commercial.
2. **Filtre déterministe + LLM sur les survivants** (le brief). Le filtre élimine l'explicite pour un coût nul.
3. **Embeddings + similarité au CV**. Aucune justification ni red flag, et un fournisseur de plus.
4. **Sonnet 5 plutôt que Haiku 4.5**. Environ 2 fois plus cher, pour une tâche de classification guidée par barème où Haiku suffit a priori.

## Décision

- Option 2, avec un **filtre qui ne rejette que l'explicite** ; les cas `unknown` sont tranchés par le LLM via `remote_verdict` et `contract_verdict`, ajoutés au schéma demandé.
- Modèle : `claude-haiku-4-5` (env `SCORING_MODEL`), sans thinking, `max_tokens` 1 024.
- Sortie : structured outputs avec `JobScoreSchema` (zod), revalidé localement.
- Cache : `llm_scores` unique sur `(content_hash, prompt_version, model)`. Changer de prompt ou de modèle invalide le cache de façon traçable ; un simple rafraîchissement de dates ne l'invalide pas.
- Prompt : `scoring.vN.md` versionné, jamais modifié en place. CV injecté depuis `profile/cv.md`.
- Échecs :
  - contenu invalide → 1 retry puis `failed` (bouton « rescorer ») ;
  - erreur d'infrastructure → rien n'est écrit, reprise à la fenêtre suivante du worker.
- Pas de prompt caching Anthropic (préfixe d'environ 2 500 tokens, sous le minimum de 4 096) ; pas de Batch API.
- Brouillons du module B : `claude-sonnet-5` par défaut (env `OUTREACH_MODEL`), parce que la qualité rédactionnelle compte et que le volume est faible.

## Conséquences

- Coût estimé : ≈ 0,0055 $ par offre, soit ≈ 0,30 à 0,55 $ par semaine. Suivi réel via `input_tokens`/`output_tokens`.
- Le jugement du LLM n'est pas parfait : la vue `/rejected` et le repêchage manuel sont indispensables.
- Évaluation manuelle au J2 sur 20 offres ; toute retouche du barème crée `scoring.v2`.
- Signal de révision : un ordre des scores régulièrement contraire au jugement de Robin → tester `claude-sonnet-5` sur les mêmes 20 offres, puis comparer.
