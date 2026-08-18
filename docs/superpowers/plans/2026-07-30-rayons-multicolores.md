# Rayons rotatifs enrichis + rayons laser multicolores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le rituel d'ouverture de pli (`RitualOverlay.vue`) affiche plusieurs disques de rayons rotatifs superposés pour chaque palier (3 pour commun, 4 pour peu commun, 5 pour rare, 6 pour légendaire), les paliers rare/légendaire utilisant en plus une palette de 5 couleurs vives partagée au lieu de la couleur unique du palier.

**Architecture:** Remplacer les deux éléments statiques `.rays`/`.rays-alt` par une liste calculée `rayLayers` (computed Vue, dérivée du palier) rendue via `v-for` sur une unique classe CSS générique `.ray-layer`. Chaque couche porte sa couleur, son sens de rotation, son multiplicateur de vitesse, son pas de wedge et son facteur d'opacité, appliqués en style inline via des CSS custom properties consommées par une seule règle CSS partagée.

**Tech Stack:** Vue 3 (`<script setup>`, Composition API), CSS pur (`conic-gradient` + masque radial + `@keyframes`), Vitest + `@vue/test-utils` pour les tests.

## Global Constraints

- Palette de paliers existante (`--t-c`, `--t-u`, `--t-r`, `--t-l` dans `src/styles.css`) **inchangée**.
- `INTENSITY` (opacité/glow/flash/vitesse de base par palier dans `RitualOverlay.vue`) **inchangée**.
- Comportement `prefers-reduced-motion` existant (raccourcissement du `hold` à 150ms) **inchangé**.
- Nombre de couches de rayons par palier : commun=3, peu commun=4, rare=5, légendaire=6.
- Palette multicolore rare/légendaire (dans cet ordre, cyclique) : `#e63946` (rouge), `#457b9d` (bleu), `#f4d35e` (jaune), `#5c7a52` (vert), `#9b5de5` (violet).
- Commun/peu commun : toutes les couches gardent la couleur de palier existante (pas de multicolore).

---

## File Structure

- Modify: `shared/species.js` — ajoute la constante `RAY_PALETTE` (couleurs multicolores partagées rare/légendaire).
- Modify: `src/components/RitualOverlay.vue` — remplace le rendu statique `.rays`/`.rays-alt` par un `computed` `rayLayers` + `v-for`.
- Modify: `src/styles.css` — remplace les règles `.rays`/`.rays-alt` par une règle générique `.ray-layer` pilotée par CSS custom properties.
- Modify: `src/components/RitualOverlay.test.js` — remplace les assertions sur `.rays`/`.rays-alt` par des assertions sur `.ray-layer` (nombre de couches, couleurs).

---

### Task 1: Palette multicolore partagée

**Files:**
- Modify: `shared/species.js:124-126`

**Interfaces:**
- Produces: `RAY_PALETTE` — `string[]` de 5 couleurs hex, exporté, consommé par `RitualOverlay.vue` (Task 3).

- [ ] **Step 1: Ajouter la constante**

Dans `shared/species.js`, juste après la ligne `export const TIER_VAR = ...` (ligne 125), ajouter :

```js
// Rayons laser multicolores (rare/légendaire uniquement) — cycle fixe, partagé entre les deux paliers.
export const RAY_PALETTE = ['#e63946', '#457b9d', '#f4d35e', '#5c7a52', '#9b5de5']
```

- [ ] **Step 2: Vérifier qu'aucun test existant ne casse**

Run: `npm test -- shared`
Expected: PASS (aucun test ne couvre encore `RAY_PALETTE`, ce step vérifie juste l'absence de régression sur les tests existants de `shared/`).

- [ ] **Step 3: Commit**

```bash
git add shared/species.js
git commit -m "feat: ajoute la palette de rayons multicolores rare/légendaire"
```

---

### Task 2: Tests — nombre de couches et couleurs par palier

**Files:**
- Modify: `src/components/RitualOverlay.test.js:101-144` (bloc `describe('échelle d'intensité')`)

**Interfaces:**
- Consumes: rien de nouveau côté composant — ces tests décrivent le comportement attendu de `rayLayers`/`.ray-layer` avant qu'il existe (TDD, ils doivent d'abord échouer).

- [ ] **Step 1: Remplacer les deux tests `.rays` et le test `.rays-alt` par les tests ci-dessous**

Dans `src/components/RitualOverlay.test.js`, remplacer les trois tests suivants :
- `'affiche des rayons dès le palier commun'` (lignes 102-106)
- `'affiche des rayons dès le palier peu commun'` (lignes 108-112)
- `'ajoute un second rayon contre-rotatif pour rare et légendaire, pas pour peu commun'` (lignes 135-144)

par :

```js
  it('affiche le nombre de rayons attendu par palier', async () => {
    const layerCount = async (species) => {
      const w = mountRitual({ entry: entryOf({ species }) })
      await w.find('.packet').trigger('click')
      return w.findAll('.ray-layer').length
    }
    expect(await layerCount(19)).toBe(3)   // commun (Rattata)
    expect(await layerCount(20)).toBe(4)   // peu commun (Rattatac)
    expect(await layerCount(1)).toBe(5)    // rare (Bulbizarre)
    expect(await layerCount(144)).toBe(6)  // légendaire (Artikodin)
  })

  it('garde la couleur unique du palier pour commun et peu commun', async () => {
    const w = mountRitual({ entry: entryOf({ species: 20 }) }) // peu commun
    await w.find('.packet').trigger('click')
    const layers = w.findAll('.ray-layer')
    for (const layer of layers) {
      expect(layer.attributes('style')).toContain('--ray-color: var(--t-u)')
    }
  })

  it('cycle sur la palette multicolore pour rare et légendaire', async () => {
    const palette = ['#e63946', '#457b9d', '#f4d35e', '#5c7a52', '#9b5de5']
    const w = mountRitual({ entry: entryOf({ species: 144 }) }) // légendaire, 6 couches
    await w.find('.packet').trigger('click')
    const layers = w.findAll('.ray-layer')
    expect(layers).toHaveLength(6)
    layers.forEach((layer, i) => {
      expect(layer.attributes('style')).toContain(`--ray-color: ${palette[i % palette.length]}`)
    })
  })
```

- [ ] **Step 2: Run les tests et vérifier qu'ils échouent**

Run: `npm test -- RitualOverlay`
Expected: FAIL — `.ray-layer` n'existe pas encore, `w.findAll('.ray-layer').length` retourne `0` pour tous les cas (`Task 3` non commencée).

- [ ] **Step 3: Commit**

```bash
git add src/components/RitualOverlay.test.js
git commit -m "test: couches de rayons multiples et palette multicolore par palier"
```

---

### Task 3: `rayLayers` computed + template dans `RitualOverlay.vue`

**Files:**
- Modify: `src/components/RitualOverlay.vue:1-4` (imports)
- Modify: `src/components/RitualOverlay.vue:20-47` (ajout du computed, après `INTENSITY`)
- Modify: `src/components/RitualOverlay.vue:96-97` (template : remplace les deux `<div class="rays">`)

**Interfaces:**
- Consumes: `RAY_PALETTE` depuis `shared/species.js` (Task 1), `TIER_VAR` (déjà importé).
- Produces: `rayLayers` (computed, `{ key, color, direction, speedMultiplier, wedgeDeg, opacityFactor }[]`) et `rayLayerStyle(layer)` (fonction, retourne un objet de style inline) — consommés uniquement par le template de ce composant, aucune autre tâche n'en dépend.

- [ ] **Step 1: Étendre l'import depuis `shared/species.js`**

Ligne 3, remplacer :
```js
import { DEX, TIER_LABEL, TIER_VAR, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
```
par :
```js
import { DEX, TIER_LABEL, TIER_VAR, RAY_PALETTE, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
```

- [ ] **Step 2: Ajouter la constante de comptage et le computed `rayLayers`**

Juste après le bloc `INTENSITY` (après la ligne `}` qui ferme `INTENSITY`, avant `const stage = ref('sealed')`), insérer :

```js
const RAY_LAYER_COUNT = { c: 3, u: 4, r: 5, l: 6 }
const MULTICOLOR_TIERS = new Set(['r', 'l'])
// Vitesses et pas de wedge décorrélés de l'index pour éviter que les couches se superposent
// à l'identique (lisible comme "un seul disque plus épais" plutôt que plusieurs rayons).
const SPEED_MULTIPLIERS = [1, 0.8, 1.3, 0.65, 1.15, 0.9]

const rayLayers = computed(() => {
  const count = RAY_LAYER_COUNT[tier.value]
  const multicolor = MULTICOLOR_TIERS.has(tier.value)
  const baseColor = TIER_VAR[tier.value]
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    color: multicolor ? RAY_PALETTE[i % RAY_PALETTE.length] : baseColor,
    direction: i % 2 === 0 ? 'normal' : 'reverse',
    speedMultiplier: SPEED_MULTIPLIERS[i % SPEED_MULTIPLIERS.length],
    wedgeDeg: Math.max(20 - i * 2.5, 6),
    opacityFactor: Math.max(1 - i * 0.12, 0.4),
  }))
})

function rayLayerStyle(layer) {
  return {
    '--ray-color': layer.color,
    '--ray-wedge': layer.wedgeDeg + 'deg',
    '--ray-opacity-factor': layer.opacityFactor,
    animationDuration: `calc(var(--rayspeed) * ${layer.speedMultiplier}), .8s`,
    animationDirection: `${layer.direction}, normal`,
  }
}
```

- [ ] **Step 3: Remplacer le template des rayons**

Ligne 96-97, remplacer :
```html
        <div class="rays"></div>
        <div v-if="tier === 'r' || tier === 'l'" class="rays rays-alt"></div>
```
par :
```html
        <div
          v-for="layer in rayLayers" :key="layer.key" class="ray-layer"
          :style="rayLayerStyle(layer)"
        ></div>
```

- [ ] **Step 4: Run les tests du composant**

Run: `npm test -- RitualOverlay`
Expected: PASS sur les 3 nouveaux tests de la Task 2 — ils vérifient le nombre de `.ray-layer` rendus et l'attribut `style` inline (`--ray-color: ...`), tous deux posés par le template/`rayLayerStyle` de cette tâche ; ils ne dépendent pas de la règle CSS `.ray-layer` elle-même (Task 4). Le reste de la suite (`RitualOverlay.test.js`) doit rester au vert.

- [ ] **Step 5: Commit**

```bash
git add src/components/RitualOverlay.vue
git commit -m "feat: rayLayers computed pilote le nombre et la couleur des rayons par palier"
```

---

### Task 4: CSS générique `.ray-layer`

**Files:**
- Modify: `src/styles.css:268-278`

**Interfaces:**
- Consumes: `--ray-color`, `--ray-wedge`, `--ray-opacity-factor` (posés en style inline par `rayLayerStyle`, Task 3), `--rayop`/`--rayspeed` (déjà posés sur `.ritual` par le `style` computed existant).

- [ ] **Step 1: Remplacer les règles `.rays`/`.rays-alt` et leurs keyframes dédiés**

Dans `src/styles.css`, remplacer les lignes 268-278 :
```css
  .rays{position:absolute;width:920px;height:920px;pointer-events:none;
    background:conic-gradient(from 0deg, var(--tier) 0deg 2.5deg, transparent 2.5deg 20deg);
    opacity:0;mask-image:radial-gradient(circle,#000 0%,transparent 60%);-webkit-mask-image:radial-gradient(circle,#000 0%,transparent 60%);
    animation:raysSpin var(--rayspeed) linear infinite, raysIn .8s ease-out forwards}
  .rays-alt{width:760px;height:760px;
    background:conic-gradient(from 0deg, var(--tier) 0deg 1deg, transparent 1deg 9deg);
    animation:raysSpinRev calc(var(--rayspeed) * .6) linear infinite, raysInAlt .8s ease-out forwards}
  @keyframes raysSpin{to{transform:rotate(360deg)}}
  @keyframes raysSpinRev{to{transform:rotate(-360deg)}}
  @keyframes raysIn{to{opacity:var(--rayop)}}
  @keyframes raysInAlt{to{opacity:calc(var(--rayop) * .55)}}
```
par :
```css
  .ray-layer{position:absolute;width:920px;height:920px;pointer-events:none;
    background:conic-gradient(from 0deg, var(--ray-color) 0deg calc(var(--ray-wedge) * .125), transparent calc(var(--ray-wedge) * .125) var(--ray-wedge));
    opacity:0;mask-image:radial-gradient(circle,#000 0%,transparent 60%);-webkit-mask-image:radial-gradient(circle,#000 0%,transparent 60%);
    animation:raysSpin var(--rayspeed) linear infinite, raysIn .8s ease-out forwards}
  @keyframes raysSpin{to{transform:rotate(360deg)}}
  @keyframes raysIn{to{opacity:calc(var(--rayop) * var(--ray-opacity-factor))}}
```

Note : `animation-duration` et `animation-direction` sont fixés par couche via le style inline posé par `rayLayerStyle` (Task 3) — la règle CSS ne pose que les valeurs par défaut/noms d'animation.

- [ ] **Step 2: Run tous les tests du composant**

Run: `npm test -- RitualOverlay`
Expected: PASS — les 3 tests de la Task 2 passent désormais, et l'ensemble des tests déjà existants dans `RitualOverlay.test.js` (halo, particules, chromatique, etc.) restent au vert.

- [ ] **Step 3: Run la suite complète**

Run: `npm test`
Expected: PASS — aucune régression ailleurs dans le projet.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "style: .ray-layer générique remplace .rays/.rays-alt pour les rayons rotatifs"
```

---

## Self-Review Notes

- **Couverture spec** : nombre de couches par palier (§2 spec) → Task 3 (`RAY_LAYER_COUNT`) + Task 2 (tests). Couleur palette multicolore (§3 spec) → Task 1 (`RAY_PALETTE`) + Task 3 (`rayLayers`) + Task 2 (tests). Rotation alternée + vitesse désynchronisée (§4 spec) → Task 3 (`direction`, `speedMultiplier`). Hors périmètre (`INTENSITY`, `prefers-reduced-motion`, palette de paliers) → non touchés par aucune tâche, vérifié par la suite complète en Task 4 Step 3.
- **Cohérence des types** : `rayLayers` produit des objets `{ key, color, direction, speedMultiplier, wedgeDeg, opacityFactor }` (Task 3) — consommés uniquement par `rayLayerStyle` dans la même tâche/le même fichier, pas de dérive de nom entre tâches.
- **Tests obsolètes** : les deux anciens tests `.rays`/`.rays-alt` sont supprimés en Task 2 (remplacés), pas laissés en doublon.
