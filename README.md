# PR-DEX

Un pokédex personnel qui se remplit tout seul depuis les pull requests mergées sur
GitHub. Chaque PR mergée tire, de façon déterministe, un Pokémon à partir du SHA de
son commit de merge — l'ouverture se joue comme un booster, dans l'application.

Aucun backend : le jeu s'appuie uniquement sur l'API GitHub et deux fichiers JSON qui
servent de base de données.

## Lancer en local

```bash
npm install
npm run dev
```

L'application a besoin d'un jeton et d'un repo de données pour fonctionner (voir plus
bas). Pour l'essayer sans backend et sans jeton, ouvrir l'URL avec `?demo` :

```
http://localhost:5173/?demo
```

Ce mode charge 40 fausses PR (`src/fixtures/demo.js`, chargé dynamiquement, jamais
inclus dans le build de production) : toute l'interface est cliquable sans compte ni
connexion réseau.

## Tests

```bash
npm test
```

## Les deux repos

L'application est répartie sur deux repos GitHub, volontairement :

- un repo **public** — celui-ci — qui contient la coquille de l'application, servie
  par GitHub Pages. Un repo public est gratuit sur Pages ; un repo privé demande une
  offre payante. Le build ne contient strictement aucune donnée de jeu : aucun nom de
  repo réel, aucune capture, aucun état ne sont compilés dedans, donc le rendre public
  ne fuite rien.
- un repo **privé** qui contient `data/` : c'est la base de données du jeu.

Deux fichiers, chacun avec un seul écrivain :

| Fichier              | Écrit par                                          | Contenu                          |
|-----------------------|----------------------------------------------------|-----------------------------------|
| `data/catches.json`   | uniquement l'Action `catch.yml`, en append-only     | l'historique des captures         |
| `data/state.json`     | uniquement le navigateur, via l'API REST contents (concurrence optimiste sur le SHA du blob) | ce que le joueur a réclamé, dépensé, fait évoluer |

`species` et `shiny` sont dérivés du SHA du commit au moment de la capture, mais
**stockés** dans `catches.json` plutôt que recalculés à la volée. Ainsi, un futur
changement de l'algorithme de tirage (`shared/draw.js`) ne réécrit jamais l'historique
des captures déjà faites — seules les nouvelles entrées suivent la nouvelle règle.

## Les deux jetons

Deux Personal Access Tokens (PAT) fine-grained, avec des portées différentes et
volontairement séparées :

- **Le PAT front-end.** Saisi une fois dans l'application, conservé en
  `localStorage` (clés `prdex.token` et `prdex.repo` uniquement — jamais l'état de jeu).
  Portée : le repo de données uniquement, permission `Contents: Read and write`, sans
  expiration.
- **Le PAT de l'Action, secret `CATCH_TOKEN`.** Portée : `Contents: Read` et
  `Pull requests: Read` sur les repos **surveillés** (ceux dont on veut capturer les PR
  mergées), plus `Contents: Write` sur le repo de données. Le `GITHUB_TOKEN` fourni
  automatiquement par GitHub Actions ne suffit pas : il ne donne accès qu'au repo dans
  lequel le workflow s'exécute, jamais aux repos surveillés.

**Non vérifié :** un PAT fine-grained ciblant un repo appartenant à une organisation
nécessite en général que l'organisation ait explicitement autorisé les PAT
fine-grained dans ses paramètres. À confirmer avant de pointer l'Action vers des repos
d'organisation — sans cette autorisation côté organisation, le token peut être créé
mais échouer silencieusement à accéder au repo.

## Installer `catch.yml` dans le repo de données

Dans le repo privé qui contiendra `data/` :

1. Copier depuis ce repo :
   - `.github/workflows/catch.yml`
   - `scripts/catch.mjs`
   - `shared/` (le module de tirage partagé entre le front et l'Action)
2. Dans **Settings → Secrets and variables → Actions** du repo de données, créer :
   - le secret `CATCH_TOKEN` : le PAT de l'Action décrit ci-dessus.
   - les variables (onglet *Variables*, pas *Secrets*) :
     - `WATCH_USER` : le compte GitHub dont on veut capturer les PR mergées.
     - `WATCH_REPOS` : la liste des repos surveillés, séparés par des virgules
       (ex. `moi/atlas,moi/pergola`).
     - `BOOTSTRAP_SINCE` : la date (`AAAA-MM-JJ`) à partir de laquelle chercher des PR
       lors du tout premier run.
3. Le workflow tourne toutes les 30 minutes (`workflow_dispatch` disponible pour un
   run manuel) et commite les nouvelles captures dans `data/catches.json`.

## Structure du dépôt

```
shared/species.js        table des 151 espèces + DEX/PARENT/POOL/familyOf/hasEvoInFamily
shared/draw.js            fnv1a + drawFromSha, partagé front ↔ Action
scripts/catch.mjs         collecte des nouvelles captures depuis l'API GitHub
src/lib/                  github.js (seul module réseau), sprites.js, credentials.js
src/composables/          useDex.js (dérivation pure), useCollection.js (effets)
src/components/           TheRail, TheTray, SpeciesSheet, RitualOverlay, EvolutionOverlay,
                           SettingsPanel, ConnectScreen
src/fixtures/demo.js      40 fausses PR, chargées dynamiquement derrière ?demo
docs/                     brief de design, spec technique, maquette
```

Voir aussi `NOTES.md` pour les partis pris de conception et d'implémentation.
