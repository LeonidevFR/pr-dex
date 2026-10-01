# Choix de l'exemplaire à faire évoluer

## Contexte

Aujourd'hui, quand un joueur fait évoluer une espèce dont il possède plusieurs
exemplaires (ex. 2 Magicarpe, dont 1 chromatique), le choix de l'exemplaire
consommé est entièrement automatique côté `useCollection.js` (`pickAvailable`) :
il priorise le chromatique s'il y en a un, sinon le premier disponible. Le
joueur ne peut choisir que l'espèce cible (en cas d'évolutions multiples, ex.
Évoli), jamais quel exemplaire précis est sacrifié.

Objectif : donner au joueur la main sur le choix de l'exemplaire, tout en
gardant le shiny protégé par défaut (pré-sélectionné, mais pas imposé).

## Comportement attendu

- Le sélecteur d'exemplaire s'affiche **systématiquement** avant toute
  évolution, même s'il n'y a qu'un seul exemplaire disponible (pas de
  raccourci "évolution directe" quand il n'y a pas de choix réel).
- Le sélecteur s'intègre **dans la fiche existante** (`SpeciesSheet.vue`),
  sans modale : cliquer sur une cible d'évolution bascule la section
  bonbons/bouton vers une liste d'exemplaires à cocher + "Confirmer"/"Annuler".
- Un exemplaire est **pré-coché par défaut** : le chromatique s'il y en a un,
  sinon le premier — reprend la priorité actuelle comme valeur par défaut,
  modifiable par le joueur avant confirmation.
- Quand l'espèce a plusieurs cibles possibles, l'ordre est : **cible d'abord**
  (comme aujourd'hui), **puis** sélection de l'exemplaire pour cette cible.
- Si l'exemplaire choisi n'est plus disponible au moment de la confirmation
  (conflit d'écriture concurrent entre deux appareils du même utilisateur —
  cas rare), l'évolution échoue silencieusement, **exactement comme le cas
  "bonbons insuffisants" aujourd'hui** : pas de fallback automatique, pas de
  message d'erreur dédié. Le joueur rouvrirait la fiche et re-choisirait sur
  l'état à jour.

## Couche données — `src/composables/useCollection.js`

- `evolve(fromId, toId, date)` devient `evolve(fromId, toId, specimenKey, date)`.
- `pickAvailable(fromId, s)` — qui reconstruisait la liste des exemplaires
  disponibles **et** choisissait celui à consommer (priorité shiny) — est
  remplacée par `availableFor(fromId, s)`, qui ne fait que reconstruire et
  renvoyer la liste (même logique de reconstruction : captures `claimed` +
  évolutions précédentes, exclusion des `consumed`). Elle garde le
  fonctionnement de revalidation sur l'état frais après un conflit
  d'écriture (`persist` rejoue `mutate`).
- Dans le mutateur d'`evolve`, après le calcul de `available` :
  `const picked = available.find((c) => c.key === specimenKey)`.
  Si `!picked`, retourner `null` — même traitement que
  `earned - spent < cost` aujourd'hui (le mutateur devient sans objet, la
  revalidation sur l'état frais gère aussi bien le cas normal que le cas de
  conflit concurrent).

## Couche UI — `src/components/SpeciesSheet.vue`

- Nouvelle prop `available` : liste réactive des exemplaires non consommés de
  l'espèce affichée (`dex.availableEntries(id)`, déjà exposée par `useDex.js`
  mais non branchée actuellement). Chaque entrée porte `key` et `shiny`.
- État local : `pickingTarget` (id de l'espèce cible en cours de sélection,
  ou `null`) et `selectedKey` (clé de l'exemplaire coché).
- Cliquer sur un bouton de cible (cas mono-cible `targets.length === 1` ou
  multi-cible `evo-choices`) ne fait plus émettre `evolve` directement :
  ça met `pickingTarget.value = <id cible>` et initialise
  `selectedKey.value = available.find((e) => e.shiny)?.key ?? available[0]?.key`.
- Quand `pickingTarget` est renseigné, la section bonbons/boutons cède la
  place à la liste des `available` (même style visuel que les lignes du
  "Journal des captures", avec le badge ✦ pour le shiny), affichée en choix
  radio (un seul sélectionnable à la fois), + deux boutons "Confirmer" et
  "Annuler". "Annuler" remet `pickingTarget.value = null`.
- "Confirmer" émet `evolve({ from: id, to: pickingTarget.value, key: selectedKey.value })`
  puis réinitialise `pickingTarget.value = null` (fermeture de l'étape de
  sélection ; la fiche elle-même se ferme ensuite via le handler `App.vue`
  comme aujourd'hui).
- Le sélecteur s'affiche même avec un seul exemplaire disponible dans
  `available` (choix imposé), avec cet unique exemplaire déjà coché.

## `src/App.vue`

- Passe la nouvelle prop : `:available="collection.dex.availableEntries(selected) ?? []"`.
- `onEvolve({ from, to, key })` :
  - Récupère le statut shiny exact de l'exemplaire choisi (et non plus
    l'approximation actuelle `bySpecies.value[from]?.some((e) => e.shiny)`,
    qui déclenchait l'animation shiny même quand un exemplaire non-shiny
    était consommé alors qu'un shiny existait par ailleurs) :
    `collection.dex.availableEntries(from).find((e) => e.key === key)?.shiny ?? false`.
  - Appelle `collection.evolve(from, to, key, new Date().toISOString().slice(0, 10))`.

## Tests

- `src/composables/useCollection.test.js` :
  - Le test existant "priorise une capture chromatique comme source" est
    retiré (ce comportement automatique n'existe plus dans `evolve` — la
    priorité shiny ne vit plus que côté UI, en pré-sélection).
  - Nouveau test : `evolve` avec une `specimenKey` explicite consomme bien
    cet exemplaire précis (y compris un choix délibéré du *non*-shiny quand
    un shiny est disponible).
  - Nouveau test : `evolve` avec une `specimenKey` qui ne correspond à aucun
    exemplaire disponible (déjà consommée, ou d'une autre espèce) échoue
    proprement (pas de mutation d'état), même comportement que le test
    existant "bonbons insuffisants".
- `src/components/SpeciesSheet.test.js` : adapter les tests d'évolution
  existants au flux à deux étapes (clic cible → sélection affichée → clic
  "Confirmer" → event `evolve` avec `{ from, to, key }`), et ajouter un test
  de changement de sélection (cocher un autre exemplaire que celui
  pré-coché avant de confirmer).

## Hors périmètre

- Pas de tri/filtre avancé de la liste des exemplaires disponibles (date,
  source) au-delà de l'ordre naturel déjà utilisé par `availableEntries`.
- Pas de changement au comportement `canEvolve` (bonbons + au moins un
  exemplaire disponible), qui continue de gater l'affichage du bouton avant
  même d'arriver au sélecteur.
