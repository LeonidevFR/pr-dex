# Classement et stats d'équipe

Date : 2026-09-30

Deux retours de l'équipe, reçus le même jour :

> « il nous faut un leaderboard pour savoir qui a le plus de pokemon (dont shiny) »

> « Il nous faut des stats aussi ! Nombre de plis ouverts, taux de drops des différentes
> catégories, nombre de pokemon évolués, ... »

Un seul chantier : les deux se calculent à partir des mêmes données, et s'affichent dans
le même panneau. C'est la première fonctionnalité qui montre à un joueur les données d'un
autre — le jeu était jusqu'ici strictement individuel.

Décision produit en toile de fond : l'arena sort le 1er décembre 2026. Ce panneau est une
fonctionnalité « en attendant », sociale, livrable en octobre.

---

## Ce qu'on livre

Un bouton 🏆 dans le rail ouvre un panneau par-dessus la planche, avec deux onglets :

- **Classement** — une ligne par joueur, classée par nombre d'espèces distinctes.
- **Stats** — les chiffres de l'équipe, les tiens à côté, et la valeur théorique quand
  elle existe.

Rien n'est conditionné à une permission : tout joueur connecté voit tout le monde. Le
classement sert à se comparer et à chambrer, pas à récompenser.

## Ce qui n'est pas exposé

Le titre, la référence et l'URL des PR ne sortent jamais de la base pour un autre joueur.
Les identifiants internes (`user_id`) non plus. Un joueur voit des autres : leur login
GitHub, leur avatar, et pour chaque capture **ouverte** son espèce, son chromatisme, sa
date et sa clé d'exemplaire. Cette clé (`source:external_id`) est nécessaire pour relier
une évolution à l'exemplaire qu'elle a consommé ; elle ne dit rien de la PR.

---

## Architecture : SQL pour lire, JavaScript pour calculer

Trois approches ont été comparées :

| | Approche | Verdict |
|---|---|---|
| A | Tout calculer en SQL | Refusée : il faudrait recopier en base les paliers et familles de `shared/species.js`, et réécrire l'héritage du chromatique à travers les chaînes d'évolution. Deux implémentations des mêmes règles, qui divergeraient. |
| **B** | **SQL renvoie les données brutes, le front calcule avec `useDex`** | **Retenue.** Une seule version des règles. Un classement ne peut pas contredire le compteur `/151` d'un joueur. |
| C | Chaque joueur publie ses totaux dans une table | Refusée : le joueur écrit lui-même ses chiffres, donc n'importe qui peut les falsifier via l'API. Et un joueur qui n'ouvre pas l'app garde des chiffres périmés. |

Le volume rend B trivial : quelques joueurs, quelques centaines de captures chacun.

### Base : une fonction `security definer`

Migration `supabase/migrations/2026-09-30-leaderboard.sql`, dans une transaction, même
procédure que `2026-07-24-sources.sql` : à coller dans le SQL Editor et exécuter une fois,
**avant** de merger le front. Elle ne crée qu'une fonction et son droit d'exécution. Elle
ne modifie aucune table, ne touche aucune donnée, n'a aucun rattrapage. Retour arrière :
`drop function public.leaderboard_players()`.

```sql
create function public.leaderboard_players()
returns table (
  login text,
  avatar_url text,
  is_me boolean,
  catches jsonb,     -- [{ source, external_id, species, shiny, date }] — ouvertes seulement
  evolutions jsonb   -- state.evolutions tel quel
)
language sql
security definer set search_path = public
stable
as $$ -- corps : jointure auth.users × state × catches, filtrée sur state.claimed $$;

revoke all on function public.leaderboard_players() from public;
grant execute on function public.leaderboard_players() to authenticated;
```

Règles de la fonction :

- `login` = `auth.users.raw_user_meta_data ->> 'user_name'`, `avatar_url` = `->> 'avatar_url'`.
  On lit `auth.users` plutôt que `identities` : le trigger d'inscription fait `on conflict
  do nothing`, donc un joueur dont le handle était déjà réclamé n'a pas de ligne
  `identities` ; et les métadonnées OAuth sont rafraîchies à chaque connexion, pas
  `identities`.
- `is_me` = `user_id = auth.uid()`. C'est le seul moyen pour le front de reconnaître sa
  ligne sans qu'un identifiant sorte.
- `catches` ne contient que les captures dont `source || ':' || external_id` est dans
  `state.claimed` (tableau JSON de clés). Une carte non retournée n'existe pas pour les
  autres : même règle que le dex, et pas de spoiler d'un légendaire avant que son
  propriétaire l'ait vu.
- Un joueur sans aucune capture ouverte n'est pas renvoyé. Un compte créé sans rien ouvrir
  n'occupe pas le bas du tableau.
- `stable` et lecture seule. Aucune écriture, aucune table nouvelle.

### Client de données : une méthode de plus

`createSupabaseClient` (`src/lib/supabaseData.js`) gagne `readLeaderboard()`, qui appelle
`supabase.rpc('leaderboard_players')` via le même `query()` que les autres méthodes, donc
avec les mêmes `SupabaseDataError` (`offline` / `server`).

`loadDemoClient` (`src/fixtures/demo.js`) implémente la même méthode. Voir « Mode démo ».

### Front : un module de calcul pur

`src/lib/leaderboard.js` exporte deux fonctions pures, sans Vue et sans effet de bord :

```js
playerStats(catches, evolutions, today) // → les 7 colonnes + les compteurs de palier d'un joueur
teamStats(players)                 // → l'onglet Stats à partir des lignes de la fonction SQL
```

`playerStats` construit un dex avec `useDex` sur des `ref` locales, avec
`state = { claimed: <toutes les clés>, spent: {}, evolutions }`. Comme la base ne renvoie
que les captures ouvertes, `claimed` est simplement l'ensemble des clés reçues. `spent`
est vide parce qu'aucune colonne n'en dépend.

---

## Onglet Classement

### Colonnes

| Colonne | Définition | Source dans `useDex` |
|---|---|---|
| **Espèces** (rang) | Espèces distinctes, évolutions comprises. Même chiffre que le compteur `/151` du joueur. | `caughtCount` |
| **Shiny** | Captures chromatiques ouvertes. Faire évoluer un shiny ne change pas ce total : sinon un seul shiny compterait deux fois une fois évolué. | `claimed.filter(shiny).length` |
| **Légendaires** | Espèces de palier `l` distinctes, sur 5. | `bySpecies` × `DEX[id].tier` |
| **Rares** | Espèces de palier `r` distinctes, évolutions comprises. Un Florizarre obtenu par évolution compte. | idem |
| **Lignées** | Familles dont **toutes** les formes sont dans `bySpecies`. Les familles à une seule espèce (Ronflex, Canarticho, les légendaires…) sont exclues : une capture suffirait à les « compléter ». Évoli compte quand ses trois évolutions sont là. | `familyLine` |
| **Exemplaires** | Captures ouvertes. Une évolution consomme une carte et en crée une, le total ne bouge pas. | `claimed.length` |
| **30 jours** | Captures ouvertes dont `date` (date de merge) est à moins de 30 jours de la date du jour. | `claimed.filter(...)` |

La date du jour est passée en paramètre à `playerStats`, jamais lue dans la fonction : les
tests sont déterministes.

### Ordre

Espèces décroissantes, puis shiny, puis légendaires, puis login par ordre alphabétique
(insensible à la casse). Le rang affiché est la position, sans ex æquo.

### Affichage

- Rang, avatar, login, puis les 7 colonnes. La ligne `is_me` est mise en évidence.
- Sur mobile (< 640 px) : rang, login, espèces, shiny. Le reste se déplie en touchant la
  ligne.

## Onglet Stats

| Stat | Équipe | Toi | Théorique |
|---|---|---|---|
| Plis ouverts | somme des exemplaires | tes exemplaires | — |
| Taux commun / peu commun / rare / légendaire | % et nombre | % et nombre | 45 / 42 / 12,5 / 0,5 % (`WEIGHTS`) |
| Taux shiny | « 1 sur N » et nombre | « 1 sur N » et nombre | 1 sur 128 (`SHINY_ODDS`) |
| Pokémon évolués | somme de `evolutions.length` | les tiens | — |
| Pokédex collectif | espèces vues par au moins un joueur, sur 151 | — | — |

Règles :

- Le palier d'un tirage est `DEX[species].tier` de la **capture**. Seules les captures
  comptent dans les taux, jamais les évolutions : faire évoluer un Salamèche (rare) en
  Reptincel (peu commun) ne doit pas déplacer les taux.
- Le nombre s'affiche à côté du pourcentage. Avec quelques dizaines de plis, « 0 %
  de légendaire » est un petit échantillon, pas de la malchance ; le nombre le dit.
- Taux shiny avec 0 shiny : afficher « 0 sur N », pas une division par zéro.
- Les valeurs théoriques viennent de `shared/draw.js`, jamais recopiées en dur.
- « Toi » vient de la ligne `is_me`. Si le joueur courant n'a aucune capture ouverte, il
  n'est pas dans les lignes : la colonne « Toi » affiche des tirets.

---

## Le panneau

### Composant

`src/components/LeaderboardPanel.vue`. Props : `client` (le client de données, pour
appeler `readLeaderboard`), `today`. Événement : `close`.

- Chargement à l'ouverture du panneau, jamais au démarrage de l'app. Un état `loading`,
  un état `error` avec un bouton « Réessayer », puis le contenu. Chaque ouverture
  recharge : pas de cache, les données sont petites.
- Deux onglets, **Classement** actif par défaut. L'onglet actif n'est pas mémorisé.
- Échap ferme le panneau, par le même `closeTopOverlay` que la fiche et les réglages
  (`App.vue`). Le panneau entre dans `overlayOpen`, donc il bloque la navigation clavier
  de la planche comme les autres overlays.

### Rail

`TheRail.vue` gagne un bouton 🏆 à côté de ⚙, `title="Classement"`, qui émet
`leaderboard`. `App.vue` porte `leaderboardOpen` comme il porte `settingsOpen`.

### Style

Le panneau ne reprend pas la mise en page des réglages. Direction : un vrai tableau des
scores, façon borne d'arcade ou tableau de tournoi — colonnes serrées, chiffres tabulaires,
rang en gros, la ligne du joueur en surbrillance. La direction visuelle précise est
proposée à l'implémentation, maquette à l'appui, avant d'écrire le CSS. Elle reste dans les
tokens de couleur des paliers (`--t-c` … `--t-l`) pour que les colonnes de palier se lisent
comme dans la planche.

---

## Mode démo

`?demo` doit montrer le panneau rempli, sans backend. `loadDemoClient` implémente
`readLeaderboard()` :

- **Quatre joueurs fictifs**, avec des logins et avatars inventés (l'avatar est une
  `data:` SVG ou un sprite, jamais une URL GitHub réelle). Leurs captures sont tirées avec
  `drawFrom` sur des seeds fixes (`demo:<login>:<n>`), en nombres différents (par exemple
  12, 27, 41, 58 captures) pour que le classement ait un ordre lisible. Comme pour les
  captures de démo existantes, on force un ou deux chromatiques et un légendaire là où le
  tirage naturel n'en donnerait pas, pour que toutes les colonnes soient non nulles au
  moins une fois. Un joueur porte une lignée complète et deux évolutions forcées.
- **Le joueur « démo »**, `is_me: true`, est construit **à la volée** à partir de l'état
  courant du client démo : ses captures ouvertes et ses évolutions du moment. Ouvrir un
  pli ou faire une évolution dans la démo, puis rouvrir le panneau, change sa ligne. C'est
  ce qui rend la démo utile pour juger le panneau.
- Les dates des joueurs fictifs sont étalées sur l'année, dont quelques-unes dans les
  30 derniers jours par rapport à la date du jour, pour que « 30 jours » ne soit pas nul.

---

## Erreurs

| Cas | Comportement |
|---|---|
| Réseau coupé (`offline`) | « Pas de connexion réseau. » + Réessayer |
| Fonction absente en prod (`server`, migration pas encore appliquée) | Message serveur + Réessayer. C'est le cas d'un front mergé avant la migration : le reste de l'app fonctionne, seul le panneau est en erreur. |
| Joueur sans `user_name` dans ses métadonnées | Impossible avec l'OAuth GitHub, seul fournisseur. La fonction renvoie `coalesce(user_name, 'inconnu')` par sécurité. |

---

## Tests

- `src/lib/leaderboard.test.js` — `playerStats` : un shiny évolué compte une fois ; une
  lignée à branches (Évoli + 3) ; une espèce sans évolution ne fait pas une lignée ; un
  rare obtenu par évolution compte dans Rares ; « 30 jours » avec une date pivot fixée.
  `teamStats` : taux avec échantillon nul, « 1 sur N » shiny, Pokédex collectif dédoublonné
  entre joueurs. Ordre du classement et départage.
- `src/components/LeaderboardPanel.test.js` — états chargement / erreur / réessayer ; onglet
  par défaut ; ligne `is_me` marquée ; tirets dans « Toi » quand le joueur n'a pas de ligne.
- `src/fixtures/demo.js` — un test vérifie que `readLeaderboard()` renvoie exactement une
  ligne `is_me` et qu'elle suit l'état courant après un `writeState`.
- La migration se teste à la main dans le SQL Editor, comme la précédente : appeler la
  fonction avec deux comptes, vérifier qu'aucun `label`/`url` ne sort et que les captures
  non ouvertes sont absentes.

## Procédure de mise en production

1. Exécuter `supabase/migrations/2026-09-30-leaderboard.sql` dans le SQL Editor de prod.
2. Merger la PR du front.

Si l'ordre est inversé, le panneau affiche une erreur serveur et le reste de l'app n'est
pas touché. Retour arrière de la migration : `drop function public.leaderboard_players()`.

## Hors périmètre

- Voir le dex complet d'un collègue. Les données de la fonction le permettent, c'est un
  chantier suivant.
- Annonces Slack, badges, équipe de 6 : listés comme candidats « en attendant l'arena »,
  pas dans ce chantier.
- Historique ou courbes d'évolution du classement. Rien n'est stocké, tout est recalculé.
