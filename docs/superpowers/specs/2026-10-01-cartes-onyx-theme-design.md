# Cartes Onyx et thème clair / sombre

Date : 2026-10-01

Suite de `2026-10-01-refonte-ui-vitrine-design.md`, dans la même PR (#21).

## Pourquoi

En testant la refonte, Léonard a constaté que les cartes gardaient les reflets et le dos du
parchemin, alors que tout le décor était passé au velours. Trois directions ont été dessinées
sur le canevas (Onyx, Ivoire doré, Lumière). Il a retenu **Onyx**. Il a refusé la fenêtre
éclairée derrière le sprite (« affreux ») et demandé un **thème clair** pour l'app et les
cartes. Il a gardé l'idée du dos Onyx : un logo, le numéro, la date et la PR.

Décisions déjà prises :

- **Pas de traitement spécial** pour le contour noir des sprites sur la carte sombre.
  Ceux que ça gêne passent en thème clair.
- **Tout dans la PR #21.**

## Thème

- `<html data-theme="dark|light">`. Sans choix enregistré, le thème suit
  `prefers-color-scheme`, et suit aussi ses changements tant qu'aucun choix n'est
  enregistré.
- Un bouton soleil/lune dans l'en-tête, à côté des réglages, bascule le thème. Le choix est
  enregistré dans `localStorage` sous la clé `prdex.theme`, avec un `try/catch` : sans
  stockage, la bascule marche quand même pour la session.
- Le thème est posé avant le premier rendu (script en ligne dans `index.html`), pour éviter
  un flash de mauvais thème au chargement.
- **Le sombre** reste la palette Vitrine actuelle.
- **Le clair** redéfinit les tokens sous `:root[data-theme="light"]` :

| Token | Clair |
|---|---|
| `--bg` | `#f6f0e2` |
| `--surface` | `#efe7d4` |
| `--surface-hi` | `#fbf6ea` |
| `--line` | `rgba(44,38,32,.10)` |
| `--line-gold` | `rgba(154,122,53,.28)` |
| `--fg` | `#2c2620` |
| `--fg-2` | `#5a5044` |
| `--fg-3` | `#6f6350` |
| `--gold` | `#7a5c22` |
| `--cream` | `#2c2620` (l'onglet actif s'inverse : encre pleine, texte crème) |
| `--t-c` / `--t-u` / `--t-r` / `--t-l` | `#665d53` / `#4a6a42` / `#9e3b2e` / `#7a581a` |

  Les couleurs écrites en dur dans le CSS du décor (`#f4ecda` pour les titres, les fonds
  des scrims, etc.) passent par des tokens pour que le clair les reprenne : `--fg-title`,
  `--scrim`, `--panel-bg`, `--header-bg`. Tout texte du thème clair atteint 4,5:1 sur la
  surface où il est posé.
- **Le rituel et l'évolution restent des scènes de nuit** dans les deux thèmes : fond noir,
  rayons, projecteur. Ce sont des scènes, pas des pages.

## Cartes Onyx

La carte suit le thème partout (fiche, rituel, connexion). Une carte reste le même objet d'un
écran à l'autre ; c'est la règle du README.

Les matières sont portées par des tokens de carte posés sur `.pkc` et redéfinis en clair :

| Palier | Sombre | Clair |
|---|---|---|
| commun | carton noir mat, filet étain, aucun métal | ivoire, filet étain |
| peu commun | trame pointillée verte, double filet vert | trame pointillée verte, double filet vert |
| rare | carton cuivré, coins cuivre, reflet chaud | carton ocre, coins cuivre |
| légendaire | or guilloché, double dorure, reflet appuyé | guilloché, double dorure |
| shiny | irisation en fusion `screen` | irisation en fusion `multiply` |

- Le texte de la carte (numéro, nom, palier) suit le carton : crème sur noir, encre sur
  ivoire.
- Le balayage de lumière au pointeur, le retournement et le halo par palier (8 / 14 / 34 /
  60 px) ne changent pas.
- **Le cachet de cire « PR » disparaît** (rare et légendaire). Il appartenait au parchemin.

## Dos Onyx

- En haut : `Nº 004` à gauche, la date à droite.
- Au centre : « *PR*·DEX » en Fraunces doré, sur une rosace gravée.
- En bas : l'étiquette de provenance, avec le dépôt, le numéro de PR, le commit et le titre
  sur trois lignes au plus.
- Sombre : velours noir, rosace et lettres or. Clair : ivoire, rosace et lettres or assombri.
- Le mot « ouvert » et la ligne « Une PR mergée · un tirage » disparaissent : le logo
  suffit.
- **Le numéro ne doit rien dévoiler.** Dans le rituel, tant que la carte n'est pas
  retournée, le dos affiche `Nº ···`. `PokeCard` gagne une prop `secret: Boolean` (défaut
  `false`) ; le rituel la passe à `true` pendant l'attente.

## Hors périmètre

- Un nouveau logo. Léonard en testera d'autres ; celui du dos est le mot « *PR*·DEX » en
  Fraunces, remplaçable plus tard.
- Toute lueur, fenêtre ou liseré derrière le sprite.

## Tests

- `styles.test.js` : le test « la carte garde ses tokens parchemin » est remplacé. Le nouveau
  vérifie que `.pkc` déclare les tokens de carte Onyx et que
  `:root[data-theme="light"] .pkc` les redéfinit. Le thème clair redéfinit `--bg`, `--fg` et
  `--gold`.
- `useTheme` (nouveau composable) :
  - sans choix enregistré, il suit le système ;
  - `toggle()` bascule et enregistre ;
  - un choix enregistré l'emporte sur le système ;
  - sans `localStorage`, il marche quand même.
- `TheRail` : le bouton de thème existe, porte un `aria-label` qui dit le thème cible, et
  émet `toggle-theme`.
- `PokeCard` :
  - plus de cachet de cire, à aucun palier ;
  - le dos affiche le numéro et la date ;
  - avec `secret`, le dos affiche `Nº ···` ;
  - le dos ne contient plus « ouvert ».
- `RitualOverlay` : pendant l'attente, le dos ne dévoile pas le numéro de l'espèce.
- Vérification en navigateur des deux thèmes, à 1280 et 390 px : planche, fiche de chaque
  palier et d'un shiny, dos de carte, rituel, connexion.
