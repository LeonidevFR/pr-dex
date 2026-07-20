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
- **Le PAT de l'Action, secret `CATCH_TOKEN`.** Portée : les repos **surveillés**
  uniquement (ou *All repositories* sur l'organisation si `WATCH_REPOS` est laissée
  vide — voir plus bas), permission `Pull requests: Read`. Rien d'autre — et surtout
  **aucun droit d'écriture nulle part**.

  Il sert exclusivement à deux requêtes de lecture (`search/issues` pour trouver les PR
  mergées, `repos/{repo}/pulls/{n}` pour récupérer le `merge_commit_sha`). Le script
  n'écrit jamais via l'API : il écrit sur le disque du runner, et c'est le `git push` du
  workflow qui persiste le résultat.

  Ce push utilise le **`GITHUB_TOKEN`** installé automatiquement par `actions/checkout`,
  adossé au `permissions: contents: write` déclaré dans `catch.yml`. Rien à créer, rien à
  configurer.

  Conséquence pratique : chaque jeton ne vise qu'un seul propriétaire de ressources, ce
  qui reste compatible avec la contrainte des PAT fine-grained même quand les repos
  surveillés appartiennent à une organisation distincte de celle du repo de données.

### Cas d'un repo d'organisation surveillé

Le montage courant est : le repo de données et l'Action vivent sur un compte ou une
organisation personnelle, tandis que les repos **surveillés** appartiennent à
l'organisation de l'employeur. Trois points à connaître.

**Les organisations autorisent les PAT fine-grained par défaut** (« By default, both
Personal access tokens (classic) and fine-grained personal access tokens are enabled »).
Une organisation peut avoir restreint cela ; c'est alors un réglage à faire lever par un
propriétaire, pas un obstacle à prévoir systématiquement.

**L'expiration « aucune » n'est pas tenable pour `CATCH_TOKEN`.** Les organisations
imposent une durée de vie maximale aux PAT fine-grained, et la valeur par défaut est de
**366 jours**. Un jeton visant des repos d'organisation expirera donc au plus tard dans
l'année et devra être refait — l'Action s'arrêtera de capturer en silence ce jour-là.
Seul le PAT du front, qui ne vise que le repo de données personnel, peut réellement être
créé sans expiration. Prévoir un rappel.

**Non vérifié :** un PAT fine-grained semble rattaché à un seul *resource owner*, choisi
à la création. Si c'est le cas, un jeton unique ne peut pas à la fois lire les repos de
l'organisation et écrire dans le repo de données personnel : il en faut **deux**, et
`catch.yml` doit alors recevoir un secret par portée. Vérification directe : ouvrir la
page de création d'un fine-grained token et regarder si le champ « Resource owner » est
un choix unique ou multiple.

## Installer `catch.yml` dans le repo de données

Dans le repo privé qui contiendra `data/` :

1. Copier depuis ce repo :
   - `data-repo-template/catch.yml` → à placer en `.github/workflows/catch.yml`
   - `scripts/catch.mjs`
   - `shared/` (le module de tirage partagé entre le front et l'Action)
2. Dans **Settings → Secrets and variables → Actions** du repo de données, créer :
   - le secret `CATCH_TOKEN` : le PAT de l'Action décrit ci-dessus.
   - les variables (onglet *Variables*, pas *Secrets*) :
     - `WATCH_USER` : le compte GitHub dont on veut capturer les PR mergées. **Requis**
       — le run échoue immédiatement avec un message explicite si elle est absente.
     - `WATCH_REPOS` : la liste des repos surveillés, séparés par des virgules
       (ex. `moi/atlas,moi/pergola`). **Optionnelle** — absente ou vide, aucun filtre
       n'est appliqué côté script : tous les repos accessibles au `CATCH_TOKEN` sont
       surveillés. Dans ce cas, `CATCH_TOKEN` doit être créé avec *Repository access →
       All repositories* sur l'organisation surveillée : c'est alors le périmètre du
       jeton, et lui seul, qui borne ce qui est capturé.
     - `BOOTSTRAP_SINCE` : la date (`AAAA-MM-JJ`) à partir de laquelle chercher des PR
       lors du tout premier run. **Optionnelle** — si elle n'est pas définie,
       `2026-01-01` est utilisé par défaut.

   `CATCH_TOKEN` (le secret) est également requis : même échec explicite si absent.
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
