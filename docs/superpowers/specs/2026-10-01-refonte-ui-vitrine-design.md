# Refonte de l'UI — direction Vitrine

Date : 2026-10-01

## Pourquoi

« C'était bien en V1, mais là on a passé le cap, il est temps d'offrir une meilleure UI. »
Le parchemin a porté le prototype. Avec le classement, les stats et l'arena du 1er décembre,
l'app est devenue un produit d'équipe. Son décor doit suivre.

Trois directions ont été explorées sur un canevas Claude Design
(https://claude.ai/artifact/2SrziH4KZfYGBeHxJBvkVB) : Arcade, Vitrine, Studio. Léonard a
retenu la **Vitrine (B)**, en lui ajoutant la structure de **Studio (C)**. Une contrainte a
été posée : garder les textures de rareté d'aujourd'hui (rare, légendaire, shiny).

Livraison : **une seule PR**.

## Ce qui ne change pas

- **La carte.** `PokeCard.vue` et toutes ses matières restent identiques :
  - papier pâle pour le commun ;
  - trame pointillée et double filet vert pour le peu commun ;
  - carton ocre et coins dorés pour le rare ;
  - carton profond guilloché et double dorure pour le légendaire ;
  - irisation pour le shiny, quel que soit le palier ;
  - balayage de lumière, dos de carte, retournement.

  La carte est un objet, et le README le pose : « une carte qui changerait d'identité ne se
  posséderait pas ». Ses polices (IBM Plex Serif, IBM Plex Sans Condensed, IBM Plex Mono)
  et ses tokens parchemin restent, mais limités à la carte.
- **Le rituel** : le geste unique, les fanfares par palier, le silence du commun, le halo qui
  croît avec le palier (8 / 14 / 34 / 60 px).
- **Les données et la logique** : `useDex`, `useCollection`, `src/lib/leaderboard.js`,
  Supabase, le mode `?demo`.
- **Le clavier** : Espace ouvre le prochain pli depuis l'accueil, Échap ferme l'overlay du
  dessus.
- **`prefers-reduced-motion`** n'est toujours pas honoré (décision `ac68ba4`).

## Tokens

`src/styles.css` remplace son `:root` par la palette Vitrine. Les tokens parchemin
(`--paper`, `--plate`, `--rule`, `--ink`…) sont redéclarés **sur `.pkc` seulement**, pour que
la carte rende exactement comme aujourd'hui.

| Token | Valeur | Rôle |
|---|---|---|
| `--bg` | `#14110e` | fond velours |
| `--surface` | `#211c18` | cellules, modales |
| `--surface-hi` | `#2b2520` | cellule capturée, survol |
| `--line` | `rgba(239,230,207,.10)` | filets |
| `--line-gold` | `rgba(212,176,106,.16)` | filets d'en-tête et de section |
| `--fg` | `#efe7d8` | texte |
| `--fg-2` | `#a89a85` | texte secondaire |
| `--fg-3` | `#8a7d6b` | libellés, numéros |
| `--gold` | `#d4b06a` | seul accent |
| `--gold-btn` | `linear-gradient(180deg,#e2c37c,#c99e4e)` | bouton principal |
| `--cream` | `#efe6cf` | onglet et filtre actifs |
| `--t-c` / `--t-u` / `--t-r` / `--t-l` | `#8a8175` / `#7fb59a` / `#d7756a` / `#d4b06a` | paliers, lisibles sur fond sombre |
| `--iris` | `radial-gradient(circle, rgba(201,167,230,.7), rgba(63,191,149,.25) 45%, transparent 70%)` | halo shiny |

Polices, chargées dans `index.html` :
- Fraunces 300 et 600, avec italique, pour les titres ;
- Manrope 400 à 700 pour l'interface ;
- IBM Plex Mono pour les chiffres ;
- les trois IBM Plex de la carte restent.

Contraste : le texte courant sur `--bg` et `--surface` doit atteindre 4,5:1. `--fg-3` est
réservé aux libellés de 10 px et plus en capitales espacées. Il est vérifié à 4,5:1 sur
`--bg` à l'implémentation, et éclairci s'il n'y arrive pas.

## Navigation : trois vues

L'en-tête contient, de gauche à droite :
1. le logo « *PR*·DEX » en Fraunces, avec la devise ;
2. les onglets **Collection / Équipe / Mes stats** ;
3. le compteur `41 / 151` et sa jauge dorée ;
4. le bouton **Ouvrir**, avec le nombre de plis en attente ;
5. la sync et les réglages, en icônes au trait.

- `App.vue` porte `view` : `'collection' | 'team' | 'stats'`, avec `'collection'` par
  défaut. La vue n'est pas mémorisée entre deux chargements.
- Le bouton 🏆 disparaît.
- `LeaderboardPanel.vue` est remplacé par deux vues :
  - `TeamView.vue` : le classement, avec les mêmes colonnes, le même ordre, la ligne
    « · toi » et la ligne dépliable en étroit. En tête, trois chiffres d'équipe : Pokédex
    collectif, plis ouverts, shiny. Pour les afficher, `leaderboard.js` gagne une fonction
    `teamTotals(rows, today)`.
  - `StatsView.vue` : le contenu actuel de l'onglet Stats, c'est-à-dire `myStats`.
- Le chargement et l'erreur restent ceux du panneau actuel : chargement à l'entrée dans la
  vue, message et « Réessayer » en cas d'échec. Le changement est un simple remontage :
  quitter la vue et y revenir recharge, comme fermer et rouvrir le panneau aujourd'hui.
- La fiche, le rituel, l'évolution et les réglages restent des overlays, au-dessus de
  n'importe quelle vue.
- Échap ne change pas de vue : il ne ferme que les overlays.
- Espace n'ouvre le prochain pli que depuis la vue Collection, sans overlay ouvert. C'est
  la règle d'aujourd'hui, appliquée à la vue d'accueil.

## La collection

### Barre d'outils

Elle se place sous l'en-tête, sur une ligne qui passe à la ligne en étroit. Elle remplace le
panneau de filtres repliable et son bouton.

- **Recherche** : un champ « Chercher un Pokémon ». Il filtre sur le nom et sur le numéro,
  sans tenir compte de la casse ni des accents (« evoli » trouve Évoli, « 25 » trouve
  Pikachu). La recherche se combine aux autres filtres. Une recherche sans résultat affiche
  « Aucun Pokémon ne correspond » avec un lien « Effacer les filtres ».
- **Statut** : Tous / Capturés / Manquants, en pastilles exclusives.
- **Paliers** : quatre pastilles à cocher, chacune avec son point de couleur. On ne peut
  toujours pas décocher le dernier palier.
- **Évoluables · N** : une pastille verte, à droite. Elle est exclusive avec le statut, comme
  aujourd'hui où `statusFilter` vaut `'evolvable'`.

`useTrayFilters` gagne `query` (une `ref` de chaîne) et `matchesQuery(id)`. `reset()` vide
aussi `query`, et `active` en tient compte. `open` disparaît avec le panneau.

### Grille

- Desktop : 9 colonnes dans un conteneur de 1280 px maximum, avec un écart de 14 px.
- Entre 640 et 1024 px : 6 colonnes. Sous 640 px : 4 colonnes.

Une **case capturée** a un fond `--surface-hi` et des coins arrondis de 8 px. Elle porte :
- le numéro, en haut à gauche ;
- une pastille de palier nommée en haut à droite, sauf pour le commun : « Peu c. »,
  « Rare », « Légende » ;
- les doublons (×N), en bas à gauche ;
- en bas à droite, ✦ si elle est shiny, sinon ↑ si elle peut évoluer vers une forme
  manquante. Le shiny passe avant : sur les deux à la fois, ↑ ne se voit pas, mais le
  filtre Évoluables trouve toujours la case.

Les signes de rareté dans la grille :
- **légendaire** : halo or et cadre doré ;
- **shiny** : halo irisé (`--iris`). Il remplace le halo du légendaire si la case est les
  deux ;
- **rare** : cadre brique, sans halo.

Changement assumé : le halo du légendaire passe du rouge tampon à l'or. Aujourd'hui il est
rouge parce que l'ocre était déjà pris par le shiny. Le shiny devient irisé, donc l'or est
libre.

Une **case manquante** a un fond `--surface` et montre la silhouette du sprite, en niveaux de
gris très sombres (luminosité 0,3, opacité 0,45). Elle n'est pas cliquable, comme
aujourd'hui.

## La fiche d'espèce

C'est une modale velours de 1040 px au plus, découpée en deux colonnes.
- **À gauche**, la carte, avec `scene="night"` au lieu de `day`, puisque le fond est
  sombre. Un clic la zoome toujours.
- **À droite** :
  - le surtitre (catégorie et nombre d'exemplaires) ;
  - le nom en Fraunces 46 px ;
  - le texte de Pokédex en Fraunces léger ;
  - trois chiffres séparés par des filets : type, bonbons, première capture ;
  - la lignée, avec les formes connues éclairées et les autres éteintes ;
  - le sélecteur d'exemplaire et le journal des captures ;
  - le bouton or « Faire évoluer · N bonbons ».

Sous 900 px, les deux colonnes s'empilent et la modale défile.

Tout ce que la fiche affiche aujourd'hui reste, et seule la mise en page change.

## Le rituel

- La mécanique, la carte et les rayons ne changent pas.
- Ce qui change : le surtitre « Pli 1 sur 4 · retourne la carte » passe en capitales
  dorées, les chips (Nouveau, palier, bonbons) passent en contour sur fond sombre, le bouton
  « Pli suivant » prend `--gold-btn`, et « Tout ouvrir sans cérémonie » devient un lien
  discret.

## Évolution, connexion, réglages

- **L'évolution** reprend les chips et le bouton du rituel.
- **La connexion** : le logo Fraunces en grand, la devise, et un seul bouton or
  « Se connecter avec GitHub ». En fond, quatre cartes posées en éventail (commun, peu
  commun, rare, légendaire), qui servent aussi de démonstration des paliers. Leurs espèces
  sont fixes : Roucool, Goupix, Salamèche, Sulfura.
- **Les réglages** deviennent une petite modale velours. Leur contenu ne change pas.

## Mobile

Sous 640 px :
- l'en-tête garde le logo, le compteur et Ouvrir ;
- les onglets passent dans une barre fixe en bas d'écran (64 px, sûre pour l'encoche) ;
- la sync et les réglages vont dans l'en-tête, à droite ;
- la barre d'outils passe à la ligne ;
- la grille passe à 4 colonnes ;
- la fiche et les modales occupent toute la largeur, avec 16 px de marge.

Aucun défilement horizontal de page, à aucune largeur.

## Fichiers touchés

| Fichier | Changement |
|---|---|
| `index.html` | polices Fraunces et Manrope ajoutées |
| `src/styles.css` | `:root` Vitrine, tokens parchemin limités à `.pkc`, toutes les sections hors carte réécrites |
| `src/App.vue` | `view`, onglets, rendu des vues, `leaderboardOpen` retiré |
| `src/components/TheRail.vue` | devient l'en-tête : logo, onglets, compteur, Ouvrir, sync, réglages. Le filtre et le 🏆 sortent |
| `src/components/TheTray.vue` | la barre d'outils intégrée, la recherche, les nouvelles cases |
| `src/composables/useTrayFilters.js` | `query`, `matchesQuery`, `open` retiré |
| `src/components/TeamView.vue` | **créé** : classement et totaux d'équipe |
| `src/components/StatsView.vue` | **créé** : mes stats |
| `src/components/LeaderboardPanel.vue` | **supprimé** |
| `src/lib/leaderboard.js` | `teamTotals` ajouté |
| `src/components/SpeciesSheet.vue` | nouvelle mise en page, `scene="night"` |
| `src/components/RitualOverlay.vue`, `EvolutionOverlay.vue`, `ConnectScreen.vue`, `SettingsPanel.vue` | classes et balisage restylés, logique inchangée |
| `src/components/PokeCard.vue` | **inchangé** |
| `README.md` | les sections sur la carte gardent leur texte ; ajout d'un paragraphe « Le décor » qui explique la scène velours et le pourquoi |

## Tests

- **Réécrits** : les tests qui visent des éléments supprimés ou déplacés. Ce sont ceux de
  `TheRail` (le filtre, `.trophy`), du panneau de classement (qui deviennent ceux de
  `TeamView` et `StatsView`), et du bouton de filtre dans `TheTray` et `App`.
- **Nouveaux** :
  - `useTrayFilters` : la recherche par nom, par numéro, sans casse ni accents, combinée à
    un palier, et vidée par `reset()` ;
  - `TheTray` : le message « Aucun Pokémon ne correspond », la pastille de palier sur une
    case capturée non commune, et l'absence de pastille sur une case commune ;
  - `App` : un clic sur un onglet change de vue, Échap ne change pas de vue, Espace n'ouvre
    pas de pli depuis Équipe ;
  - `leaderboard.js` : `teamTotals`.
- **Inchangés** : les tests de `PokeCard`, et tout ce qui teste la logique.
- **Vérification visuelle** en `?demo`, dans un vrai navigateur, à 1280 px et à 390 px :
  - les trois vues ;
  - une fiche de chaque palier, et une fiche shiny ;
  - le rituel d'un pli commun et d'un pli légendaire ;
  - l'écran de connexion.

  Des captures d'écran sont jointes à la PR.

## Hors périmètre

- Une version claire, ou un sélecteur de thème.
- Toucher à la carte, à ses matières, aux fanfares ou au geste du rituel.
- Afficher le dex d'un collègue, les annonces Slack, l'équipe de 6.
- Les mineurs différés de la PR #19, sauf un : les onglets de l'en-tête sont une vraie
  navigation (`<nav>`, liens ou boutons avec `aria-current`), ce qui règle au passage les
  onglets sans ARIA relevés alors.
