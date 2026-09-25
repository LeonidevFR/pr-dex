# Rayons rotatifs enrichis + rayons laser multicolores (rare/légendaire)

## Contexte

Retour utilisateur : le palier commun n'affiche aujourd'hui qu'un seul disque de rayons tournant (`.rays`), ce qui paraît pauvre visuellement. Demande :

1. Des rayons "laser" multicolores quand on ouvre une carte rare ou légendaire.
2. Plus de disques de rayons tournants pour **tous** les paliers d'ouverture (le commun doit passer de 1 à plusieurs rayons).

Travail à faire dans un nouveau worktree (isolation de la branche de feature).

## État actuel (rappel)

- `src/components/RitualOverlay.vue` rend toujours un `.rays` (conic-gradient tournant, couleur `var(--tier)`), et un second `.rays-alt` (contre-rotation, pitch plus fin) uniquement pour `r`/`l`.
- Couleurs par palier définies dans `src/styles.css` (`--t-c`, `--t-u`, `--t-r`, `--t-l`) et mappées côté JS par `TIER_VAR` dans `shared/species.js`. Ces couleurs restent **inchangées** — le "vert" mentionné dans le retour correspond en fait au palier "peu commun" (`--t-u`), pas au commun (`--t-c`, gris-pierre). Confirmé avec l'utilisateur : on garde la palette actuelle par palier, on ne change que le nombre de rayons.
- Intensité par palier (`--rayop`, `--glow`, `--flashscale`, `--rayspeed`) définie dans `INTENSITY` (`RitualOverlay.vue`), inchangée par cette feature.

## Décisions de design

### 1. Passage à un rendu de rayons piloté par données

Remplacer les deux éléments statiques (`.rays` / `.rays-alt` conditionnel) par une liste calculée `rayLayers` (computed, basée sur `tier`), rendue via `v-for` avec un unique CSS class générique `.ray-layer`. Chaque entrée de la liste porte :

- `color` — couleur CSS du rayon (voir §2/§3)
- `direction` — sens de rotation (`normal` / `reverse`), alterné par index (pair → `raysSpin`, impair → `raysSpinRev`, keyframes existants réutilisés)
- `speedMultiplier` — facteur appliqué à `--rayspeed` pour désynchroniser les couches (ex. `1, 0.8, 1.3, 0.65, ...`)
- `wedgeDeg` — pas angulaire du wedge conic-gradient (varie légèrement par couche pour la texture, entre le pitch actuel de `.rays` à 20° et celui de `.rays-alt` à 9°)

Le style par couche est appliqué en style inline / CSS custom properties sur chaque `.ray-layer`, la règle CSS de base (`background: conic-gradient(...)`, masque radial, `position/size`) restant partagée et définie une seule fois dans `src/styles.css`.

### 2. Nombre de rayons par palier

| Palier | Code | Nb de couches |
|---|---|---|
| Commun | `c` | 3 |
| Peu commun | `u` | 4 |
| Rare | `r` | 5 |
| Légendaire | `l` | 6 |

### 3. Couleurs

- **Commun / peu commun** : toutes les couches utilisent la couleur de palier existante (`var(--t-c)` / `var(--t-u)`), comme aujourd'hui — seul le nombre de couches augmente.
- **Rare / légendaire** : les couches cyclent sur une palette multicolore fixe et partagée entre `r` et `l` (nouvelle constante, ex. dans `src/styles.css` ou `shared/species.js`) :
  - `#e63946` (rouge)
  - `#457b9d` (bleu)
  - `#f4d35e` (jaune)
  - `#5c7a52` (vert, réutilise `--herb`)
  - `#9b5de5` (violet)

  Avec 5 rayons pour `r` et 6 pour `l`, la 6e couche de `l` reboucle sur la 1ère couleur de la palette (rouge).

### 4. Rotation

Chaque couche alterne le sens de rotation par index (pair/impair) et applique un `speedMultiplier` différent par index pour éviter l'effet "un seul disque plus épais" — cf. §1. Les intensités globales (`--rayop`, `--glow`, `--flashscale`, `--rayspeed` de base) restent pilotées par `INTENSITY` comme aujourd'hui ; le multiplicateur de vitesse par couche s'applique par-dessus `--rayspeed`.

### 5. Hors périmètre

- Pas de changement à `INTENSITY` (opacité/glow/flash de base par palier).
- Pas de changement au comportement `prefers-reduced-motion` existant (raccourcissement du `hold` à 150ms) — les couches multiples restent soumises à la même logique déjà en place, non modifiée par cette feature.
- Pas de changement à la palette de couleurs par palier (`--t-c/u/r/l`).

## Tests

`src/components/RitualOverlay.test.js` encode aujourd'hui : présence de `.rays` toujours, `.rays-alt` seulement pour `r`/`l`, valeurs `--glow` par palier. À mettre à jour pour refléter la nouvelle structure :

- Nombre de `.ray-layer` rendus par palier (3/4/5/6).
- Pour `r`/`l` : couleurs des couches correspondent à la palette multicolore attendue (cycle sur 5 couleurs).
- Pour `c`/`u` : toutes les couches utilisent la couleur de palier unique.
- Les valeurs `--glow`/`--rayop`/`--flashscale`/`--rayspeed` de base par palier (déjà testées) restent inchangées.

## Travail en worktree

Cette feature est développée dans un nouveau git worktree isolé (branche dédiée), conformément à la demande explicite de l'utilisateur.
