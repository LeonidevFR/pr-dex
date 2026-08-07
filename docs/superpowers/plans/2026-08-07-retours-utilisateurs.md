# Retours utilisateurs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Répondre à trois retours des utilisateurs de l'équipe — afficher les statistiques sur l'écran d'évolution, permettre d'enchaîner les ouvertures à la touche Espace, et enrichir la fiche d'espèce (types, lignée, notice de Pokédex).

**Architecture:** Trois chantiers indépendants sur une application Vue 3 sans routeur ni gestion d'état globale. (A) `EvolutionOverlay` reprend le bloc d'informations du rituel de découverte ; le booléen « espèce nouvelle » est figé dans `App.vue` avant l'écriture, comme l'est déjà celui du rituel. (B) Plutôt qu'un routeur clavier global qui dupliquerait l'état interne de chaque overlay, chaque overlay donne le focus à son bouton principal — Espace agit alors nativement ; un composable ne couvre que la home au repos et la touche Échap. (C) Un script one-shot génère un fichier de données commité ; la lignée d'évolution, elle, se déduit des données existantes par une fonction pure.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), Vite 6, Vitest 3 + `@vue/test-utils` en environnement jsdom, Node ≥ 20 pour les scripts (`.mjs`, `fetch` natif).

## Global Constraints

- **Spec de référence :** `docs/superpowers/specs/2026-08-07-retours-utilisateurs-design.md`. En cas de divergence, la spec fait foi.
- **Langue :** tout le texte visible, les noms de tests et les commentaires de code sont en **français**.
- **Commentaires :** le dépôt commente le *pourquoi*, jamais le *quoi*. N'écrire un commentaire que là où le plan en fournit un — ils portent un piège réel, pas une paraphrase du code.
- **Aucun `<style>` dans les composants.** Tout le CSS vit dans `src/styles.css`, qui est global. Les classes existantes (`.chip`, `.reveal-name`, `.sect`, `.eyebrow`, `.muted`…) sont donc réutilisables telles quelles.
- **Palette :** n'utiliser que les variables de `:root` dans `src/styles.css` (`--paper`, `--plate`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--stamp`, `--ochre`, `--herb`, `--t-c` … `--t-l`).
- **Tests :** `npm test` (Vitest, un seul passage). Cible : `npx vitest run <chemin>` pour un fichier, `-t "<nom>"` pour un test.
- **Commits :** un commit par tâche, message en français, préfixe `feat:` / `test:` / `chore:`.
- **Ne pas pousser** sans demande explicite. Si un `push` est demandé, préfixer par `GS_REVIEW_BYPASS=1` (ce dépôt n'utilise pas `gs-review-and-fix`).

---

# Chantier A — Statistiques à l'évolution

### Task 1: Bloc d'informations dans `EvolutionOverlay`

**Files:**
- Modify: `src/components/EvolutionOverlay.vue` (tout le fichier, 26 lignes)
- Test: `src/components/EvolutionOverlay.test.js`

**Interfaces:**
- Consumes: `DEX`, `TIER_LABEL`, `TIER_VAR`, `familyOf` depuis `shared/species.js` ; `spriteUrl` depuis `src/lib/sprites.js`.
- Produces: `EvolutionOverlay` accepte désormais deux props supplémentaires —
  `isNew: Boolean` (défaut `false`) et `candies: Number` (**requis**).
  La tâche 2 les fournit depuis `App.vue`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter en tête de `src/components/EvolutionOverlay.test.js`, dans le helper de montage, les deux nouvelles props (`candies` est requise : sans elle, tous les tests existants émettent un avertissement Vue) :

```js
const mountEvo = (props) =>
  mount(EvolutionOverlay, { props: { from: 1, to: 2, shiny: false, candies: 0, ...props } })
```

Puis ajouter ce bloc à la fin du fichier :

```js
describe('bloc d’informations', () => {
  it('marque une espèce cible jamais rencontrée', () => {
    const w = mountEvo({ isNew: true })
    expect(w.find('.new-chip').text()).toBe('Nouveau')
    expect(w.find('.reveal-note').text()).toContain('Première entrée à la planche')
  })

  it('ne marque rien pour une espèce déjà à la planche', () => {
    const w = mountEvo({ isNew: false })
    expect(w.find('.new-chip').exists()).toBe(false)
    expect(w.find('.reveal-note').text()).toContain('Déjà à la planche')
  })

  it('ne suppose rien quand la propriété est absente', () => {
    expect(mountEvo({}).find('.new-chip').exists()).toBe(false)
  })

  // Le palier affiché est celui de ce qu'on obtient, pas de ce qu'on avait :
  // Magicarpe (commun) → Léviator (rare).
  it('affiche le palier de la forme obtenue', () => {
    expect(mountEvo({ from: 129, to: 130 }).find('.reveal-tags').text()).toContain('Rare')
    expect(mountEvo({ from: 129, to: 130 }).find('.reveal-tags').text()).not.toContain('Commun')
  })

  it('affiche le solde de bonbons restant et la famille qui les porte', () => {
    // Herbizarre → Florizarre : la famille est celle de la racine, Bulbizarre.
    const w = mountEvo({ from: 2, to: 3, candies: 12 })
    expect(w.find('.reveal-note').text()).toContain('il reste 12 bonbons')
    expect(w.find('.reveal-note').text()).toContain('Bulbizarre')
  })

  it('annonce le chromatique dans le bandeau et dans les puces', () => {
    const w = mountEvo({ shiny: true })
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
    expect(w.find('.shiny-chip').exists()).toBe(true)
  })

  it('prime le chromatique sur le légendaire dans le bandeau', () => {
    // Aucune évolution ne mène à un légendaire dans le dex ; on force la cible pour
    // vérifier la règle de priorité elle-même, qui doit rester alignée sur le rituel.
    const w = mountEvo({ from: 1, to: 144, shiny: true })
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
  })

  it('garde le bandeau « Évolution » dans le cas ordinaire', () => {
    expect(mountEvo({}).find('.reveal-banner').text()).toBe('Évolution')
  })

  it('cumule les trois puces sans qu’aucune n’en remplace une autre', () => {
    const w = mountEvo({ isNew: true, shiny: true })
    expect(w.findAll('.chip')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/components/EvolutionOverlay.test.js`
Expected: FAIL — `.new-chip`, `.reveal-note` et `.reveal-tags` n'existent pas encore ; `find(...)` renvoie un wrapper vide et `.text()` lève.

- [ ] **Step 3: Réécrire le composant**

Remplacer intégralement `src/components/EvolutionOverlay.vue` :

```vue
<script setup>
import { computed } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR, familyOf } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  from: { type: Number, required: true },
  to: { type: Number, required: true },
  shiny: { type: Boolean, default: false },
  // Lu par App.vue AVANT l'écriture : `evolve` inscrit l'espèce cible au dex dès l'appel,
  // donc une lecture après coup répondrait toujours « déjà à la planche » et le marqueur
  // ne s'allumerait jamais. Même piège que `isNew` du rituel, même parade.
  isNew: { type: Boolean, default: false },
  // Solde de la famille APRÈS la dépense, à l'inverse : ici on veut ce qu'il reste,
  // pas ce qui vient d'être gagné.
  candies: { type: Number, required: true },
})
defineEmits(['done'])

const target = computed(() => DEX[props.to])
const family = computed(() => DEX[familyOf(props.to)])
</script>

<template>
  <div class="evostage" :style="{ '--tier': TIER_VAR[target.tier] }">
    <div class="evo-frame">
      <div class="evo-glow"></div>
      <img class="evo-from" :src="spriteUrl(from, shiny)" :alt="DEX[from].name">
      <img class="evo-to" :src="spriteUrl(to, shiny)" :alt="target.name">
    </div>
    <div class="evo-cap">
      <div v-if="shiny" class="reveal-banner">✦ Chromatique ✦</div>
      <div v-else-if="target.tier === 'l'" class="reveal-banner">★ Légendaire ★</div>
      <div v-else class="reveal-banner" style="color:var(--ochre)">Évolution</div>
      <div class="reveal-name">{{ DEX[from].name }} → {{ target.name }}</div>
      <div class="reveal-tags">
        <span v-if="isNew" class="chip new-chip">Nouveau</span>
        <span class="chip">{{ TIER_LABEL[target.tier] }}</span>
        <span v-if="shiny" class="chip shiny-chip">✦ Chromatique</span>
      </div>
      <div class="reveal-note mono">
        {{ isNew ? 'Première entrée à la planche' : 'Déjà à la planche' }} ·
        il reste {{ candies }} bonbon{{ candies > 1 ? 's' : '' }} <b>{{ family.name }}</b>
      </div>
      <button class="next-btn" style="margin-top:20px" @click="$emit('done')">Voir la planche</button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/components/EvolutionOverlay.test.js`
Expected: PASS — les six tests d'origine (nom, sprites, chromatique, palier, `done`, Évoli) et les neuf nouveaux.

- [ ] **Step 5: Vérifier le rendu réel dans le navigateur**

Run: `npm run dev`, puis ouvrir `http://localhost:5173/?demo`, ouvrir une fiche d'espèce évoluable et cliquer sur le bouton d'évolution.
Expected: après la cérémonie, le bloc s'affiche sous `Nom → Nom` — puces alignées et centrées, note en police mono. Les classes CSS étant déjà globales, aucune règle nouvelle n'est nécessaire ; si quelque chose n'est pas centré, c'est que le bloc n'est pas dans `.evo-cap`.

- [ ] **Step 6: Commit**

```bash
git add src/components/EvolutionOverlay.vue src/components/EvolutionOverlay.test.js
git commit -m "feat: bloc d'informations sur l'écran d'évolution"
```

---

### Task 2: Figer la nouveauté avant l'écriture dans `App.vue`

**Files:**
- Modify: `src/App.vue:107-114` (fonction `onEvolve`) et `src/App.vue:167-171` (montage de `EvolutionOverlay`)
- Test: `src/components/EvolutionOverlay.test.js` (nouveau bloc d'intégration)

**Interfaces:**
- Consumes: `EvolutionOverlay` avec ses props `isNew` et `candies` (tâche 1) ; `collection.dex.isNewSpecies(id)`, `collection.dex.candies(id)`, `collection.evolve(fromId, toId, date)` depuis `src/composables/useCollection.js`.
- Produces: `evoAnim` porte désormais `{ from, to, shiny, isNew }`. La tâche 6 lira `evoAnim` pour savoir qu'un overlay est ouvert.

- [ ] **Step 1: Écrire le test d'intégration qui échoue**

Ce test est le seul qui protège du piège : sans lui, inverser l'ordre de deux lignes rend le marqueur définitivement muet, sans qu'aucun test unitaire ne bronche. Il est calqué sur celui du rituel (`RitualOverlay.test.js`, « marque la nouveauté lue avant le claim, pas après »).

Ajouter en tête de `src/components/EvolutionOverlay.test.js` :

```js
import { useCollection } from '../composables/useCollection.js'
import { entryKey } from '../../shared/entry.js'

const catchOf = (id, species) => {
  const entry = {
    source: 'github', external_id: id, species, shiny: false, via: 'catch',
    label: 'fix: race condition', ref: 'moi/atlas#142 · a3f8c21',
    url: 'https://github.com/moi/atlas/pull/142', date: '2026-02-03',
  }
  return { key: entryKey(entry.source, entry.external_id), ...entry }
}

const fakeClient = (catches, claimed) => {
  let state = { claimed, spent: {}, evolutions: [] }
  return {
    readCatches: async () => catches,
    readState: async () => ({ state: JSON.parse(JSON.stringify(state)), blobSha: 'blob' }),
    writeState: async (next) => { state = JSON.parse(JSON.stringify(next)); return { blobSha: 'blob' } },
  }
}
```

Puis ajouter ce bloc à la fin du fichier :

```js
describe('intégration — App.vue ne doit pas lire la nouveauté après l’écriture', () => {
  // Trois captures de Bulbizarre = 9 bonbons, au-dessus des 8 que coûte Herbizarre.
  const loadedCollection = async () => {
    const col = useCollection()
    const catches = [catchOf('a', 1), catchOf('b', 1), catchOf('c', 1)]
    await col.load(fakeClient(catches, catches.map((c) => c.key)))
    return col
  }

  it('marque la nouveauté lue avant l’évolution, pas après', async () => {
    const col = await loadedCollection()
    const isNew = col.dex.isNewSpecies(2) // figé comme dans App.vue, AVANT l'écriture
    expect(isNew).toBe(true)

    await col.evolve(1, 2, '2026-08-07')
    expect(col.error.value).toBe(null)
    expect(col.dex.isNewSpecies(2)).toBe(false) // l'écriture l'a déjà inscrite

    const w = mountEvo({ from: 1, to: 2, isNew, candies: col.dex.candies(2) })
    expect(w.find('.new-chip').exists()).toBe(true)
  })

  it('affiche le solde de bonbons d’après la dépense', async () => {
    const col = await loadedCollection()
    expect(col.dex.candies(1)).toBe(9)
    await col.evolve(1, 2, '2026-08-07')

    const w = mountEvo({ from: 1, to: 2, candies: col.dex.candies(2) })
    expect(col.dex.candies(2)).toBe(1) // 9 gagnés − 8 dépensés
    expect(w.find('.reveal-note').text()).toContain('il reste 1 bonbon')
    expect(w.find('.reveal-note').text()).not.toContain('1 bonbons')
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/components/EvolutionOverlay.test.js -t "App.vue ne doit pas lire"`
Expected: les deux tests passent déjà, car ils exercent `useCollection` directement — ils décrivent le contrat que `App.vue` doit respecter. C'est attendu : ils servent de garde-fou documenté, la vraie vérification est l'inspection de l'étape 3. **Ne pas les supprimer** au motif qu'ils passent d'emblée : ils échoueront si `evolve` cesse un jour d'inscrire l'espèce immédiatement, ou si `candies` cesse de déduire la dépense.

- [ ] **Step 3: Modifier `onEvolve` dans `src/App.vue`**

Remplacer la fonction `onEvolve` (`src/App.vue:107-114`) :

```js
async function onEvolve({ from, to }) {
  const shiny = collection.dex.bySpecies.value[from]?.some((e) => e.shiny) ?? false
  // Figé avant l'écriture, pour la même raison que `ritualIsNew` plus haut : `evolve`
  // inscrit l'espèce cible au dex dès l'appel, donc une lecture après coup la dirait
  // toujours déjà rencontrée. Les bonbons suivent la règle inverse et se lisent au rendu,
  // après la dépense — d'où leur absence de cet instantané.
  const isNew = collection.dex.isNewSpecies(to)
  selected.value = null
  await collection.evolve(from, to, new Date().toISOString().slice(0, 10))
  // L'écriture a échoué : pas de cérémonie pour une évolution qui n'a pas eu lieu.
  if (collection.error.value) return
  evoAnim.value = { from, to, shiny, isNew }
}
```

- [ ] **Step 4: Brancher les deux props sur l'overlay**

Remplacer le montage de `EvolutionOverlay` (`src/App.vue:167-171`) :

```vue
    <transition name="fade">
      <EvolutionOverlay
        v-if="evoAnim" :from="evoAnim.from" :to="evoAnim.to" :shiny="evoAnim.shiny"
        :is-new="evoAnim.isNew" :candies="collection.dex.candies(evoAnim.to)" @done="finishEvo"
      />
    </transition>
```

- [ ] **Step 5: Lancer la suite complète**

Run: `npm test`
Expected: PASS sur tous les fichiers, aucun avertissement Vue sur une prop requise manquante.

- [ ] **Step 6: Vérifier dans le navigateur**

Run: `npm run dev`, ouvrir `http://localhost:5173/?demo`, faire évoluer une espèce jamais obtenue.
Expected: la puce « Nouveau » s'allume et la note dit « Première entrée à la planche ». Refaire évoluer la même espèce : la puce disparaît et la note dit « Déjà à la planche ».

- [ ] **Step 7: Commit**

```bash
git add src/App.vue src/components/EvolutionOverlay.test.js
git commit -m "feat: transmettre nouveauté et bonbons restants à l'écran d'évolution"
```

---

# Chantier B — Navigation à la touche Espace

### Task 3: Composable `useKeyboardNav`

**Files:**
- Create: `src/composables/useKeyboardNav.js`
- Test: `src/composables/useKeyboardNav.test.js`

**Interfaces:**
- Produces: `useKeyboardNav({ blocked, onSpace, onEscape })` — `blocked` est un `Ref<Boolean>` ou un `ComputedRef<Boolean>`, `onSpace` et `onEscape` sont des fonctions sans argument. Ne renvoie rien. Pose l'écouteur au montage, le retire au démontage. Consommé par la tâche 6.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/composables/useKeyboardNav.test.js` :

```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useKeyboardNav } from './useKeyboardNav.js'

// `attachTo` est indispensable : sans insertion dans le document, `document.activeElement`
// reste `<body>` et la garde sur l'élément focalisé ne peut pas être testée.
const host = (opts) =>
  mount(
    { setup: () => useKeyboardNav(opts), template: '<button class="b">x</button>' },
    { attachTo: document.body },
  )

const press = (key, over = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...over }))

afterEach(() => { document.body.innerHTML = '' })

const opts = (over = {}) => ({
  blocked: ref(false), onSpace: vi.fn(), onEscape: vi.fn(), ...over,
})

describe('Espace', () => {
  it('déclenche l’action principale au repos', () => {
    const o = opts(); host(o)
    press(' ')
    expect(o.onSpace).toHaveBeenCalledTimes(1)
  })

  it('supprime le défilement de la page', () => {
    host(opts())
    const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  // Maintenir la touche enfoncée ouvrirait sinon toute la file d'un coup.
  it('ignore la répétition automatique', () => {
    const o = opts(); host(o)
    press(' ', { repeat: true })
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  it('ignore les combinaisons à modificateur', () => {
    const o = opts(); host(o)
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) press(' ', { [mod]: true })
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  it('ne fait rien quand un overlay est ouvert — cet état relève de son propre focus', () => {
    const o = opts({ blocked: ref(true) }); host(o)
    press(' ')
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  // Sans cette absorption, le bouton resté focalisé DERRIÈRE l'overlay se ré-active :
  // « Ouvrir » remettrait la file au premier pli.
  it('absorbe quand même l’événement pendant qu’un overlay est ouvert', () => {
    host(opts({ blocked: ref(true) }))
    const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  // Sinon Espace sur le bouton « filtrer » ouvrirait le deck au lieu de replier les filtres.
  it('laisse la main quand le focus est déjà sur un élément interactif', () => {
    const o = opts(); const w = host(o)
    w.find('.b').element.focus()
    press(' ')
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  it('ignore les autres touches', () => {
    const o = opts(); host(o)
    press('a'); press('Enter')
    expect(o.onSpace).not.toHaveBeenCalled()
  })
})

describe('Échap', () => {
  it('ferme même quand un overlay est ouvert — c’est tout son intérêt', () => {
    const o = opts({ blocked: ref(true) }); host(o)
    press('Escape')
    expect(o.onEscape).toHaveBeenCalledTimes(1)
  })

  it('agit aussi quand le focus est sur un élément interactif', () => {
    const o = opts(); const w = host(o)
    w.find('.b').element.focus()
    press('Escape')
    expect(o.onEscape).toHaveBeenCalledTimes(1)
  })
})

describe('cycle de vie', () => {
  it('retire l’écouteur au démontage', () => {
    const o = opts(); const w = host(o)
    w.unmount()
    press(' ')
    expect(o.onSpace).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/composables/useKeyboardNav.test.js`
Expected: FAIL — `Failed to resolve import "./useKeyboardNav.js"`.

- [ ] **Step 3: Écrire le composable**

Créer `src/composables/useKeyboardNav.js` :

```js
import { onMounted, onUnmounted } from 'vue'

const INTERACTIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'])

const isInteractive = (el) => Boolean(el) && (INTERACTIVE.has(el.tagName) || el.hasAttribute('tabindex'))

/**
 * Raccourcis clavier globaux, volontairement réduits à ce qu'aucun overlay ne peut prendre
 * en charge lui-même. La chaîne « Espace pour enchaîner » repose d'abord sur le focus : chaque
 * overlay focalise son bouton principal et le navigateur fait le reste. Un routeur clavier
 * complet devrait sinon dupliquer l'état interne des overlays (l'étape du rituel, notamment),
 * et les deux copies divergeraient.
 *
 * @param {import('vue').Ref<boolean>} blocked — un overlay est ouvert : Espace lui appartient
 * @param {() => void} onSpace  — action principale de la home
 * @param {() => void} onEscape — fermeture de l'overlay du dessus
 */
export function useKeyboardNav({ blocked, onSpace, onEscape }) {
  function handle(e) {
    if (e.key === 'Escape') { onEscape(); return }
    if (e.key !== ' ') return
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

    // L'événement est absorbé même sans action : il faut neutraliser le bouton resté
    // focalisé DERRIÈRE l'overlay, sans quoi Espace ré-active « Ouvrir » et remet la
    // file au premier pli.
    if (blocked.value) { e.preventDefault(); return }

    // Le focus prime : Espace sur un bouton doit activer ce bouton, pas ouvrir le deck.
    if (isInteractive(document.activeElement)) return

    e.preventDefault()
    onSpace()
  }

  onMounted(() => window.addEventListener('keydown', handle))
  onUnmounted(() => window.removeEventListener('keydown', handle))
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/composables/useKeyboardNav.test.js`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useKeyboardNav.js src/composables/useKeyboardNav.test.js
git commit -m "feat: composable de raccourcis clavier globaux"
```

---

### Task 4: Focus par étape dans `RitualOverlay`

**Files:**
- Modify: `src/components/RitualOverlay.vue` (bloc `<script setup>` et deux attributs `ref` dans le template)
- Test: `src/components/RitualOverlay.test.js`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: aucun changement d'API publique — le composant garde exactement les mêmes props et événements. Seul le comportement de focus change.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/components/RitualOverlay.test.js` :

```js
describe('focus clavier', () => {
  // Monté dans le document : `document.activeElement` ne bouge pas sur un arbre détaché.
  const mountAttached = (props = {}) =>
    mount(RitualOverlay, { props: { entry: entryOf(), remaining: 1, ...props }, attachTo: document.body })

  afterEach(() => { document.body.innerHTML = '' })

  it('pose le focus sur le pli à l’ouverture', () => {
    const w = mountAttached()
    expect(document.activeElement).toBe(w.find('.packet').element)
  })

  it('pose le focus sur le bouton suivant une fois révélé', async () => {
    const w = mountAttached()
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('.next-btn').element)
  })

  // L'attente fait partie du rituel : rien à focaliser, donc Espace n'a rien à activer.
  it('ne focalise rien pendant la silhouette', async () => {
    const w = mountAttached()
    await w.find('.packet').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.reveal').classes()).toContain('silhouette')
    expect(document.activeElement).toBe(document.body)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/components/RitualOverlay.test.js -t "focus clavier"`
Expected: FAIL — `document.activeElement` reste `<body>` aux deux premiers tests.

- [ ] **Step 3: Ajouter la discipline de focus**

Dans `src/components/RitualOverlay.vue`, remplacer la ligne d'import de Vue (ligne 2) :

```js
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
```

Puis, juste après `onUnmounted(() => clearTimeout(timer))` (fin du `<script setup>`), ajouter :

```js
const packetEl = ref(null)
const nextEl = ref(null)

/**
 * Le focus part sur l'action principale de l'étape courante, et Espace agit alors nativement.
 * Cela corrige au passage un vrai trou d'accessibilité : sans ça, le focus reste sur le bouton
 * « Ouvrir » de TheRail, DERRIÈRE l'overlay.
 *
 * L'étape `silhouette` ne focalise rien, volontairement : l'attente fait partie du rituel et
 * ne doit pas pouvoir être escamotée d'un Espace pressé trop tôt.
 */
onMounted(() => packetEl.value?.focus())
watch(stage, async (s) => {
  await nextTick()
  if (s === 'revealed') nextEl.value?.focus()
})
```

Le focus initial passe par `onMounted` plutôt que par un `watch` en `immediate` : ce dernier
s'exécute pendant le `setup`, avant que la référence de template ne soit renseignée.

Dans le template, ajouter les deux `ref` :

```vue
        <button ref="packetEl" class="packet" @click="tear">
```

```vue
        <button ref="nextEl" class="next-btn" @click="$emit('next')">
```

- [ ] **Step 4: Lancer le fichier complet**

Run: `npx vitest run src/components/RitualOverlay.test.js`
Expected: PASS — les tests existants (dont ceux d'intégration avec `useCollection`) et les trois nouveaux.

- [ ] **Step 5: Vérifier au clavier dans le navigateur**

Run: `npm run dev`, ouvrir `http://localhost:5173/?demo`, cliquer sur « Ouvrir » **à la souris**, puis n'utiliser que la touche Espace.
Expected: le sceau se brise, l'attente se déroule sans qu'Espace ne l'écourte, puis Espace enchaîne sur le pli suivant. La file ne repart jamais au premier pli.

- [ ] **Step 6: Commit**

```bash
git add src/components/RitualOverlay.vue src/components/RitualOverlay.test.js
git commit -m "feat: focus sur l'action principale de chaque étape du rituel"
```

---

### Task 5: Focus après la cérémonie dans `EvolutionOverlay`

**Files:**
- Modify: `src/components/EvolutionOverlay.vue` (bloc `<script setup>` et un attribut `ref`)
- Test: `src/components/EvolutionOverlay.test.js`

**Interfaces:**
- Consumes: le composant issu de la tâche 1.
- Produces: aucun changement d'API publique.

- [ ] **Step 1: Écrire les tests qui échouent**

`EvolutionOverlay.test.js` n'utilise aujourd'hui ni horloge factice ni `matchMedia` ; jsdom n'implémente pas `matchMedia`, donc l'appel lèverait. Remplacer d'abord la ligne d'import de Vitest par :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
```

Puis ajouter, après les imports :

```js
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})
```

L'horloge factice n'affecte aucun test antérieur : ni les tests unitaires de la tâche 1 ni ceux d'intégration de la tâche 2 ne dépendent d'un `setTimeout` — `useCollection` n'enchaîne que des promesses, que Vitest ne fige pas.

Puis ajouter ce bloc à la fin du fichier :

```js
describe('focus clavier', () => {
  const mountAttached = (props = {}) =>
    mount(EvolutionOverlay, {
      props: { from: 1, to: 2, shiny: false, candies: 0, ...props },
      attachTo: document.body,
    })

  // La cérémonie dure ~2,4 s : focaliser tout de suite permettrait de l'escamoter
  // d'un Espace pressé trop tôt.
  it('ne focalise rien pendant la cérémonie', () => {
    mountAttached()
    expect(document.activeElement).toBe(document.body)
  })

  it('pose le focus sur le bouton une fois la cérémonie finie', async () => {
    const w = mountAttached()
    vi.advanceTimersByTime(2400)
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('.next-btn').element)
  })

  it('focalise sans attendre si l’utilisateur refuse les animations', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const w = mountAttached()
    vi.advanceTimersByTime(0)
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('.next-btn').element)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/components/EvolutionOverlay.test.js -t "focus clavier"`
Expected: FAIL sur les deux derniers — `document.activeElement` reste `<body>`.

- [ ] **Step 3: Ajouter le focus retardé**

Dans `src/components/EvolutionOverlay.vue`, remplacer la ligne d'import de Vue :

```js
import { computed, ref, onMounted, onUnmounted } from 'vue'
```

Ajouter à la fin du `<script setup>` :

```js
const nextEl = ref(null)
let focusTimer = null

// Aligné sur le retard d'apparition de `.evo-cap` dans styles.css (fadeUp … 2.4s) : donner
// le focus avant la fin de la cérémonie permettrait de l'escamoter d'un Espace pressé trop tôt.
const CAP_DELAY = 2400

onMounted(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion:reduce)').matches
  focusTimer = setTimeout(() => nextEl.value?.focus(), reduced ? 0 : CAP_DELAY)
})
onUnmounted(() => clearTimeout(focusTimer))
```

Dans le template, ajouter le `ref` :

```vue
      <button ref="nextEl" class="next-btn" style="margin-top:20px" @click="$emit('done')">Voir la planche</button>
```

- [ ] **Step 4: Lancer le fichier complet**

Run: `npx vitest run src/components/EvolutionOverlay.test.js`
Expected: PASS — l'horloge factice n'affecte aucun test existant, aucun ne dépendait du temps.

- [ ] **Step 5: Commit**

```bash
git add src/components/EvolutionOverlay.vue src/components/EvolutionOverlay.test.js
git commit -m "feat: focus sur le bouton d'évolution une fois la cérémonie finie"
```

---

### Task 6: Brancher Espace et Échap dans `App.vue`

**Files:**
- Modify: `src/App.vue` (imports, un `computed`, une fonction, un appel de composable)

**Interfaces:**
- Consumes: `useKeyboardNav` (tâche 3), les refs `ritualEntry`, `evoAnim`, `selected`, `settingsOpen` et les fonctions `openRitual`, `finishEvo` déjà présentes dans `App.vue`.
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Importer le composable**

Dans `src/App.vue`, après la ligne `import { useTrayFilters } from './composables/useTrayFilters.js'` :

```js
import { useKeyboardNav } from './composables/useKeyboardNav.js'
```

- [ ] **Step 2: Ajouter l'état « un overlay est ouvert » et la fermeture par priorité**

Ajouter à la fin du `<script setup>`, après `finishEvo` :

```js
const overlayOpen = computed(() =>
  Boolean(ritualEntry.value || evoAnim.value || selected.value || settingsOpen.value),
)

// Priorité calquée sur l'empilement visuel donné par les z-index de styles.css :
// évolution (70), rituel (60), puis réglages et fiche (40). Fermer le rituel conserve
// les plis restants, comme le fait déjà sa croix.
function closeTopOverlay() {
  if (evoAnim.value) { finishEvo(); return }
  if (ritualEntry.value) { ritualEntry.value = null; return }
  if (settingsOpen.value) { settingsOpen.value = false; return }
  if (selected.value) selected.value = null
}

useKeyboardNav({
  blocked: overlayOpen,
  // Seul état sans bouton principal à focaliser : la home au repos. `openRitual` laisse
  // `ritualEntry` à null quand la file est vide — rien à cas-particulariser ici.
  onSpace: openRitual,
  onEscape: closeTopOverlay,
})
```

- [ ] **Step 3: Lancer la suite complète**

Run: `npm test`
Expected: PASS. `App.vue` n'a pas de test unitaire (il dépend de `useAuth` et du client Supabase) ; la couverture vient du composable et des overlays, la vérification finale est manuelle.

- [ ] **Step 4: Vérifier la chaîne complète au clavier**

Run: `npm run dev`, ouvrir `http://localhost:5173/?demo` et **ne plus toucher la souris**.
Expected, dans l'ordre :
1. Espace depuis la home → le premier pli s'affiche.
2. Espace → le sceau se brise.
3. Espace pendant l'attente → rien ne se passe.
4. Espace une fois révélé → pli suivant, sceau déjà focalisé.
5. Sur le dernier pli, Espace → retour à la planche.
6. Échap depuis une fiche d'espèce ouverte → la fiche se ferme.
7. Tab jusqu'au bouton « filtrer » puis Espace → les filtres se replient, le deck **ne s'ouvre pas**.

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: ouvrir le deck à la touche espace, fermer à échap"
```

---

# Chantier C — Fiche d'espèce enrichie

### Task 7: Fonction pure `familyLine`

**Files:**
- Modify: `shared/species.js` (ajout en fin de fichier, après `hasEvoInFamily`)
- Test: `shared/species.test.js`

**Interfaces:**
- Consumes: `DEX`, `PARENT`, `familyOf`, `SPECIES` — tous déjà exportés par `shared/species.js`.
- Produces: `familyLine(id) → number[][]` — la famille de `id` en étages successifs depuis la racine. Consommé par la tâche 8.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `shared/species.test.js` (adapter la ligne d'import existante pour y inclure `familyLine`) :

```js
describe('familyLine', () => {
  it('déplie une lignée droite à trois étages', () => {
    expect(familyLine(2)).toEqual([[1], [2], [3]])
  })

  it('déplie une lignée à deux étages', () => {
    expect(familyLine(129)).toEqual([[129], [130]])
  })

  it('rend une famille solitaire comme un unique étage', () => {
    expect(familyLine(95)).toEqual([[95]]) // Onix
  })

  // Le format en étages est justement ce qui permet de rendre l'éventail et la ligne
  // droite avec le même code d'affichage.
  it('met les trois évolutions d’Évoli sur le même étage', () => {
    expect(familyLine(133)).toEqual([[133], [134, 135, 136]])
  })

  it('donne le même résultat quel que soit le membre interrogé', () => {
    const expected = [[133], [134, 135, 136]]
    for (const id of [133, 134, 135, 136]) expect(familyLine(id)).toEqual(expected)
  })

  it('contient toujours l’espèce interrogée, pour les 151', () => {
    for (const [id] of SPECIES) {
      expect(familyLine(id).flat()).toContain(id)
    }
  })

  it('reste cohérente avec familyOf sur les 151', () => {
    for (const [id] of SPECIES) {
      expect(familyLine(id)[0]).toEqual([familyOf(id)])
    }
  })

  it('ne produit jamais de doublon', () => {
    for (const [id] of SPECIES) {
      const flat = familyLine(id).flat()
      expect(new Set(flat).size).toBe(flat.length)
    }
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run shared/species.test.js -t "familyLine"`
Expected: FAIL — `familyLine is not a function`.

- [ ] **Step 3: Écrire la fonction**

Ajouter à la fin de `shared/species.js`, juste après `hasEvoInFamily` :

```js
/**
 * Lignée complète de la famille de `id`, en étages successifs depuis la racine :
 *
 *   familyLine(2)   → [[1], [2], [3]]
 *   familyLine(133) → [[133], [134, 135, 136]]   ← l'éventail d'Évoli
 *   familyLine(95)  → [[95]]                     ← Onix, seul de sa famille
 *
 * Le format en étages plutôt qu'une liste plate est ce qui permet à l'affichage de traiter
 * d'un même geste la lignée droite et la ramification : un étage à trois membres se rend en
 * éventail après une seule flèche, sans cas particulier.
 *
 * Bornée comme `familyOf`, et pour la même raison : elle est appelée depuis le rendu d'un
 * template, une table malformée doit lever plutôt que boucler indéfiniment.
 */
export function familyLine(id) {
  const line = [[familyOf(id)]]
  for (;;) {
    const next = line[line.length - 1].flatMap((s) => {
      const to = DEX[s].to
      return to === null ? [] : Array.isArray(to) ? to : [to]
    })
    if (!next.length) return line
    if (line.length >= SPECIES.length) {
      throw new Error(`familyLine: chaîne anormalement longue en descendant depuis l'id ${id}`)
    }
    line.push(next)
  }
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run shared/species.test.js`
Expected: PASS — les huit nouveaux tests et tous les existants.

- [ ] **Step 5: Commit**

```bash
git add shared/species.js shared/species.test.js
git commit -m "feat: familyLine, la lignée d'une famille en étages successifs"
```

---

### Task 8: Section « Lignée » dans la fiche

**Files:**
- Modify: `src/components/SpeciesSheet.vue` (imports, un `computed`, une prop, une section)
- Modify: `src/App.vue` (une prop supplémentaire au montage de `SpeciesSheet`)
- Modify: `src/styles.css` (règles `.line-*`, à insérer après le bloc `.log-*`)
- Test: `src/components/SpeciesSheet.test.js`

**Interfaces:**
- Consumes: `familyLine(id)` (tâche 7).
- Produces: `SpeciesSheet` accepte une prop `caughtIds: Set<number>` (défaut : `Set` vide) — l'ensemble des espèces déjà à la planche, nécessaire pour distinguer les étapes vues des silhouettes. Les tâches 10 et 11 ajoutent d'autres sections au même composant.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/components/SpeciesSheet.test.js`, ajouter `caughtIds` au helper de montage :

```js
const mountSheet = (props) =>
  mount(SpeciesSheet, {
    props: {
      id: 1, entries: null, candies: 0, canEvolve: false, isDeadEnd: false,
      caughtIds: new Set(), ...props,
    },
  })
```

Puis ajouter ce bloc à la fin du fichier :

```js
describe('lignée', () => {
  const withLine = (id, caughtIds) =>
    mountSheet({ id, entries: [capture('a', id)], caughtIds: new Set(caughtIds) })

  it('déplie les trois étages d’une lignée droite', () => {
    const w = withLine(2, [1, 2])
    expect(w.findAll('.line-cell')).toHaveLength(3)
  })

  it('marque l’étape courante', () => {
    const w = withLine(2, [1, 2])
    const here = w.findAll('.line-cell').filter((c) => c.classes().includes('here'))
    expect(here).toHaveLength(1)
    expect(here[0].text()).toContain('Herbizarre')
  })

  // Divulguer le nom d'une espèce jamais vue viderait la découverte de son intérêt.
  // L'assertion porte sur la cellule, pas sur toute la fiche : le bouton d'évolution
  // nomme déjà la cible, et c'est voulu — on ne peut pas choisir d'évoluer à l'aveugle.
  it('tait les étapes jamais rencontrées et les rend en silhouette', () => {
    const w = withLine(2, [1, 2])
    const unseen = w.findAll('.line-cell').filter((c) => c.classes().includes('unseen'))
    expect(unseen).toHaveLength(1)
    expect(unseen[0].text()).not.toContain('Florizarre')
    expect(unseen[0].text()).toContain('———')
  })

  it('porte le coût en bonbons sur chaque flèche', () => {
    const w = withLine(2, [1, 2])
    const costs = w.findAll('.line-cost').map((c) => c.text())
    expect(costs).toEqual(['8', '16']) // Bulbizarre → Herbizarre → Florizarre
  })

  it('range les trois évolutions d’Évoli sur un même étage', () => {
    const w = withLine(133, [133])
    expect(w.findAll('.line-cell')).toHaveLength(4)
    expect(w.findAll('.line-step')).toHaveLength(2)
    expect(w.findAll('.line-arrow')).toHaveLength(1)
  })

  // Une lignée d'une seule case n'apprend rien.
  it('se tait pour une famille solitaire', () => {
    expect(withLine(95, [95]).find('.line').exists()).toBe(false)
  })

  it('se tait sur une espèce jamais capturée', () => {
    const w = mountSheet({ id: 2, entries: null, caughtIds: new Set([1]) })
    expect(w.find('.line').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/components/SpeciesSheet.test.js -t "lignée"`
Expected: FAIL — aucune classe `.line-cell` dans le rendu.

- [ ] **Step 3: Modifier `SpeciesSheet.vue`**

Remplacer la ligne d'import de `species.js` :

```js
import { DEX, PARENT, TIER_LABEL, TIER_VAR, familyOf, familyLine, CANDY_PER_CATCH } from '../../shared/species.js'
```

Ajouter la prop dans `defineProps`, après `isDeadEnd` :

```js
  // Ensemble des espèces déjà à la planche : la lignée doit savoir lesquelles de ses étapes
  // ont été vues, information qu'`entries` (limité à l'espèce courante) ne porte pas.
  caughtIds: { type: Set, default: () => new Set() },
```

Ajouter après `availableCopies` :

```js
const line = computed(() => familyLine(props.id))
const seen = (id) => props.caughtIds.has(id)
```

Insérer la section dans le template, **juste avant** `<div v-if="caught" class="sect">` qui porte le journal des captures :

```vue
      <div v-if="caught && line.length > 1" class="sect">
        <div class="eyebrow sect-h"><span>Lignée</span></div>
        <div class="line">
          <template v-for="(step, i) in line" :key="i">
            <div v-if="i" class="line-arrow mono" aria-hidden="true">
              <span>▶</span><span class="line-cost">{{ DEX[line[i - 1][0]].cost }}</span>
            </div>
            <div class="line-step">
              <div
                v-for="s in step" :key="s" class="line-cell"
                :class="{ here: s === id, unseen: !seen(s) }"
                :style="{ '--tier': TIER_VAR[DEX[s].tier] }"
              >
                <img :src="spriteUrl(s)" :alt="seen(s) ? DEX[s].name : 'Espèce jamais rencontrée'">
                <span class="line-name">{{ seen(s) ? DEX[s].name : '———' }}</span>
                <span v-if="s === id" class="line-here mono">ici</span>
              </div>
            </div>
          </template>
        </div>
      </div>
```

- [ ] **Step 4: Ajouter le CSS**

Dans `src/styles.css`, insérer après la dernière règle `.log-*` (autour de la ligne 200, avant le bloc `.candy`) :

```css
  .line{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}
  .line-step{display:flex;gap:8px;flex-wrap:wrap}
  .line-cell{
    width:80px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px;
    background:var(--plate);box-shadow:inset 0 0 0 1px var(--rule);
  }
  .line-cell.here{box-shadow:inset 0 0 0 2px var(--tier)}
  .line-cell img{width:48px;height:48px;object-fit:contain}
  .line-cell.unseen img{filter:brightness(0) invert(.5) contrast(.85);opacity:.5}
  .line-name{font-family:var(--f-label);font-size:10px;font-weight:600;color:var(--ink-2);text-align:center;line-height:1.25}
  .line-here{font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--stamp)}
  .line-arrow{display:flex;flex-direction:column;align-items:center;gap:1px;padding-top:24px;font-size:11px;color:var(--ink-3)}
  .line-cost{font-size:10px}
  .line-cost::after{content:" 🍬"}
```

Le coût est écrit en texte nu et l'icône ajoutée en `::after` : le test lit `8`, pas `8 🍬`, et reste lisible.

- [ ] **Step 5: Passer la prop depuis `App.vue`**

Ajouter dans le `<script setup>` de `src/App.vue`, après `copiesById` :

```js
const caughtIds = computed(() => new Set(Object.keys(collection.dex.bySpecies.value).map(Number)))
```

Et au montage de `SpeciesSheet` (`src/App.vue:147-155`), ajouter l'attribut :

```vue
        :caught-ids="caughtIds"
```

- [ ] **Step 6: Lancer les tests pour les voir passer**

Run: `npx vitest run src/components/SpeciesSheet.test.js`
Expected: PASS — les sept nouveaux tests et tous les existants.

- [ ] **Step 7: Vérifier le rendu**

Run: `npm run dev`, ouvrir `http://localhost:5173/?demo`, ouvrir la fiche d'un Pokémon d'une famille à trois étages puis celle d'Évoli.
Expected: la lignée s'affiche au-dessus du journal, l'étape courante encadrée par la couleur de son palier, les étapes non vues en silhouette grise. L'éventail d'Évoli tient sur une ligne ou se replie proprement.

- [ ] **Step 8: Commit**

```bash
git add src/components/SpeciesSheet.vue src/components/SpeciesSheet.test.js src/App.vue src/styles.css
git commit -m "feat: section lignée d'évolution dans la fiche d'espèce"
```

---

### Task 9: Script de génération et données d'espèces

**Files:**
- Create: `scripts/gen-species-info.mjs`
- Create: `shared/species-info.json` (produit par le script, commité)
- Create: `scripts/gen-species-info.test.js`
- Create: `shared/species-info.test.js`
- Modify: `package.json` (un script npm)

**Interfaces:**
- Consumes: `SPECIES` depuis `shared/species.js` ; PokeAPI (`https://pokeapi.co/api/v2`).
- Produces: `shared/species-info.json`, de forme
  `{ "<id>": { types: [{ slug: string, name: string }], text: string } }`,
  avec une entrée pour chacun des ids 1 à 151. Consommé par les tâches 10 et 11.
  Le script exporte aussi deux fonctions pures : `cleanFlavor(text) → string` et
  `pickFlavor(entries) → string | null`.

- [ ] **Step 1: Écrire les tests des fonctions pures**

Créer `scripts/gen-species-info.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { cleanFlavor, pickFlavor } from './gen-species-info.mjs'

describe('cleanFlavor', () => {
  // PokeAPI stocke ces textes avec la mise en page de la boîte de dialogue du jeu.
  it('remplace les retours à la ligne et les sauts de page par des espaces', () => {
    expect(cleanFlavor('Il a une graine\nsur le dos depuis\fsa naissance.')).toBe(
      'Il a une graine sur le dos depuis sa naissance.',
    )
  })

  it('réduit les espaces multiples et rogne les bords', () => {
    expect(cleanFlavor('  deux   espaces \n ')).toBe('deux espaces')
  })

  it('retire les traits d’union conditionnels', () => {
    expect(cleanFlavor('POKé\u00adMON')).toBe('POKéMON')
  })
})

describe('pickFlavor', () => {
  const entry = (lang, version, text) => ({
    language: { name: lang }, version: { name: version }, flavor_text: text,
  })

  // Les versions gen 1 n'ont jamais eu de traduction française.
  it('ignore les entrées qui ne sont pas en français', () => {
    expect(pickFlavor([entry('en', 'red', 'A strange seed…')])).toBe(null)
  })

  it('préfère le texte de Rouge Feu', () => {
    const entries = [entry('fr', 'x', 'texte X'), entry('fr', 'firered', 'texte RF')]
    expect(pickFlavor(entries)).toBe('texte RF')
  })

  it('se rabat sur Vert Feuille à défaut de Rouge Feu', () => {
    const entries = [entry('fr', 'x', 'texte X'), entry('fr', 'leafgreen', 'texte VF')]
    expect(pickFlavor(entries)).toBe('texte VF')
  })

  it('accepte n’importe quelle version française en dernier recours', () => {
    expect(pickFlavor([entry('fr', 'x', 'texte X')])).toBe('texte X')
  })

  it('nettoie le texte retenu', () => {
    expect(pickFlavor([entry('fr', 'firered', 'deux\nlignes')])).toBe('deux lignes')
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run scripts/gen-species-info.test.js`
Expected: FAIL — `Failed to resolve import "./gen-species-info.mjs"`.

- [ ] **Step 3: Écrire le script**

Créer `scripts/gen-species-info.mjs` :

```js
import { writeFile } from 'node:fs/promises'
import { SPECIES } from '../shared/species.js'

const API = 'https://pokeapi.co/api/v2'
const OUT = new URL('../shared/species-info.json', import.meta.url)

/**
 * Les versions gen 1 n'ont jamais eu de traduction française : `flavor_text_entries` n'a
 * aucune entrée `fr` pour red, blue ou yellow. On se rabat sur les remakes gen 1, dont les
 * textes sont les plus fidèles à l'univers de la planche.
 */
const VERSION_PREFERENCE = ['firered', 'leafgreen']

/**
 * PokeAPI conserve la mise en page de la boîte de dialogue du jeu dans ces textes.
 * Le trait d'union conditionnel (U+00AD) est SUPPRIMÉ et non remplacé par une espace :
 * il coupait un mot au bord de la boîte, le remplacer scinderait le mot en deux.
 */
export const cleanFlavor = (text) =>
  text.replace(/\u00ad/g, '').replace(/[\n\f\r]/g, ' ').replace(/\s+/g, ' ').trim()

/** Premier texte français disponible, par ordre de préférence de version. */
export function pickFlavor(entries) {
  const fr = entries.filter((e) => e.language.name === 'fr')
  for (const version of VERSION_PREFERENCE) {
    const hit = fr.find((e) => e.version.name === version)
    if (hit) return cleanFlavor(hit.flavor_text)
  }
  return fr.length ? cleanFlavor(fr[0].flavor_text) : null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function get(path) {
  const res = await fetch(`${API}/${path}`)
  if (!res.ok) throw new Error(`PokeAPI ${path} → HTTP ${res.status}`)
  return res.json()
}

/** Les 18 types, une fois pour toutes : leur nom français ne dépend pas de l'espèce. */
async function frenchTypeNames() {
  const { results } = await get('type?limit=100')
  const map = {}
  for (const t of results) {
    const detail = await get(`type/${t.name}`)
    const fr = detail.names.find((n) => n.language.name === 'fr')
    if (fr) map[t.name] = fr.name
    await sleep(60)
  }
  return map
}

async function main() {
  const typeFr = await frenchTypeNames()
  const out = {}

  for (const [id] of SPECIES) {
    const mon = await get(`pokemon/${id}`)
    const species = await get(`pokemon-species/${id}`)

    const types = [...mon.types]
      .sort((a, b) => a.slot - b.slot)
      .map((t) => ({ slug: t.type.name, name: typeFr[t.type.name] }))
    const text = pickFlavor(species.flavor_text_entries)

    // Échec bruyant plutôt que JSON partiel : une fiche silencieusement vide en production
    // est beaucoup plus difficile à repérer qu'un script qui refuse de finir.
    if (!types.length || types.some((t) => !t.name)) throw new Error(`types manquants pour l'id ${id}`)
    if (!text) throw new Error(`texte français manquant pour l'id ${id}`)

    out[id] = { types, text }
    process.stdout.write(`\r${id}/${SPECIES.length}`)
    await sleep(60)
  }

  // Une entrée par ligne : le diff d'une régénération reste lisible.
  const body = Object.entries(out)
    .map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v)}`)
    .join(',\n')
  await writeFile(OUT, `{\n${body}\n}\n`)
  console.log(`\n${Object.keys(out).length} espèces écrites dans shared/species-info.json`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run scripts/gen-species-info.test.js`
Expected: PASS — 8 tests. Le garde `import.meta.url === ...` empêche l'appel réseau à l'import.

- [ ] **Step 5: Déclarer le script npm**

Dans `package.json`, ajouter après la ligne `"catch": "node scripts/catch.mjs"` :

```json
    "gen:species-info": "node scripts/gen-species-info.mjs"
```

(Penser à la virgule sur la ligne précédente.)

- [ ] **Step 6: Générer le fichier de données**

Run: `npm run gen:species-info`
Expected: le compteur monte jusqu'à `151/151`, puis `151 espèces écrites dans shared/species-info.json`. Compter ~2 minutes (une pause de 60 ms entre appels, par correction envers une API publique gratuite). En cas d'échec sur un id, le script s'arrête avec le message et l'id fautif — corriger la cause plutôt que de contourner en écrivant un JSON partiel.

- [ ] **Step 7: Écrire le test de garde sur les données**

Créer `shared/species-info.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { SPECIES } from './species.js'
import INFO from './species-info.json'

// Vite (et donc Vitest) résout nativement l'import d'un JSON, sans assertion d'import.
const TYPE_SLUGS = new Set([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
])

describe('species-info.json', () => {
  // Une régénération partielle viderait silencieusement des fiches : c'est la CI qui doit
  // le voir, pas un utilisateur devant une notice blanche.
  it('couvre exactement les 151 espèces de la planche', () => {
    expect(Object.keys(INFO).map(Number).sort((a, b) => a - b)).toEqual(SPECIES.map(([id]) => id))
  })

  it('donne à chaque espèce au moins un type, au plus deux', () => {
    for (const [id] of SPECIES) {
      expect(INFO[id].types.length).toBeGreaterThanOrEqual(1)
      expect(INFO[id].types.length).toBeLessThanOrEqual(2)
    }
  })

  it('n’utilise que des identifiants de type connus, avec un nom français non vide', () => {
    for (const [id] of SPECIES) {
      for (const t of INFO[id].types) {
        expect(TYPE_SLUGS).toContain(t.slug)
        expect(t.name.length).toBeGreaterThan(0)
      }
    }
  })

  it('donne à chaque espèce une notice non vide et déjà nettoyée', () => {
    for (const [id] of SPECIES) {
      expect(INFO[id].text.length).toBeGreaterThan(10)
      expect(INFO[id].text).not.toMatch(/[\n\f\r]/)
    }
  })
})
```

- [ ] **Step 8: Lancer la suite complète**

Run: `npm test`
Expected: PASS — le fichier généré satisfait les quatre gardes.

- [ ] **Step 9: Commit**

```bash
git add scripts/gen-species-info.mjs scripts/gen-species-info.test.js shared/species-info.json shared/species-info.test.js package.json
git commit -m "feat: génération des types et notices de Pokédex depuis PokeAPI"
```

---

### Task 10: Pastilles de type dans la fiche

**Files:**
- Modify: `src/components/SpeciesSheet.vue` (un import, un `computed`, quelques lignes de template)
- Modify: `src/styles.css` (18 variables de couleur dans `:root`, une règle `.type-chip`)
- Test: `src/components/SpeciesSheet.test.js`

**Interfaces:**
- Consumes: `shared/species-info.json` (tâche 9) ; le composant issu de la tâche 8.
- Produces: un `computed` `info` dans `SpeciesSheet`, réutilisé tel quel par la tâche 11.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/components/SpeciesSheet.test.js` :

```js
describe('types', () => {
  it('affiche les deux types d’une espèce capturée', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    expect(w.findAll('.type-chip').map((c) => c.text())).toEqual(['Plante', 'Poison'])
  })

  it('affiche le type unique d’une espèce mono-type', () => {
    const w = mountSheet({ id: 4, entries: [capture('a', 4)], caughtIds: new Set([4]) })
    expect(w.findAll('.type-chip').map((c) => c.text())).toEqual(['Feu'])
  })

  it('teinte chaque pastille par l’identifiant du type', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    expect(w.findAll('.type-chip')[0].attributes('style')).toContain('--type-grass')
  })

  // Cohérent avec le nom déjà masqué : une silhouette ne divulgue rien.
  it('se tait sur une espèce jamais capturée', () => {
    expect(mountSheet({ id: 1, entries: null }).findAll('.type-chip')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/components/SpeciesSheet.test.js -t "types"`
Expected: FAIL — aucune classe `.type-chip` dans le rendu.

- [ ] **Step 3: Modifier `SpeciesSheet.vue`**

Ajouter l'import après celui de `sprites.js` :

```js
import SPECIES_INFO from '../../shared/species-info.json'
```

Ajouter après `const seen = ...` :

```js
const info = computed(() => SPECIES_INFO[props.id] ?? null)
```

Dans le template, ajouter les pastilles **après** la puce chromatique de `.panel-top` :

```vue
          <span v-if="shiny" class="chip shiny-chip" style="margin-left:6px">✦ Chromatique</span>
          <span
            v-for="t in (caught ? info?.types ?? [] : [])" :key="t.slug"
            class="type-chip" :style="{ '--type': `var(--type-${t.slug})` }"
          >{{ t.name }}</span>
```

- [ ] **Step 4: Ajouter le CSS**

Dans `src/styles.css`, ajouter dans `:root`, juste après la ligne `--t-l:#b8862b;` et son commentaire :

```css

    /* Teintes de type désaturées vers la palette parchemin : les couleurs standard
       (jaune Électrik, rose Fée) jureraient avec les ocres du reste de l'interface. */
    --type-normal:#8a8175;   --type-fire:#a8552f;     --type-water:#4f6f8a;
    --type-electric:#a8862b; --type-grass:#5c7a52;    --type-ice:#6f8a8a;
    --type-fighting:#8a4a3a; --type-poison:#6f5480;   --type-ground:#8a7550;
    --type-flying:#7a7f96;   --type-psychic:#96566a;  --type-bug:#75824a;
    --type-rock:#7d7256;     --type-ghost:#5f5570;    --type-dragon:#5b5a91;
    --type-dark:#544c46;     --type-steel:#7c8086;    --type-fairy:#9a6478;
```

Puis, juste après la règle `.chip.new-chip` (autour de la ligne 189) :

```css
  .type-chip{
    display:inline-block;margin-left:6px;
    font-family:var(--f-label);font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;
    padding:4px 9px;border:1px solid var(--type);color:var(--type);background:rgba(255,255,255,.25);
  }
```

- [ ] **Step 5: Lancer les tests pour les voir passer**

Run: `npx vitest run src/components/SpeciesSheet.test.js`
Expected: PASS.

- [ ] **Step 6: Vérifier le rendu**

Run: `npm run dev`, ouvrir `http://localhost:5173/?demo` et parcourir plusieurs fiches (Bulbizarre, Salamèche, Pikachu, Onix).
Expected: les pastilles s'alignent sur la même ligne que la puce de rareté, dans une teinte proche de celle du reste de la page — aucune n'attire l'œil plus que le nom.

- [ ] **Step 7: Commit**

```bash
git add src/components/SpeciesSheet.vue src/components/SpeciesSheet.test.js src/styles.css
git commit -m "feat: pastilles de type dans la fiche d'espèce"
```

---

### Task 11: Notice de Pokédex dans la fiche

**Files:**
- Modify: `src/components/SpeciesSheet.vue` (une section en fin de panneau)
- Modify: `src/styles.css` (une règle `.dexnote`)
- Test: `src/components/SpeciesSheet.test.js`

**Interfaces:**
- Consumes: le `computed` `info` (tâche 10).
- Produces: rien.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/components/SpeciesSheet.test.js` :

```js
describe('notice', () => {
  it('affiche le texte de Pokédex d’une espèce capturée', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    expect(w.find('.dexnote').text().length).toBeGreaterThan(10)
  })

  it('se tait sur une espèce jamais capturée', () => {
    expect(mountSheet({ id: 1, entries: null }).find('.dexnote').exists()).toBe(false)
  })

  it('est la dernière section du panneau', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], caughtIds: new Set([1]) })
    const sections = w.findAll('.sect')
    expect(sections[sections.length - 1].find('.dexnote').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/components/SpeciesSheet.test.js -t "notice"`
Expected: FAIL — aucune classe `.dexnote` dans le rendu.

- [ ] **Step 3: Ajouter la section**

Dans `src/components/SpeciesSheet.vue`, insérer **en dernière position** à l'intérieur de `<div class="panel">`, après la section « La réserve » et avant la fermeture `</div>` du panneau :

```vue
      <div v-if="caught && info" class="sect">
        <div class="eyebrow sect-h"><span>Notice</span></div>
        <blockquote class="dexnote">{{ info.text }}</blockquote>
      </div>
```

Placée en dernier, elle bénéficie de `.sect:last-child{border-bottom:0}` — aucune règle supplémentaire à écrire pour le trait du bas.

- [ ] **Step 4: Ajouter le CSS**

Dans `src/styles.css`, juste après la règle `.copies-count` :

```css
  .dexnote{
    font-family:var(--f-display);font-size:14px;font-style:italic;line-height:1.6;color:var(--ink-2);
    padding-left:14px;border-left:2px solid var(--rule);
  }
```

- [ ] **Step 5: Lancer la suite complète**

Run: `npm test`
Expected: PASS sur tous les fichiers.

- [ ] **Step 6: Vérifier le rendu final**

Run: `npm run dev`, ouvrir `http://localhost:5173/?demo` et faire défiler une fiche complète.
Expected, de haut en bas : sprite, numéro, nom, rareté + types — puis Lignée, Journal des captures, Bonbons, Notice. Une fiche non capturée ne montre que « Pas encore à la planche ».

- [ ] **Step 7: Commit**

```bash
git add src/components/SpeciesSheet.vue src/components/SpeciesSheet.test.js src/styles.css
git commit -m "feat: notice de Pokédex dans la fiche d'espèce"
```

---

## Vérification finale

- [ ] `npm test` — toute la suite au vert.
- [ ] `npm run build` — la construction passe (le JSON importé est bien résolu par Vite).
- [ ] Parcours manuel sur `http://localhost:5173/?demo` : la chaîne Espace complète (tâche 6, étape 4), une évolution de bout en bout, et une fiche d'espèce complète.
- [ ] `git log --oneline` — onze commits, un par tâche.
