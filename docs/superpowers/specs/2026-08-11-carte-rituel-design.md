# La carte et son rituel — design

**But :** donner un objet à posséder à la fin du tirage. Aujourd'hui le rituel révèle un sprite
qui flotte au milieu de l'écran ; on veut une **carte** — quelque chose qui se tient, qui accroche
la lumière quand on l'incline, qui se retourne sur sa provenance, et dont la matière dit la rareté.

**Maquette de référence :** https://claude.ai/code/artifact/16f06c0a-f8c1-4c31-9352-5240ca12d4a7
(copie locale `~/Downloads/pr-dex-cartes.html`). Elle fait autorité sur le rendu : les valeurs
numériques ci-dessous en sont extraites, pas réinventées.

**Périmètre :** deux surfaces seulement — le rituel d'ouverture (`RitualOverlay.vue`) et la fiche
d'espèce (`SpeciesSheet.vue`). La planche (`TheTray.vue`) n'est pas touchée : elle reste
l'inventaire calme, et 151 cases brillantes seraient du bruit.

---

## Décisions actées

### Une seule carte, deux éclairages — pas deux cartes

La tentation était de faire une carte spectaculaire au tirage (fond laqué noir, foil irisé façon
TCG Pocket) et une carte sobre dans le tiroir. C'est refusé : **la carte que l'on vient d'obtenir
doit être la carte que l'on retrouve**, sinon l'objet ne survit pas à son propre moment et la
possession — ce qu'on cherche précisément à créer — se dissout.

La matière est donc unique (carton, encres du carnet, dorure selon le palier). Ce qui change entre
les deux surfaces, c'est la **scène** :

- **Rituel** — fond noir, rayons, vignette, halo sur la carte, dorure poussée (`--lightboost`
  de 1,5 à 1,9 selon le palier), irisation du chromatique ×1,5.
- **Fiche** — la même carte à plat, en lumière du jour, sans halo ni multiplicateur.

### La rareté se lit dans la matière, pas dans un curseur

Quatre traitements réellement distincts, reconnaissables à la vignette sans lire l'étiquette.
Trois tentatives ont été écartées avant d'arriver là : un simple curseur d'intensité (indistinct),
un quadrillage pour le peu commun (papier d'écolier), et pour le rare successivement des hachures
au trait, un cartouche gravé, puis une bordure imprimée rouge sur tout le pourtour (jugée laide).

Ce qui est retenu — **le levier du rare est la teinte du carton, pas un motif** :

| Palier | Fond | Encadrement | Balayage de lumière |
|---|---|---|---|
| Commun | papier pâle, rien | filet gris, `opacity .4` | blanc, `opacity .3` |
| Peu commun | trame pointillée verte (points 0,9 px, pas 7 px, masquée au centre) | filet vert double | argent, `.42` |
| Rare | **carton teinté ocre** (`#f4e6c4 → #dfc890`), aucun motif | filet d'or + coins ornés + cachet de cire | or, `.5` |
| Légendaire | **carton ocre profond** (`#fbf0d2 → #e4d09b`) + guilloché plein | filet d'or épais (1,5 px) + coins doubles + cire | or, double bande, `.62` |

Le balayage de lumière comporte **un côté sombre avant le point brillant** : une bande claire seule
se lit comme un autocollant, pas comme du métal.

### La fanfare tombe au retournement, et elle est dosée par le palier

Un collègue demandait « explosions, lasers, être hyper stimulé ». C'est juste pour 2 % des tirages
et faux pour les 98 autres : si chaque commun explose, l'explosion du légendaire ne signifie plus
rien — on détruit le signal qu'on voulait amplifier. À ~300 tirages/an non skippables, ce qui est
jouissif au tirage 3 est une taxe au tirage 50.

**On ne monte pas le plancher, on monte le plafond :**

| Palier | flash | étincelles | ondes | secousse |
|---|---|---|---|---|
| Commun | — | — | — | — |
| Peu commun | ×1,6 | 7 | — | — |
| Rare | ×4,2 | 20 | 1 | 1,6 |
| Légendaire | ×6,5 | 34 | 3 | 3 |

Un commun ne déclenche **rien** : la carte se retourne, point. Ce silence est ce qui donne sa
valeur au reste.

Le dosage global retenu est **« Poussée » (×1,7)** sur cette courbe — validé sur maquette. Le
multiplicateur ne remet jamais la courbe à plat : un commun reste muet quel que soit le dosage.

La fanfare est déclenchée par le **retournement**, jamais par la déchirure : la récompense arrive
quand l'information arrive.

### Le retournement appartient au joueur

La carte sort dos visible et **attend**. Un indice sous la carte — « Cliquer pour retourner » — avec
une barre de décompte de 4 s. Le joueur retourne quand il veut ; s'il ne fait rien, la carte se
retourne seule au bout de 4 s. La barre rend l'automatique prévisible : on voit le temps venir,
donc on choisit de le devancer ou de le laisser filer.

C'est un gain d'agentivité par rapport à l'existant, où l'étape `silhouette` s'impose pendant
2,2 s (2,8 s en légendaire) sans que le joueur puisse rien y faire.

### Le dos porte la provenance

Le dos, c'est le sachet ouvert : trame tissée en diagonale, papier vergé. Dessus, une **étiquette
de spécimen** — dépôt, numéro de PR, titre (tronqué à 3 lignes via `-webkit-line-clamp`), date de
merge, et la mention « Une PR mergée · un tirage ».

Chaque carte dit ainsi d'où elle vient, ce qui donne une vraie raison de la retourner au lieu d'un
simple effet. Les veines de pliage d'une première version sont supprimées : ça faisait autocollant.

---

## La séquence d'ouverture

L'app **a déjà** un rituel complet (`RitualOverlay.vue`) : pile de plis, paquet cliquable,
`@keyframes tear`, rayons multicouches à vitesses décorrélées, flash, particules, silhouette en
dessin préparatoire, échappatoire « tout ouvrir sans cérémonie ». **On n'ajoute pas une deuxième
cérémonie par-dessus.** L'étape `silhouette` est *remplacée*, et une entaille est ajoutée en amont.

Nouvelle machine à états : `sealed → cutting → tearing → awaiting → revealed`

| t (ms) | Étape | Ce qui se passe |
|---|---|---|
| 0 | `cutting` | Clic sur « Briser le sceau ». Un point lumineux court sur la pliure du haut (`scaleX 0→1`, 420 ms) |
| 420 | | Le bandeau supérieur se soulève et part (340 ms). Le corps du pli est **découpé** : `clip-path` en dentelure irrégulière (26 dents, profondeurs 5–9 px, décalages en x) |
| 760 | `tearing` | `@keyframes tear` existante (420 ms) + montée des rayons |
| 1180 | `awaiting` | La carte entre dos visible (`cardIn`, 550 ms). L'indice et sa barre de 4 s apparaissent |
| clic, ou +4000 | `revealed` | Retournement (620 ms) **et** fanfare du palier |

Une dentelure parfaitement régulière se lit comme un cranté machine — d'où les profondeurs
inégales, en suite fixe (identique d'un tirage à l'autre, pas de `Math.random`).

**Budget temps.** L'entaille coûte 0,76 s ; elle est payée par la disparition du maintien de
silhouette (2,2 s / 2,8 s). La cérémonie complète ne dure pas plus longtemps qu'aujourd'hui, et le
joueur peut désormais l'écourter.

---

## Bug de production trouvé en chemin (à corriger dans le même lot)

`src/components/RitualOverlay.vue:20` — la table `INTENSITY` fait tourner les rayons à **3,2 s**
pour un rare et **1,8 s** pour un légendaire. C'est stroboscopique. Ce n'est pas une préférence de
maquette : c'est un défaut d'accessibilité déjà en production.

Corrigé à `c: 26s, u: 22s, r: 18s, l: 14s`. L'intensité reste portée par l'opacité, le nombre de
couches et le halo — jamais par la vitesse.

---

## Où ça atterrit

| Fichier | Nature du changement |
|---|---|
| `src/components/PokeCard.vue` | **nouveau** — la carte : deux faces, palier en `prop`, inclinaison au pointeur, retournement contrôlé par le parent |
| `src/components/RitualOverlay.vue` | machine à états étendue (`cutting`, `awaiting`), `silhouette` retirée, fanfare au retournement, `INTENSITY` corrigée |
| `src/components/SpeciesSheet.vue` | `.panel-art` remplacé par `<PokeCard>` en scène « jour » |
| `src/styles.css` | styles de la carte, de la découpe du pli et de la fanfare |

La carte est un composant autonome : elle reçoit une espèce, un palier, un statut chromatique, une
provenance et une scène ; elle n'accède ni au store ni au réseau. Elle doit être testable seule.

---

## Accessibilité et contraintes

- **`prefers-reduced-motion`** coupe les étincelles, les ondes et **la secousse d'écran** (c'est un
  vrai sujet vestibulaire, pas une coquetterie), réduit l'entaille et le retournement à l'instantané,
  et arrête la rotation des rayons.
- **Tactile** — il n'y a pas de survol sur mobile. L'inclinaison au pointeur est un bonus de
  desktop ; la carte doit rester complète et lisible sans elle. Pas de `devicemotion` (demande une
  permission utilisateur pour un effet décoratif : disproportionné).
- **Clavier** — le pli et la carte sont des `<button>`. Le focus suit l'action de l'étape courante,
  comme le fait déjà `RitualOverlay.vue` (`packetEl` puis `nextEl`) ; l'étape `awaiting` doit
  focaliser la carte, puisque c'est elle qui porte maintenant l'action.
- **Coût de rendu** — un `conic-gradient` animé de 940 px a fait planter le moteur de rendu pendant
  la maquette. Les rayons sont ramenés à 620 px et masqués en radial. À vérifier sur mobile réel.

---

## Tests

- **Composant carte** : rendu des quatre paliers (classes/attributs de palier présents), face avant
  vs dos, troncature du titre de PR, absence de fanfare en commun.
- **Machine à états du rituel** : enchaînement `sealed → cutting → tearing → awaiting → revealed` ;
  le clic pendant `awaiting` révèle immédiatement et **annule** le minuteur ; l'absence de clic
  révèle à 4 s ; une seule fanfare par tirage (le bug rencontré en maquette était précisément un
  double déclenchement — déchirure *et* retournement).
- **Non-régression** : les 346 tests existants passent inchangés.
- **Visuel** : hors tests automatisés, validé sur la maquette publiée.

---

## Hors périmètre

- La planche (`TheTray.vue`) et ses 151 cases.
- Un réglage utilisateur d'intensité dans `SettingsPanel.vue` — envisagé si le dosage « Poussée »
  divise l'équipe à l'usage, pas avant.
- L'arène (`feature/poke-arena-battle`) : ce lot en est indépendant et part de `main`.

## Questions restées ouvertes

1. Le dos porte-t-il les quatre informations (dépôt, numéro, titre, date) ou moins ? Retenu :
   les quatre, à réévaluer sur écran étroit où le titre tronqué peut mal tomber.
2. La fiche d'espèce garde-t-elle l'inclinaison au pointeur, ou la réserve-t-on au rituel ?
   Retenu : elle la garde — on revient admirer sa carte, c'est le but.
