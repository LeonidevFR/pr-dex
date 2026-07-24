# PR-DEX

Un pokédex personnel qui se remplit tout seul depuis les actes qu'on pose au travail.
Chaque événement d'une **source** déclarée — aujourd'hui les pull requests mergées sur
GitHub — tire, de façon déterministe, un Pokémon à partir de son identifiant chez cette
source. L'ouverture se joue comme un booster, dans l'application.

Une source choisit **quel acte vaut un tirage** ; elle ne choisit pas ce que vaut un
tirage. Les paliers de rareté et les chances de chromatique sont les mêmes partout, sans
quoi ce ne serait plus un jeu commun mais plusieurs jeux qui partagent une planche.

Aucun serveur applicatif : le jeu s'appuie sur l'API GitHub et sur Supabase (Postgres +
Auth + une fonction Edge pour le bouton de sync), en base de données et fournisseur de
connexion — voir « Architecture » plus bas.

## Lancer en local

```bash
npm install
npm run dev
```

Il faut un fichier `.env.local` (jamais commité, `*.local` est dans `.gitignore`) avec :

```
VITE_SUPABASE_URL=https://<ton-projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon public>
```

Ces deux valeurs sont publiques par construction (Vite les inline dans le build) — ce
qui protège les données de chaque dev, c'est RLS côté base, pas le secret de ces valeurs.

Pour l'essayer sans backend et sans connexion, ouvrir l'URL avec `?demo` :

```
http://localhost:5173/?demo
```

Ce mode charge 42 fausses PR (`src/fixtures/demo.js`, chargé dynamiquement, jamais
inclus dans le build de production) : toute l'interface est cliquable sans compte ni
connexion réseau.

## Tests

```bash
npm test
```

## Architecture

Deux repos, volontairement :

- un repo **public** — celui-ci — servi par GitHub Pages, qui contient la coquille de
  l'application. Un repo public est gratuit sur Pages ; un repo privé demande une offre
  payante. Le build ne contient aucune donnée de jeu et n'a besoin d'aucun secret — la
  clé `anon` Supabase est publique par nature, RLS fait le reste.
- un repo **privé**, `pr-dex-data` — c'est aujourd'hui un repo d'*ingestion*, pas de
  données : il ne contient plus de JSON, seulement le workflow planifié et les deux
  secrets privilégiés (voir plus bas). Rester privé reste utile : ces secrets n'ont
  aucune raison d'être visibles.

Quatre tables Supabase (schéma complet dans `supabase/schema.sql`), RLS activé partout :

| Table | Écrite par | Contenu |
|---|---|---|
| `profiles` | auto-créée par un trigger à la première connexion OAuth | la personne, rien de spécifique à une source |
| `identities` | le trigger pour GitHub, à la main pour les autres sources | comment chaque source la reconnaît : `(source, handle, config)` |
| `catches` | uniquement l'Action `catch.yml`, via `service_role` | l'historique des captures, par `user_id` et par source |
| `state` | uniquement le navigateur du joueur concerné (RLS : `auth.uid() = user_id`) | ce qu'il a réclamé, dépensé, fait évoluer |

Chaque joueur ne lit/écrit que ses propres lignes (RLS), sans repo ni jeton à gérer : se
connecter une fois suffit, le profil se crée tout seul.

`identities` existe parce que **la façon dont on se connecte n'est pas la façon dont une
source nous reconnaît**. La connexion se fait aujourd'hui en OAuth GitHub, qui prouve du
même geste le handle de la source `github` — mais quelqu'un hors de l'équipe technique n'a
pas de compte GitHub, et une même personne peut relever de plusieurs sources. La contrainte
`unique (source, handle)` empêche de réclamer le handle de quelqu'un d'autre pour recevoir
ses captures.

Un exemplaire est identifié par sa **clé** `source:external_id` (`shared/entry.js`), et
c'est elle que `state.claimed` et `state.evolutions[].fromKey` référencent. Le préfixe n'est
pas décoratif : deux sources numérotent leurs événements indépendamment, l'identifiant « 42 »
existe partout.

`species` et `shiny` sont dérivés de cette clé au moment de la capture, mais **stockés**
dans `catches` plutôt que recalculés à la volée. Ainsi, un futur changement de l'algorithme
de tirage (`shared/draw.js`) ne réécrit jamais l'historique des captures déjà faites —
seules les nouvelles entrées suivent la nouvelle règle.

## Ajouter une source

Un connecteur (`scripts/connectors/`) déclare trois choses : sa clé `id`, la variable
d'environnement `secretEnv` qui porte son jeton de lecture, et une fonction `collect()` qui
rend les événements d'un handle depuis une date. Chaque événement porte :

| Champ | Rôle |
|---|---|
| `externalId` | identifiant stable chez la source — déduplication et seed du tirage |
| `label` | ce qui s'affiche en grand sur le pli et dans le journal |
| `ref` | référence courte, facultative (`moi/atlas#142 · a3f8c21`) |
| `url` | page de l'événement, facultative — rend la ligne du journal cliquable |
| `date` | jour de l'événement |

Le connecteur n'attribue aucune espèce : le tirage vit dans `catch.mjs`, seul endroit où il
vit, ce qui garantit que toutes les sources jouent au même jeu. Il reste à inscrire le
connecteur dans `CONNECTORS` et à ajouter son secret dans `pr-dex-data`.

Le critère auquel ce découpage se juge : **ajouter un pôle ne doit toucher ni le front, ni
le schéma, ni la logique de jeu.**

`state.version` remplace le SHA de blob git de l'ancienne version comme jeton de
concurrence optimiste (un appareil qui écrit sur une version périmée reçoit un conflit,
rejoué une fois sur l'état frais — même logique qu'avant, autre mécanisme de stockage).

## Le bouton de sync

`refresh()` (bouton ⟳ dans `TheRail`) fait deux choses : déclencher `catch.yml` tout de
suite plutôt que d'attendre le prochain passage du cron, puis relire Supabase. Le
déclenchement passe par une fonction Edge Supabase (`supabase/functions/trigger-catch`),
jamais par un appel direct du front à l'API GitHub — le front n'a que sa session
Supabase habituelle, aucun jeton GitHub capable d'écrire quoi que ce soit. Un
`workflow_dispatch` accepté ne dit pas que le run est fini : les nouvelles captures
n'apparaissent qu'après, à un refresh suivant.

## Les trois secrets privilégiés

- **`CATCH_TOKEN`** et **`SUPABASE_SERVICE_ROLE_KEY`** (secrets GitHub Actions), vivent
  uniquement dans le repo privé `pr-dex-data`, jamais dans le front :
  - **`CATCH_TOKEN`** : jeton de la source `github` — PAT fine-grained, lecture seule
    (`Pull requests: Read`) sur les repos à surveiller, ou *All repositories* sur
    l'organisation si aucune identité ne restreint `config.repos`. Aucun droit d'écriture
    nulle part. Chaque source ajoutée apporte son propre secret, déclaré par son connecteur
    (`secretEnv`) et posé dans `pr-dex-data`.
  - **`SUPABASE_SERVICE_ROLE_KEY`** : contourne RLS — c'est le seul moyen d'écrire dans
    `catches` pour n'importe quel `user_id`, puisque les utilisateurs n'ont eux-mêmes
    aucune permission d'écriture sur cette table.
- **`CATCH_DISPATCH_TOKEN`** (secret de la fonction Edge Supabase, réglage
  Project Settings → Edge Functions → Secrets — pas GitHub Actions). PAT fine-grained,
  scopé au seul repo `pr-dex-data`, permission `Actions: Read and write` — c'est ce qui
  permet d'appeler `workflow_dispatch` sur `catch.yml`. Rien d'autre : pas d'accès
  contenu, pas d'accès aux autres repos.

Aucun de ces trois secrets ne doit **jamais** transiter par un chat, un log, ou le front.

Le workflow tourne toutes les heures entre 8h et 19h heure de Paris (calé sur l'été
CEST, glisse d'1h en hiver CET faute de fuseau horaire dans la syntaxe cron de GitHub
Actions), boucle sur chaque identité enregistrée et insère ses nouvelles captures — plus,
depuis peu, sur `workflow_dispatch` (déclenché par le bouton de sync). Détails
d'installation dans `pr-dex-data/README.md`.

## Structure du dépôt

```
supabase/schema.sql               tables profiles/identities/catches/state, policies RLS, trigger d'auto-création
supabase/migrations/              bascules à appliquer sur une base déjà en service
supabase/functions/trigger-catch  fonction Edge : déclenche workflow_dispatch sur catch.yml
shared/species.js         table des 151 espèces + DEX/PARENT/POOL/familyOf/hasEvoInFamily
shared/draw.js            fnv1a + drawFrom, partagé front ↔ Action
shared/entry.js           entryKey(source, externalId) — clé d'exemplaire et seed du tirage
scripts/catch.mjs         Action : registre des sources, boucle sur les identités, tirage, insertion
scripts/connectors/       une source par fichier ; github.mjs est la seule pour l'instant
src/lib/                  supabaseClient.js, supabaseData.js (seul module réseau du jeu), sprites.js
src/composables/          useAuth.js (session OAuth), useDex.js (dérivation pure), useCollection.js (effets)
src/components/           TheRail, TheTray, SpeciesSheet, RitualOverlay, EvolutionOverlay,
                          SettingsPanel, ConnectScreen
src/fixtures/demo.js      42 fausses PR, chargées dynamiquement derrière ?demo
docs/                     brief de design, spec technique, maquette
```

Voir aussi `NOTES.md` pour les partis pris de conception et d'implémentation.
