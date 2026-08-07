# Retours utilisateurs — stats d'évolution, navigation clavier, fiche enrichie

Date : 2026-08-07

Trois chantiers indépendants, issus de retours des utilisateurs de l'équipe. Ils ne
partagent aucun état et peuvent être implémentés et livrés séparément.

| # | Retour | Chantier |
|---|---|---|
| A | « Quand on fait une évolution, on n'a pas les stats » | Bloc d'informations sur l'écran d'évolution |
| B | « J'aimerais pouvoir tout faire avec la touche espace » | Discipline de focus + raccourci depuis la home |
| C | « Ajouter les infos du Pokémon dans sa fiche » | Types, lignée, texte de Pokédex |

Un quatrième retour — le clic sur le sprite de la fiche devait afficher le Pokémon
comme à sa découverte — a été **abandonné** en cours de cadrage. Le zoom actuel
(`SpeciesSheet.vue`, `.zoom-scrim` / `.zoom-art`) reste inchangé.

---

## A · Stats à l'évolution

### Problème

`EvolutionOverlay.vue` n'affiche aujourd'hui que le bandeau « Évolution », la
transition `Nom → Nom` et un bouton. Le rituel de découverte (`RitualOverlay.vue`)
affiche lui un bloc complet : rareté, marqueur « Nouveau », chromatique, bonbons de
la famille. L'évolution, qui est le second moment fort du jeu, ne dit rien.

### Comportement attendu

L'écran d'évolution affiche le **même bloc que la découverte**, avec les mêmes
classes CSS, à la suite de la ligne `Herbizarre → Florizarre` :

```
              ÉVOLUTION
       ✦ CHROMATIQUE ✦            ← bandeau conditionnel
     Herbizarre → Florizarre
   [Nouveau] [Rare] [✦ Chromatique]
  Première entrée à la planche ·
    il reste 12 bonbons Bulbizarre

        [ Voir la planche ]
```

Règles d'affichage, toutes portant sur **l'espèce cible** :

- **Bandeau** — `✦ Chromatique ✦` si l'exemplaire est chromatique, sinon
  `★ Légendaire ★` si la cible est de palier `l`, sinon le bandeau « Évolution »
  actuel. Un seul bandeau à la fois, même priorité que dans le rituel.
- **Chip « Nouveau »** — visible si l'espèce cible n'était **pas encore** à la
  planche avant cette évolution.
- **Chip de rareté** — `TIER_LABEL[DEX[to].tier]`, toujours visible.
- **Chip chromatique** — visible si l'exemplaire évolué est chromatique (la
  propriété `shiny` est déjà transmise à l'overlay et héritée de l'exemplaire
  d'origine).
- **Note** — `Première entrée à la planche` ou `Déjà à la planche` selon le même
  booléen, puis `· il reste N bonbons <Famille>`, où `N` est le solde **après**
  la dépense.

### Le piège à ne pas reproduire

`App.vue:84-91` documente déjà ce piège pour `claim` : la fonction inscrit
l'espèce au dex **avant** la cérémonie, donc une liaison directe la dirait déjà
rencontrée et le marqueur ne s'allumerait jamais.

`collection.evolve()` a exactement le même effet : l'entrée est poussée dans
`state.evolutions`, `bySpecies` la reflète immédiatement, et `isNewSpecies(to)`
renvoie alors `false` quoi qu'il arrive.

**Le booléen doit donc être figé avant le `await`**, comme `ritualIsNew` :

```js
async function onEvolve({ from, to }) {
  const shiny = collection.dex.bySpecies.value[from]?.some((e) => e.shiny) ?? false
  const isNew = collection.dex.isNewSpecies(to)   // ← AVANT l'écriture
  selected.value = null
  await collection.evolve(from, to, new Date().toISOString().slice(0, 10))
  if (collection.error.value) return
  evoAnim.value = { from, to, shiny, isNew }
}
```

Les **bonbons suivent la règle inverse** : ils se lisent *après* l'écriture,
puisqu'on veut le solde restant, dépense déduite. Ils sont donc passés en prop
liée (`:candies="collection.dex.candies(evoAnim.to)"`), non figée dans `evoAnim`.

### Découpage

`EvolutionOverlay.vue` gagne deux props :

| Prop | Type | Rôle |
|---|---|---|
| `isNew` | `Boolean`, défaut `false` | État d'avant l'écriture — seul état où la question a un sens |
| `candies` | `Number`, requis | Solde de la famille après la dépense |

Aucun composant partagé n'est extrait. Les classes `.reveal-banner`,
`.reveal-name`, `.reveal-tags`, `.reveal-note`, `.chip`, `.new-chip`,
`.shiny-chip` sont déjà **globales** dans `styles.css` (aucun composant du projet
n'utilise `<style scoped>`), donc seul le markup est dupliqué — huit lignes,
contre un composant à paramétrer pour deux usages qui divergent déjà sur le nom
(nom simple vs `X → Y`) et sur le bandeau.

Le bloc s'insère dans `.evo-cap`, qui porte déjà l'animation d'entrée retardée
(`fadeUp .6s ease-out 2.4s both`) : les informations apparaissent après la
cérémonie, pas pendant.

### Tests

Dans `EvolutionOverlay.test.js` :

- la chip « Nouveau » est présente quand `isNew` est vrai, absente sinon ;
- la chip de rareté porte le libellé du palier **de la cible**, pas de l'origine ;
- le bandeau chromatique prime sur le bandeau légendaire ;
- la note affiche le solde de bonbons et le nom de la famille.

Dans le test de `App.vue` (ou un test dédié de `onEvolve`) : `isNew` transmis à
l'overlay reste `true` lorsque l'espèce cible n'était pas encore à la planche,
**bien que** `evolve` l'y ait inscrite entre-temps. C'est le test qui protège du
piège ci-dessus ; sans lui la régression est invisible à l'œil.

---

## B · Touche Espace

### Problème

Aucun raccourci clavier global n'existe (seul `SpeciesSheet.vue:40` écoute
`keyup.enter` sur le sprite). Un utilisateur qui vient de merger veut enchaîner
depuis la home : ouvrir le deck, briser les sceaux, passer au suivant, sans
toucher la souris.

### Chaîne attendue

| État | Espace |
|---|---|
| Home | ouvre le deck (sans effet s'il n'y a rien à ouvrir) |
| Pli scellé | brise le sceau |
| Silhouette | **rien** |
| Révélé | suivant / retour à la planche |
| Évolution | voir la planche |

L'attente de la révélation est **délibérément intouchable** : elle fait partie du
rituel, Espace ne la saute pas. `RitualOverlay.vue:62-64` calcule déjà ce délai
(2,2 s, 2,8 s pour un légendaire, 150 ms en `prefers-reduced-motion`).

### Approche : le focus plutôt qu'un routeur clavier

Plutôt qu'un gestionnaire global qui réimplémenterait l'état interne de chaque
overlay (`RitualOverlay` est seul à connaître son `stage`), **chaque overlay
donne le focus à son bouton principal quand celui-ci apparaît**. Espace agit
alors nativement, par le comportement standard du navigateur.

| État | Élément qui reçoit le focus |
|---|---|
| Pli scellé | `.packet` |
| Silhouette | *(aucun — d'où « Espace ne fait rien »)* |
| Révélé | `.next-btn` |
| Évolution | `.next-btn` |

Trois bénéfices : la logique reste là où vit l'état, le comportement « rien
pendant la silhouette » tombe gratuitement, et cela **corrige un trou
d'accessibilité réel** — aujourd'hui, à l'ouverture d'un overlay, le focus reste
sur l'élément déclencheur situé *derrière* lui.

Sans cette discipline, un bug net apparaît : on clique « Ouvrir » à la souris, le
focus reste sur `.claim-btn` (dans `TheRail`, toujours monté derrière
l'overlay), et Espace ré-active ce bouton — donc rappelle `openRitual()`, qui
**remet la file au premier pli**.

Mise en œuvre : un `ref` de template et un `focus()` déclenché au montage et à
chaque changement d'étape (`watch` sur `stage`), en `nextTick` pour que l'élément
existe. Les boutons doivent être focusables sans être dans l'ordre de tabulation
naturel du fond : ils sont déjà des `<button>`, rien à ajouter.

### Le seul cas restant : la home

Un seul état n'a pas de bouton à focaliser par défaut : la home au repos. Il est
couvert par un `keydown` sur `window` posé dans `App.vue`, sous **garde stricte**.
L'action est ignorée si :

- `e.key !== ' '` ;
- `e.repeat` est vrai (maintenir la touche n'enchaîne pas les ouvertures) ;
- un modificateur est enfoncé (`ctrlKey`, `metaKey`, `altKey`, `shiftKey`) ;
- un overlay est ouvert (`ritualEntry`, `evoAnim`, `selected`, `settingsOpen`) —
  ces états-là relèvent du focus, pas du gestionnaire global ;
- `document.activeElement` est un élément interactif (`button`, `a`, `input`,
  `select`, `textarea`, ou porteur de `tabindex`). Sans cette garde, Espace sur
  le bouton « filtrer » ouvrirait le deck au lieu de replier les filtres.

Quand aucune garde ne s'applique, l'événement fait `preventDefault()` (pour
supprimer le défilement de la page) puis appelle `openRitual()`. Si rien n'est en
attente, `openRitual` positionne `ritualEntry` à `null` et il ne se passe donc
rien de visible — comportement voulu, pas de cas particulier à écrire.

Le gestionnaire est retiré dans `onUnmounted`.

### Échap

Complément naturel du même chantier : Échap ferme l'overlay du dessus, dans
l'ordre de l'empilement visuel donné par les `z-index` de `styles.css` —
évolution (70), rituel (60), réglages, fiche espèce (40). Fermer le rituel
**conserve les plis restants** (c'est déjà le contrat du bouton `.ritual-close`) ;
fermer l'écran d'évolution fait la même chose que son bouton, c'est-à-dire ouvrir
la fiche de l'espèce obtenue.

Le zoom du sprite est un état **interne** à `SpeciesSheet` : Échap ferme la fiche
entière, zoom compris, plutôt que le zoom seul. Le faire autrement demanderait
soit de remonter cet état dans `App.vue`, soit un écouteur en phase de capture
avec `stopPropagation` — beaucoup de mécanique pour une sous-couche d'un retour
qui a par ailleurs été abandonné.

### Tests

- `RitualOverlay.test.js` : à l'ouverture le focus est sur `.packet` ; après
  passage à `revealed` il est sur `.next-btn` ; pendant `silhouette`, Espace ne
  change pas l'étape.
- `EvolutionOverlay.test.js` : le focus arrive sur `.next-btn`.
- Test de `App.vue` : Espace sur `window` depuis la home émet l'ouverture ; il ne
  fait rien quand un overlay est ouvert ; il ne fait rien quand `activeElement`
  est un `<button>` ; il ne fait rien avec `e.repeat` ou une touche de
  modification enfoncée.

---

## C · Fiche enrichie

### Problème

`SpeciesSheet.vue` affiche le numéro, le nom, la rareté, le journal des captures
et les bonbons. Rien sur le Pokémon lui-même. `shared/species.js` ne stocke que
`[id, nom, palier, évolueVers, coût]` — **ni type ni description**.

La lignée d'évolution, elle, est **déjà entièrement déductible** des données
existantes (`DEX`, `PARENT`, `familyOf`) : elle ne demande aucune source neuve.

### C.1 · Source des données

Un script one-shot, `scripts/gen-species-info.mjs`, exposé par
`npm run gen:species-info`, écrit `shared/species-info.json`, **commité dans le
dépôt** (~30 Ko) :

```json
{
  "1": {
    "types": [{ "slug": "grass", "name": "Plante" }, { "slug": "poison", "name": "Poison" }],
    "text": "Il a une graine sur le dos depuis sa naissance…"
  }
}
```

Chaque type porte **son identifiant anglais et son nom français**. L'identifiant
sert de clé de couleur en CSS (`--type-grass`) : le déduire du nom français en
retirant les accents marcherait, mais ferait dépendre une variable CSS d'une
chaîne traduite.

Le script interroge PokeAPI :

| Appel | Pour |
|---|---|
| `/type/{1..18}` | noms français des types, une fois, mis en cache mémoire |
| `/pokemon/{id}` | les types de l'espèce (identifiants anglais, traduits via la table ci-dessus) |
| `/pokemon-species/{id}` | le texte de Pokédex |

Appels séquentiels avec une courte pause, par correction envers une API publique
et gratuite — le script tourne une fois, sa durée n'a aucune importance.

**Choix du texte français.** Les versions gen 1 n'ont jamais eu de traduction
française : `flavor_text_entries` n'a donc pas d'entrée `fr` pour `red`, `blue`
ou `yellow`. On prend la première entrée en `fr` par ordre de préférence
`firered` → `leafgreen` → n'importe laquelle disponible — les deux premières sont
les remakes gen 1, donc les textes les plus fidèles à l'univers de la planche.
PokeAPI laisse des `\n` et des `\f` dans ces textes : ils sont remplacés par des
espaces simples et les espaces multiples réduits.

Le script **échoue bruyamment** si un id des 151 ne peut être résolu, plutôt que
d'écrire un JSON partiel.

**Test de garde** (`shared/species-info.test.js`) : le JSON couvre exactement les
ids 1 à 151, chaque entrée a au moins un type et un texte non vide, et chaque nom
de type appartient à la table des 18 types connus. Une régénération ratée casse
alors la CI au lieu de vider silencieusement les fiches.

### C.2 · Types

Pastilles affichées dans `.panel-top`, à la suite de la chip de rareté et de la
chip chromatique :

```
PLANCHE Nº 001
Bulbizarre
[Rare]  ● Plante  ● Poison
```

Les couleurs sont **désaturées vers la palette parchemin** du projet, et non
reprises telles quelles du code couleur standard : un jaune Électrik pur ou un
rose Fée saturé jurerait avec les ocres et les bruns du reste de l'interface.
Chaque type reçoit une variable `--type-<slug>` dans `styles.css`, teintée dans
la même famille chromatique que les variables `--t-c` … `--t-l` existantes.

### C.3 · Lignée d'évolution

Nouvelle section, **au-dessus** du « Journal des captures » — c'est une
information sur l'espèce, elle précède l'historique personnel :

```
LIGNÉE
  [●]  ──8🍬──▶  [●]  ──16🍬──▶  [░]
Bulbizarre     Herbizarre     Florizarre
   ▲ ici
```

- Sprites de chaque membre de la famille, flèches entre les étapes, coût en
  bonbons porté par la flèche.
- Étape courante mise en avant (bordure teintée par la rareté, libellé « ici »).
- Étapes **non capturées** rendues en silhouette, avec le même filtre que
  `.reveal img.silh` (`brightness(0) invert(.5) contrast(.85)`) — cohérent avec
  la silhouette du rituel et sans divulguer l'aspect d'un Pokémon jamais vu.
- **Masquée** si la famille ne compte qu'un membre (Onix, Ptéra, les
  légendaires…) : une lignée d'une seule case n'apprend rien.

**Nouvelle fonction pure `familyLine(id)`** dans `shared/species.js`, qui renvoie
la famille sous forme d'étages successifs à partir de la racine :

```js
familyLine(2)   // → [[1], [2], [3]]
familyLine(134) // → [[133], [134, 135, 136]]   ← l'éventail d'Évoli
familyLine(95)  // → [[95]]                      ← Onix, un seul membre
```

Le format en étages est ce qui permet à l'affichage de traiter d'un même geste la
lignée droite et la ramification : le dernier étage d'Évoli contient trois
espèces, rendues côte à côte après une seule flèche. Un `[[133], [134, 135, 136]]`
se rend en éventail, un `[[1], [2], [3]]` en ligne.

La fonction se construit depuis `familyOf` et `PARENT`, en descendant depuis la
racine. Elle est **bornée** de la même façon que `familyOf` (`SPECIES.length`
étages au maximum) : une table malformée lève plutôt que de boucler, la fonction
étant appelée depuis le rendu.

Tests dans `shared/species.test.js` : lignée droite à trois étages, lignée à deux
étages, famille solitaire, éventail d'Évoli, et — quel que soit le membre passé
en argument — le même résultat pour toute la famille.

### C.4 · Texte de Pokédex

En bas de fiche, après les sections existantes, en style de citation, sur un fond
légèrement retrait pour le distinguer du contenu de jeu.

### C.5 · Règle commune : rien sur une silhouette

Types, lignée et texte de Pokédex ne s'affichent **que pour une espèce
capturée**. La fiche masque déjà le nom (`—————` quand `caught` est faux) : il
serait incohérent de divulguer le reste. La section « Pas encore à la planche »
existante reste le seul contenu d'une fiche non capturée.

---

## Ordre d'implémentation

Les trois chantiers sont indépendants. Ordre recommandé, du plus contenu au plus
large :

1. **A — stats à l'évolution.** Un fichier, deux props, le piège du booléen figé.
2. **B — touche Espace.** Trois composants touchés, aucune donnée nouvelle.
3. **C — fiche enrichie.** Un script, un fichier de données, une fonction pure,
   trois sections d'interface. Peut lui-même se découper : la lignée ne dépend
   d'aucune donnée neuve et peut précéder le script de génération.
