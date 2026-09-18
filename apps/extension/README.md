# Extension de capture JobHunt

Extension Chrome MV3, sans build, chargée en mode non empaqueté.

## Installation

1. Génère un token et mets-le dans `.env` : `CAPTURE_TOKEN=...`
   (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), puis relance l'app.
2. Dans Chrome : `chrome://extensions` → activer le **mode développeur** → **Charger l'extension non empaquetée** → choisir ce dossier.
3. Dans les options de l'extension, colle le token, puis clique sur « Tester la connexion ».

## Utilisation

- Sur une offre (LinkedIn, Welcome to the Jungle, site carrière…), clique sur l'icône JobHunt.
- Pour une capture propre sur une page chargée, **sélectionne le texte de l'offre** avant de cliquer : une sélection de plus de 200 caractères est envoyée à la place de la page.
- La fiche de l'offre s'ouvre dans un nouvel onglet avec son score. Le badge indique le score, `OK`, ou `ERR` (survoler l'icône pour le détail).

## Garde-fous

- Aucune exécution sans clic, aucune navigation, aucun parcours de liste : ce n'est pas un scraper.
- Le texte part uniquement vers `127.0.0.1:3000` / `localhost:3000` (`host_permissions`).
- Le serveur ne requête jamais l'URL capturée.
