# PR-DEX — spec technique

Document destiné à l'implémentation. Le pendant visuel est dans `brief-design-pr-dex.md` :
il possède le ressenti, les écrans et les règles de jeu. Ce document-ci possède l'algorithme,
le contrat de données et le pipeline. En cas de contradiction sur une règle de jeu, le brief
design fait foi.

Le prototype `pr-dex.html` contient déjà la table des 151 espèces, `fnv1a()`, `drawFromSha()`
et la logique bonbons, testés. **Ne pas les réécrire : les extraire.**

---

## 1. Architecture

```
   repos surveillés (moi/atlas, moi/pergola, …)
              │  PR mergée
              ▼
   ┌──────────────────────────┐
   │  repo moi/pr-dex (privé) │
   │                          │
   │  .github/workflows/      │   cron */30
   │    catch.yml ────────────┼──► interroge l'API GitHub
   │                          │    append → catches.json
   │  data/catches.json       │  ◄── écrit par l'Action UNIQUEMENT
   │  data/state.json         │  ◄── écrit par le front UNIQUEMENT
   │  src/ (l'app Vue)        │
   └──────────────────────────┘
              ▲
              │  REST API contents, PAT fine-grained
   ┌──────────┴───────────┐
   │  le front (statique) │
   └──────────────────────┘
```

Pas de backend. Le repo est la base de données. **Un seul écrivain par fichier** — c'est
l'invariant qui tient tout le reste debout.

**Hébergement.** Le build ne contient aucune donnée : tout arrive de l'API au runtime. Le site
peut donc être public sans rien exposer. Deux options équivalentes, à trancher hors spec :
Pages depuis le repo privé (demande un plan Pro), ou coquille dans un repo public + données
dans le repo privé (gratuit). L'implémentation est identique dans les deux cas. **Ne jamais
builder de données dans le bundle.**

## 2. Contrat de données

### `data/catches.json` — écrit par l'Action, en append, jamais modifié

```json
[
  {
    "sha": "a3f8c21e9b...",
    "repo": "moi/atlas",
    "pr": 142,
    "title": "fix: race condition à l'upload de fichiers",
    "date": "2026-02-03",
    "species": 25,
    "shiny": false
  }
]
```

- `sha` = `merge_commit_sha` de la PR. Clé primaire, unicité garantie.
- `date` = `merged_at` tronqué au jour.
- `species` et `shiny` sont **dérivés du sha mais stockés**. C'est le point le plus important
  du document : si l'algo de tirage change un jour, la collection existante ne doit pas se
  réécrire. Une PR déjà capturée reste liée au même Pokémon pour toujours. L'Action ne
  recalcule jamais une entrée existante.
- Trié par `date` croissante. Append-only.

### `data/state.json` — écrit par le front uniquement

```json
{
  "claimed": ["a3f8c21e9b...", "b71d0e4f2c..."],
  "spent": { "1": 8, "129": 40 },
  "evolutions": [
    { "species": 130, "from": 129, "date": "2026-07-14" }
  ]
}
```

- `claimed` : les sha dont le rituel a été joué. Un sha de `catches.json` absent d'ici est
  une capture en attente d'ouverture.
- `spent` : bonbons dépensés, clé = id de l'espèce de base de la famille.
- `evolutions` : les évolutions déclenchées. Le shiny d'une évolution est hérité de la source.

Tout l'état du dex est dérivable de ces deux fichiers. Rien d'autre ne persiste.

## 3. Le tirage

À extraire tel quel du prototype. Il est partagé entre l'Action (Node) et le front — même code,
même résultat, sinon le contrat se brise. En faire un module unique importé des deux côtés.

```js
function fnv1a(str){
  let h = 0x811c9dc5;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const WEIGHTS = [["c",0.45],["u",0.42],["r",0.125],["l",0.005]];

function drawFromSha(sha){
  const r = fnv1a(sha + ":tier") / 2**32;
  let acc = 0, tier = "l";
  for (const [t, w] of WEIGHTS) { acc += w; if (r < acc) { tier = t; break; } }
  const pool = POOL[tier];
  const species = pool[fnv1a(sha + ":pick") % pool.length];
  const shiny = fnv1a(sha + ":shiny") % 128 === 0;
  return { species, shiny };
}
```

**Seul le sha entre.** Aucune métadonnée de PR — ni taille, ni type, ni heure, ni repo. C'est
une règle produit, pas une simplification technique : le système ne doit récompenser ni le
volume ni le travail nocturne. Bénéfice secondaire : la fonction se teste sans mocker GitHub.

Tests attendus : déterminisme (même sha → même résultat), distribution sur 100k tirages
conforme aux poids à ±1 %, et un golden test figeant ~20 sha connus → espèces attendues, qui
casse si quelqu'un touche à l'algo par inadvertance.

## 4. Le workflow `catch.yml`

**Un seul workflow, dans le repo pokédex.** Pas une Action par repo surveillé : un seul endroit
à installer, aucun token à distribuer, ajouter un repo surveillé = une ligne de config, et le
backfill rétroactif vient gratuitement.

Déclencheurs : `schedule` (cron `*/30 * * * *`) + `workflow_dispatch` pour forcer à la main.

Note : GitHub désactive les workflows planifiés après 60 jours d'inactivité du repo. Comme
celui-ci commite dans son propre repo à chaque capture, il s'auto-entretient. En cas de longue
pause sans PR, il peut s'endormir — `workflow_dispatch` le réveille.

### Étapes

1. **Lire** `data/catches.json`. Construire le `Set` des sha connus.
2. **Chercher** les PR mergées :
   `GET /search/issues?q=is:pr+is:merged+author:{USER}+merged:>={depuis}`
   où `{depuis}` = date de la capture la plus récente moins 7 jours (marge), ou une date de
   départ configurée au premier run. Paginer.
3. **Pour chaque PR inconnue seulement**, `GET /repos/{owner}/{repo}/pulls/{n}` pour récupérer
   `merge_commit_sha` (l'API search ne le renvoie pas). Ne jamais refetch une PR déjà connue.
4. **Filtrer** sur la liste de repos surveillés (config en dur dans le workflow ou
   `data/config.json`).
5. **Dédupliquer** sur `sha` contre le `Set` de l'étape 1. C'est la seule protection
   d'idempotence : pas de curseur, pas de timestamp de dernier run à maintenir. Le workflow
   peut être rejoué autant de fois qu'on veut sans rien casser.
6. **Tirer** `drawFromSha(merge_commit_sha)` pour les nouvelles uniquement.
7. **Append**, trier par date, commiter. Si rien de nouveau : sortir sans commit.

### Token

`GITHUB_TOKEN` ne suffit pas : il n'a accès qu'au repo pokédex. Il faut un PAT fine-grained
scopé sur **les repos surveillés** (`contents: read`, `pull requests: read`) + le repo pokédex
(`contents: write`), stocké en secret `CATCH_TOKEN`.

C'est un token de plus que celui du front, et c'est normal : périmètres différents. Le front
n'a besoin que du repo pokédex.

### Bootstrap

Au premier run, `{depuis}` = une date de départ choisie (par ex. le 1er janvier de l'année).
L'Action rattrape tout l'historique en une passe : le dex est déjà bien rempli au premier
lancement du front plutôt que vide. `search/issues` est limité à 1000 résultats par requête —
si l'historique est plus long, découper par tranches de dates.

## 5. La couche API côté front

Un module qui expose `readCatches()`, `readState()`, `writeState(state)`. Rien d'autre ne
touche à l'API.

- **Lecture** : `GET /repos/{owner}/{repo}/contents/data/catches.json`, décoder le base64.
  Conserver le blob `sha` renvoyé pour `state.json` — il est requis à l'écriture.
- **Écriture** : `PUT /repos/{owner}/{repo}/contents/data/state.json` avec `content` (base64),
  `message`, et `sha` (le blob sha de la version lue). La concurrence optimiste est donc
  offerte par l'API.
- **Conflit (409)** : ne peut arriver qu'entre deux de mes propres appareils (j'ouvre un booster
  sur le téléphone, le laptop a une version périmée). Traitement : refetch, rejouer l'opération
  sur l'état frais, réécrire. **Retry silencieux, jamais un message d'erreur.** Une seule
  tentative supplémentaire suffit ; au deuxième échec, recharger.
- **Fréquence** : une écriture par claim et par évolution. ~300 commits/an sur `state.json`,
  c'est négligeable et ça donne un historique git de la collection en prime.
- Rate limit authentifié : 5000 req/h. Non-sujet.

### Token côté front

PAT fine-grained, repo pokédex uniquement, `contents: read/write`, **sans expiration** (GitHub
a levé la limite des 366 jours pour les projets personnels — repo sous un compte user, pas une
orga). Saisi une fois, gardé en local. GitHub supprime automatiquement un token inutilisé
pendant 12 mois : sans objet ici, l'app sert toutes les semaines.

Un seul utilisateur, son propre repo privé : les objections habituelles sur un token côté
client ne s'appliquent pas. Ne pas construire de flow OAuth.

## 6. Modes de défaillance

| Cas | Comportement attendu |
|---|---|
| Pas de token | Écran « pas encore connecté » (cf. brief design, état 5) |
| Token invalide / révoqué (401) | Même écran, message qui dit lequel des deux |
| Repo introuvable (404) | Message distinct : c'est une faute de frappe dans le réglage, pas un problème d'auth |
| 409 à l'écriture | Retry silencieux, invisible |
| `catches.json` absent | Premier lancement légitime : traiter comme `[]`, pas comme une erreur |
| `state.json` absent | Idem : état vide, le créer à la première écriture |
| Sprite 404 | Placeholder discret, ne bloque pas la grille |
| Hors ligne | Lecture seule sur ce qui est en mémoire, écritures refusées avec un message clair |

## 7. Hors périmètre

Backend, comptes, OAuth, multi-utilisateur, partage, classements, échange, combats, gen 2+,
notifications, tests e2e. Pas de framework de state management : deux fichiers JSON et des
`computed` suffisent.
