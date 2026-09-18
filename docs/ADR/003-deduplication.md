# ADR-003 — Stratégie de déduplication

**Statut** : accepté — 2026-09-17

## Contexte

Une même offre peut apparaître :

- plusieurs fois dans une source (mise à jour, republication) ;
- dans plusieurs sources (ATS de l'entreprise + France Travail + agrégateur + capture LinkedIn).

Robin ne doit trier qu'une fois, et une offre ne doit être scorée qu'une fois. Les sources n'ont aucun identifiant commun. France Travail masque souvent le nom de l'entreprise.

## Options

1. **Hash du contenu seul**. Rate les doublons inter-sources : les descriptions diffèrent (FT reformate, les agrégateurs tronquent).
2. **Clé `entreprise + titre normalisés`**. Simple et efficace sur les cas nets ; rate les variations de titre (« Développeur Front-End React (H/F) » vs « Frontend Engineer – React »).
3. **Clé + similarité trigram (`pg_trgm`) sur le titre, bornée à la même entreprise et à une fenêtre temporelle.** Rattrape les variations courantes, reste explicable et se règle avec un seul seuil.
4. **Embeddings sémantiques**. Plus robuste, mais il faut une API d'embeddings (Anthropic n'en fournit pas ; ce serait un fournisseur de plus), un index vectoriel et un seuil flou. Disproportionné.

## Décision

Trois niveaux :

1. `(source_id, external_id)` unique → upsert. Même annonce, même source.
2. `content_hash` (titre + entreprise + description normalisés) : détection de modification **et** clé du cache LLM. Ce n'est pas un critère de rattachement.
3. **Cluster** (`job_clusters`), qui porte le tri de Robin et le score affiché. Rattachement :
   - `dedup_key` exacte (`company_norm|title_norm`) sur un cluster vu dans les 45 derniers jours ;
   - sinon même entreprise **et** `similarity(title_norm) ≥ 0.75` sur 45 jours ;
   - sinon nouveau cluster, lié à un ancien cluster clos de même clé via `previous_cluster_id` (republication).

   Entreprise inconnue → pas de rattachement inter-sources. Action manuelle « fusionner » pour les ratés.

Seuil (0.75) et fenêtre (45 jours) sont des constantes dans `core/src/dedup/config.ts`, calibrées sur des cas réels au J4/J5.

## Conséquences

- Il faut normaliser le titre (`H/F`, `F/H`, `CDI`, `Full remote`, ponctuation, accents) et l'entreprise (formes juridiques). Ce sont des fonctions pures et testées.
- Les faux positifs (deux postes différents au titre proche dans la même boîte, ex. « Senior Frontend » vs « Frontend ») sont possibles : `senior`/`lead` sont **conservés** dans `title_norm` pour limiter ce cas.
- Les doublons FT sans entreprise restent visibles. Tolérable, parce que FT est une source secondaire.
- Signal de révision : plus de 3 fusions manuelles par semaine → envisager les embeddings.
