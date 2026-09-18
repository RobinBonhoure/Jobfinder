# JobHunt — Fiches sources

> Vérifié le 2026-09-17. Deux méthodes :
> - **(doc)** : documentation officielle lue (WebFetch) ;
> - **(sondé)** : requête GET réelle sur l'endpoint public, anonyme, réponse observée.
>
> Tout le reste est marqué `[À VÉRIFIER]` et repris dans la liste en fin de document.
>
> Effort : estimé en heures pour l'adaptateur `fetch` + `normalize` + fixture + tests, une fois le socle J1 fait.

Modèle cible : `NormalizedJob` (PLAN §4.3). Les champs **manquants** listés ci-dessous sont ceux qu'il faut déduire du texte (`normalize/*`) ou laisser `unknown`/`null`.

---

## Flux ATS publics

### Greenhouse — priorité 1 (J1)

| | |
|---|---|
| Endpoint | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` (doc + sondé) |
| Auth | Aucune pour les GET (doc) |
| Format | JSON `{ jobs: [...], meta: { total } }` (sondé). Pas de pagination documentée : liste complète. |
| Rate limit | Non documenté (doc). Politique maison : 1 run toutes les 6 h par board. |
| Champs observés | `id`, `internal_job_id`, `title`, `company_name`, `location.name`, `absolute_url`, `updated_at`, `first_published`, `language`, `application_deadline`, `content` (HTML **échappé**), `departments`, `offices`, `metadata`, `data_compliance`, `requisition_id` (sondé) |
| Manquants | Politique remote (à déduire de `location.name` + texte), type de contrat, séniorité, salaire (parfois dans `metadata` ou le texte) |
| Effort | 2 h |
| Risque | Faible. Des boards peuvent vivre sur l'instance EU (`job-boards.eu.greenhouse.io`) `[À VÉRIFIER : l'API boards-api couvre-t-elle aussi les boards EU ?]`. Un board à 450 offres (Datadog) → filtre `role` indispensable. `company_name` présent dans la réponse (vérifié). |

### Lever — priorité 2 (J4)

| | |
|---|---|
| Endpoint | `GET https://api.lever.co/v0/postings/{company}?mode=json` ; instance EU : `https://api.eu.lever.co/v0/postings/{company}` (doc) |
| Auth | Aucune pour les GET (doc) |
| Format | Tableau JSON. Pagination `skip`/`limit` ; filtres `location`, `commitment`, `team`, `department`, `level` (doc) |
| Rate limit | Seuls les POST de candidature sont documentés (2/s). Politique maison : 6 h. |
| Champs | `id`, `text` (titre), `categories` (location, commitment, team…), `country`, `workplaceType`, `description`, `descriptionPlain`, `lists`, `additional`, `hostedUrl`, `applyUrl`, `salaryRange` (doc) |
| Manquants | Séniorité, contrat (`categories.commitment` est libre, ex. « Full-time »). `createdAt` (ms) présent (vérifié sur Qonto). `workplaceType` : `remote`, `hybrid`, `on-site`. |
| Effort | 2 h (config `region: 'global' \| 'eu'`) |
| Risque | Faible. Sondage sur `lever` → `[]` (la société elle-même n'a pas d'offre) : l'endpoint répond bien. |

### Ashby — priorité 2 (J4)

| | |
|---|---|
| Endpoint | `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}?includeCompensation=true` (doc + sondé) |
| Auth | Aucune (sondé) |
| Format | JSON `{ jobs: [...] }` |
| Rate limit | Non documenté. Politique maison : 6 h. |
| Champs | `id`, `title`, `department`, `team`, `employmentType` (FullTime/PartTime/Intern/Contract/Temporary), `location`, `secondaryLocations`, `address`, `isRemote`, `workplaceType` (OnSite/Remote/Hybrid), `descriptionHtml`, `descriptionPlain`, `publishedAt`, `jobUrl`, `applyUrl`, `isListed`, `compensation` (doc + sondé) |
| Manquants | Contrat de droit français (`FullTime` ≠ CDI), séniorité |
| Effort | 1,5 h. **Meilleure source structurée pour le remote.** |
| Risque | Faible. Ignorer `isListed = false`. |

### SmartRecruiters — priorité 3 (J4)

| | |
|---|---|
| Endpoint | `GET https://api.smartrecruiters.com/v1/companies/{companyIdentifier}/postings?limit=100&offset=N` (sondé) ; détail : `…/postings/{id}` (sondé : `jobAd.sections.{companyDescription, jobDescription, qualifications, additionalInformation}`) |
| Auth | Aucune (sondé) |
| Format | JSON `{ offset, limit, totalFound, content: [...] }` (sondé) |
| Rate limit | Non vérifié `[À VÉRIFIER]` (doc redirigée vers developers.smartrecruiters.com, non lue). Politique maison : 6 h, 1 req/s. |
| Champs (liste) | `id`, `name`, `uuid`, `refNumber`, `company`, `releasedDate`, `location { city, region, country, remote, hybrid, fullLocation }`, `industry`, `department`, `function`, `typeOfEmployment`, `experienceLevel` (sondé, partiel) |
| Manquants | Description dans la liste → **un appel par offre** (N+1), à ne faire que pour les offres qui passent le pré-filtre sur titre et remote |
| Effort | 3 h |
| Risque | Moyen : volume d'appels (N+1). Les drapeaux `remote`/`hybrid` structurés sont un vrai plus. |

### Recruitee — priorité 3 (J4)

| | |
|---|---|
| Endpoint | `GET https://{company}.recruitee.com/api/offers/` (doc) |
| Auth | Aucune (sondé sur `aikidosecurity.recruitee.com`) |
| Format | JSON `{ offers: [...] }` (sondé). `employment_type_code` ex. `fulltime_permanent` ; dates au format `2026-09-16 23:31:24 UTC`. |
| Rate limit | Non documenté. Politique maison : 6 h. |
| Champs | `id`, `slug`, `title`, `description`, `requirements`, `location`, `city`, `country_code`, `remote`, `hybrid`, `on_site`, `employment_type_code`, `experience_code`, `published_at`, `careers_url` (doc) |
| Manquants | Salaire |
| Effort | 1,5 h |
| Risque | Faible. Recruitee est répandu chez les PME européennes. |

### Teamtailor — priorité 3 (J4)

| | |
|---|---|
| Endpoint | Flux RSS public `https://{sub}.teamtailor.com/jobs.rss` (ou domaine carrière personnalisé + `/jobs.rss`) (sondé sur `career.teamtailor.com/jobs.rss`) |
| Auth | Aucune (sondé). L'API JSON Teamtailor exige une clé de l'entreprise : non utilisable. |
| Format | RSS 2.0 + namespace `tt:` (sondé) |
| Rate limit | Non documenté. Politique maison : 6 h. |
| Champs observés | `title`, `description` (HTML), `link`, `guid`, `pubDate`, **`remoteStatus`** (ex. `hybrid`), `tt:department`, `tt:role`, `tt:locations/tt:location/{tt:name, tt:city, tt:country, tt:zip, tt:address}` (sondé) |
| Manquants | Contrat, séniorité, salaire |
| Effort | 2 h (`fast-xml-parser`) |
| Risque | Faible. Valeurs observées de `remoteStatus` : `hybrid`, `none` ; `fully`/`temporary` supposées `[À VÉRIFIER]`. |

### Workable — reporté

| | |
|---|---|
| Endpoint | `[À VÉRIFIER]`. `https://apply.workable.com/api/v1/widget/accounts/{sub}` → **404** ; `POST https://apply.workable.com/api/v3/accounts/{sub}/jobs` → **404** ; `https://www.workable.com/api/accounts/{sub}` → redirection Cloudflare (tous sondés le 2026-09-17). |
| Auth | L'API officielle Workable exige un token de l'entreprise. |
| Effort | Inconnu |
| Risque | **Élevé** : aucun endpoint public confirmé, protection Cloudflare. Ne pas intégrer sans endpoint documenté. |

---

## Job boards avec API

### API France Travail — Offres d'emploi v2 — priorité 2 (J5)

| | |
|---|---|
| Endpoint | `GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search` (recherche web : sources communautaires + fiche data.gouv) `[À VÉRIFIER sur francetravail.io, page non lisible par WebFetch]` |
| Auth | OAuth2 client credentials. Token : `POST https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire`, scope `api_offresdemploiv2 o2dsoffre` `[À VÉRIFIER]`. Compte et application à créer sur francetravail.io. |
| Format | JSON `{ resultats: [...], filtresPossibles }`, pagination par `range=debut-fin` (150 max par page, **index max 3000**) `[À VÉRIFIER]`. Réponse `206` pour une page partielle `[À VÉRIFIER]`. |
| Paramètres utiles | `motsCles`, `typeContrat=CDI`, `minCreationDate` / `maxCreationDate` (ISO), `range`, `codeROME`, `experience`, `departement` `[À VÉRIFIER : noms exacts]` |
| Rate limit | **10 req/s** (recherche web) `[À VÉRIFIER]` → throttle à 150 ms |
| Gratuité | Gratuit (fiche data.gouv « API Offres d'emploi ») `[À VÉRIFIER : conditions]` |
| Champs | `id`, `intitule`, `description`, `dateCreation`, `dateActualisation`, `lieuTravail`, `romeCode`, `entreprise { nom, … }`, `typeContrat`, `experienceExige`, `salaire.libelle`, `origineOffre.urlOrigine`, `qualificationLibelle` `[À VÉRIFIER : liste exacte]` |
| Manquants | Politique remote (pas de filtre télétravail connu `[À VÉRIFIER]`) ; entreprise souvent absente ; beaucoup d'offres d'ESN et de cabinets |
| Effort | 5 h (OAuth + fenêtres de dates + découpage) |
| Risque | Moyen : **bruit élevé** (régie, ESN, hybride non signalé). Dédup inter-sources limitée faute d'entreprise. `origineOffre.urlOrigine` peut pointer vers un partenaire (Indeed, etc.) : ne jamais le fetcher. |

### Jobicy — priorité 3 (J5)

| | |
|---|---|
| Endpoint | `GET https://jobicy.com/api/v2/remote-jobs?count=50&geo={slug}&industry=engineering&tag=react` (doc) |
| Auth | Aucune (doc) |
| Format | JSON ; taxonomies via `?get=locations` et `?get=industries` (doc) |
| Rate limit | « Pas plus d'une fois par heure » ; « quelques fois par jour suffisent » (doc). Politique maison : 6 h. |
| Champs | `id`, `url`, `jobTitle`, `companyName`, `companyLogo`, `jobIndustry`, `jobType`, `jobGeo`, `jobLevel`, `jobExcerpt`, `jobDescription` (HTML), `pubDate`, `salaryMin`/`salaryMax`/`salaryCurrency`/`salaryPeriod` (doc) |
| Manquants | Contrat de droit français |
| Effort | 1,5 h |
| Risque | Faible pour le code ; slugs `geo` `france` et `europe` disponibles (vérifié via `?get=locations`) ; `geo=france` renvoie aussi des offres multi-pays, que le LLM tranche. CGU : conserver l'URL Jobicy, créditer la source, ne pas présenter les offres comme siennes. |

### Remotive — reporté (signal : ROADMAP)

| | |
|---|---|
| Endpoint | `GET https://remotive.com/api/remote-jobs?category=software-dev&search=react&limit=100` (doc) |
| Auth | Aucune |
| Rate limit | **4 appels par jour maximum** ; au-delà de 2 par minute, blocage (doc) |
| CGU | Lien retour et crédit obligatoires ; offres **publiées avec 24 h de retard** dans l'API ; pas de redistribution (doc) |
| Champs | `id`, `url`, `title`, `company_name`, `company_logo`, `category`, `job_type`, `publication_date`, `candidate_required_location`, `salary`, `description` (HTML) (doc) |
| Manquants | Contrat de droit français, séniorité |
| Effort | 1 h |
| Risque | Faible techniquement ; rendement faible (flux mondial). |

### RemoteOK — reporté

| | |
|---|---|
| Endpoint | `GET https://remoteok.com/api` (sondé). Le 1er élément du tableau est un avis légal. |
| CGU | « Please link back (with follow…) to the URL on Remote OK and mention Remote OK as a source » ; logo interdit sans accord écrit (sondé) |
| Champs | `id`, `slug`, `epoch`, `date`, `company`, `position`, `tags`, `description` (HTML), `location`, `salary_min`, `salary_max`, `url`, `apply_url` (sondé) |
| Rate limit | Non documenté `[À VÉRIFIER]` |
| Effort | 1 h |
| Risque | Rendement très faible pour la France ; flux majoritairement US. |

### WeWorkRemotely — reporté

| | |
|---|---|
| Endpoint | RSS par catégorie, ex. `https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss` → `200 application/rss+xml` (sondé). La page d'index des flux renvoie 403 à WebFetch. |
| CGU | `[À VÉRIFIER]` |
| Champs | `[À VÉRIFIER : title, region, category, type, pubDate, link, description]` |
| Effort | 1,5 h |
| Risque | Rendement faible (US) ; CGU inconnues. |

### Adzuna — reporté

| | |
|---|---|
| Endpoint | `GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}?app_id=…&app_key=…` (doc). `fr` : l'endpoint répond `400` sans clé (sondé), ce qui suggère que la France est gérée `[À VÉRIFIER avec une clé]`. |
| Auth | `app_id` + `app_key` après inscription (doc) |
| Quotas par défaut | 25 appels/min, 250/jour, 1 000/semaine, 2 500/mois (source : CGU Adzuna, via recherche web) `[À VÉRIFIER sur la page CGU]` |
| Champs | `[À VÉRIFIER : id, title, description (tronquée ?), company.display_name, location, created, redirect_url, contract_type, contract_time, salary_min/max]` |
| Risque | Descriptions probablement tronquées, donc scoring moins bon ; recouvrement avec France Travail ; attribution selon les CGU. |

---

## Capture manuelle (extension)

| | |
|---|---|
| Mécanisme | Extension Chrome MV3, déclenchée par un clic ; envoie `url`, `pageTitle` et `innerText` (ou la sélection) à `POST /api/capture` |
| Auth | `Authorization: Bearer CAPTURE_TOKEN` |
| Parsing | Extraction LLM structurée (Haiku 4.5) vers `NormalizedJob` |
| Champs manquants | Dépend de la page : `external_id` = hash de l'URL canonique |
| Effort | 2 soirées (J6) |
| Risque | **Faible** tant que la capture reste à l'unité et déclenchée par l'utilisateur, et que le serveur ne requête jamais le site. LinkedIn change souvent son DOM, mais `innerText` + LLM y est insensible. |

### Sites exclus de toute intégration automatique

| Site | Raison |
|---|---|
| LinkedIn | CGU (extraction automatisée interdite), anti-bot, risque pour le compte de Robin. Capture manuelle seulement. |
| Welcome to the Jungle | Pas d'API publique connue `[À VÉRIFIER]` ; CGU `[À VÉRIFIER]`. Capture manuelle seulement. |
| Indeed | CGU restrictives `[À VÉRIFIER]`, anti-bot. Hors périmètre. |

---

## Module B — entreprises et contacts

### API Recherche d'entreprises (data.gouv) — J7

| | |
|---|---|
| Endpoint | `GET https://recherche-entreprises.api.gouv.fr/search?...` et `/near_point` (OpenAPI sondé) |
| Auth | Aucune (« totalement ouverte d'accès », OpenAPI) |
| Rate limit | **7 req/s par IP**, 30 req/s par ASN (OpenAPI) → throttle à 200 ms |
| Filtres utiles | `q`, `activite_principale`, `section_activite_principale`, `tranche_effectif_salarie`, `categorie_entreprise`, `departement`, `region`, `code_postal`, `etat_administratif`, `nature_juridique`, `ca_min`/`ca_max`, `minimal`, `include`, `page`, `per_page`, `sort_by_size` (OpenAPI) |
| Champs observés | `siren`, `nom_complet`, `nom_raison_sociale`, `sigle`, `nombre_etablissements(_ouverts)`, `siege { activite_principale, activite_principale_naf25, adresse, code_postal, date_creation, departement, etat_administratif, caractere_employeur, coordonnees, … }` (sondé) |
| Manquants | **Site web et email absents**. Recherche manuelle du site nécessaire. |
| Limites | Pas d'accès aux entreprises non diffusibles ; ne donne pas toute la base Sirene (OpenAPI). `per_page` max `[À VÉRIFIER]`. |
| Effort | 2 h (recherche + enrichissement) |
| Risque | Faible techniquement ; **faible rendement** (ESN sur-représentées). Transition **NAF 2025** en cours (champ `activite_principale_naf25`, ex. `62.03Z` → `62.20H`) `[À VÉRIFIER : codes NAF25 équivalents à 62.01Z / 62.02A / 63.11Z et date de bascule du filtre]`. |

### API SIRENE (INSEE) / Pappers — non retenues

- API SIRENE INSEE : compte requis `[À VÉRIFIER]` ; n'apporte ni site ni email. Inutile au-delà de recherche-entreprises.
- Pappers : offre API majoritairement payante `[À VÉRIFIER : existence et quotas d'un palier gratuit]`. Non retenue.

### Annuaires French Tech / listes remote-first

- Utilisation **humaine** (lecture), pas d'intégration. `[À VÉRIFIER : existence d'un export ou d'une API officielle French Tech]`.

### Sites d'entreprise (crawl des contacts) — J7

| | |
|---|---|
| Mécanisme | Déclenché manuellement : `robots.txt`, puis 6 pages max, 1 req/s, liste blanche d'emails génériques, puis vérification MX (`node:dns/promises`) |
| Risque | Faible (volume minime, déclenchement humain, `robots.txt` respecté). Des sites en JavaScript sans HTML serveur ne donneront rien : repli sur la saisie manuelle. |

---

## Liste consolidée des `[À VÉRIFIER]`

1. Greenhouse : l'API `boards-api.greenhouse.io` couvre-t-elle les boards hébergés sur l'instance EU (`job-boards.eu.greenhouse.io`) ?
2. ~~Lever : `createdAt`~~ — vérifié.
3. SmartRecruiters : rate limit (lire developers.smartrecruiters.com). Détail et description : vérifiés.
4. ~~Recruitee : auth et enveloppe~~ — vérifiés.
5. Teamtailor : valeurs possibles de `remoteStatus`.
6. Workable : existence d'un endpoint public de listing (tous les sondages ont échoué).
7. France Travail : URL de recherche, URL de token, scope, format `range`/`206`, limite de 10 req/s, noms exacts des paramètres, gratuité et conditions, existence d'un champ ou filtre télétravail. Source actuelle : recherche web et dépôts communautaires ; la page francetravail.io n'était pas lisible.
8. ~~Jobicy : slug `geo`~~ — vérifié.
9. RemoteOK : rate limit.
10. WeWorkRemotely : CGU et champs RSS.
11. Adzuna : prise en charge de `fr` avec clé, quotas exacts sur la page CGU, champs et troncature des descriptions.
12. Welcome to the Jungle : absence d'API publique et CGU. Indeed : CGU.
13. Recherche d'entreprises : `per_page` maximum ; codes NAF 2025 équivalents et date de bascule.
14. INSEE SIRENE : modalités d'accès. Pappers : palier gratuit.
15. French Tech : export ou API officielle ; listes d'entreprises remote-first fiables.
16. CGU des ATS (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Teamtailor) sur la consommation tierce des endpoints publics.
17. ~~Next.js 16.3 + TypeScript 7~~ — vérifié en pratique.
18. ~~pnpm 12 : `allowBuilds`~~ — vérifié (esbuild seul).
19. Doctolib (Ashby) publie ses CDI avec `employmentType: "Contract"` : un libellé « Contract » seul n'est plus interprété comme freelance (Ashby, SmartRecruiters, libellés génériques).
