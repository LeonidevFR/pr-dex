# La carte et son rituel — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le sprite flottant du rituel par une carte que l'on incline, que l'on retourne soi-même sur sa provenance, et dont le carton dit la rareté — la même carte se retrouvant ensuite dans la fiche d'espèce.

**Architecture:** Un composant `PokeCard.vue` autonome (aucun accès au store ni au réseau) porte la carte : deux faces, un palier, une scène d'éclairage. `RitualOverlay.vue` l'orchestre dans une machine à états étendue (`sealed → cutting → tearing → awaiting → revealed`), `SpeciesSheet.vue` l'affiche en scène « jour ». Tous les styles vont dans `src/styles.css` — aucun composant du projet n'a de bloc `<style>`.

**Tech Stack:** Vue 3 (Composition API, SFC), Vitest + @vue/test-utils, JavaScript ESM. Aucune dépendance nouvelle.

## Global Constraints

- **Spec de référence :** `docs/superpowers/specs/2026-08-11-carte-rituel-design.md`. Les valeurs numériques y sont figées ; ne pas les réinventer.
- **Français** partout : noms de tests, commentaires, messages de commit, textes d'interface.
- **Pas de TypeScript**, pas de bloc `<style>` dans les SFC, pas de dépendance ajoutée.
- **Commentaires** : expliquer le *pourquoi*, jamais le *quoi*. Le projet en a un usage dense et argumenté — s'y conformer.
- **`prefers-reduced-motion`** doit être honoré par chaque animation ajoutée, sans exception.
- **Chaque tâche finit sur `npm test` au vert** et un commit.
- **Ne jamais utiliser `Math.random()`** dans le rendu : deux tirages identiques doivent produire le même visuel.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/components/PokeCard.vue` | **créé** — la carte seule : deux faces, palier, scène, inclinaison, retournement |
| `src/components/PokeCard.test.js` | **créé** — paliers, dos, inclinaison, mouvement réduit |
| `src/components/RitualOverlay.vue` | **modifié** — machine à états, entaille, fanfare, correctif des rayons |
| `src/components/RitualOverlay.test.js` | **modifié** — migration des 36 tests couplés à `silhouette` |
| `src/components/SpeciesSheet.vue` | **modifié** — `.panel-art` remplacé par la carte |
| `src/components/SpeciesSheet.test.js` | **modifié** — les assertions sur `.panel-art` suivent |
| `src/styles.css` | **modifié** — styles de la carte, de la découpe, de la fanfare |

---

### Task 1: Correctif d'accessibilité — la vitesse des rayons

Tâche indépendante et livrable seule : c'est un défaut déjà en production, sans rapport avec la carte.

**Files:**
- Modify: `src/components/RitualOverlay.vue:20-25`
- Test: `src/components/RitualOverlay.test.js`

**Interfaces:**
- Consumes: rien.
- Produces: table `INTENSITY` aux vitesses corrigées — consommée telle quelle par la Task 5.

- [ ] **Step 1: Écrire le test qui échoue**

À ajouter à la fin de `src/components/RitualOverlay.test.js` :

```js
describe('vitesse des rayons', () => {
  // Un rare tournait en 3,2 s et un légendaire en 1,8 s : c'est stroboscopique, et le rituel
  // se rejoue ~300 fois par an. L'intensité passe par l'opacité et le halo, jamais par la vitesse.
  it('ne descend jamais sous dix secondes par tour, quel que soit le palier', async () => {
    for (const species of [16, 25, 6, 151]) {
      const w = mountRitual({ entry: entryOf({ species }) })
      await w.find('.packet').trigger('click')
      await vi.advanceTimersByTimeAsync(1200)
      const vitesse = w.find('.ritual').attributes('style')
      const secondes = Number(/--rayspeed:\s*([\d.]+)s/.exec(vitesse)[1])
      expect(secondes).toBeGreaterThanOrEqual(10)
    }
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run src/components/RitualOverlay.test.js -t "dix secondes"`
Expected: FAIL — `expected 1.8 to be greater than or equal to 10`

- [ ] **Step 3: Corriger la table**

Dans `src/components/RitualOverlay.vue`, remplacer les quatre `rayspeed` :

```js
const INTENSITY = {
  c: { rayop: 0.10, glow: '8px', flashscale: 2.4, rayspeed: '26s' },
  u: { rayop: 0.18, glow: '16px', flashscale: 3.2, rayspeed: '22s' },
  r: { rayop: 0.42, glow: '38px', flashscale: 5.2, rayspeed: '18s' },
  l: { rayop: 0.65, glow: '66px', flashscale: 7.5, rayspeed: '14s' },
}
```

Et mettre à jour le commentaire de bloc au-dessus, qui parle d'« intensité » : ajouter une phrase disant que la vitesse ne fait pas partie des leviers d'intensité, précisément parce qu'elle fatigue.

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: 347 tests passent.

- [ ] **Step 5: Commit**

```bash
git add src/components/RitualOverlay.vue src/components/RitualOverlay.test.js
git commit -m "fix(rituel): des rayons qui ne clignotent plus"
```

---

### Task 2: PokeCard — la face avant et ses quatre paliers

**Files:**
- Create: `src/components/PokeCard.vue`
- Create: `src/components/PokeCard.test.js`
- Modify: `src/styles.css` (nouvelle section « carte », à placer avant la section « rituel »)

**Interfaces:**
- Consumes: `spriteUrl(id, shiny)` de `src/lib/sprites.js` ; `DEX`, `TIER_LABEL`, `TIER_VAR` de `shared/species.js`.
- Produces: le composant `PokeCard` avec les props `speciesId: Number`, `tier: String`, `shiny: Boolean`, `scene: 'night'|'day'`, et la racine `.pkc` portant `data-tier`. Les Tasks 3 à 8 s'appuient sur ces noms.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/components/PokeCard.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PokeCard from './PokeCard.vue'

const mountCard = (props = {}) =>
  mount(PokeCard, { props: { speciesId: 25, tier: 'u', ...props } })

describe('face avant', () => {
  it('porte le numéro de planche, le nom et le palier de l’espèce', () => {
    const w = mountCard({ speciesId: 6, tier: 'r' })
    expect(w.find('.pkc-no').text()).toContain('006')
    expect(w.find('.pkc-name').text()).toBe('Dracaufeu')
    expect(w.find('.pkc-tier').text()).toBe('Rare')
  })

  // Le palier se lit dans la matière du carton : c'est un attribut, pas une classe utilitaire,
  // pour que le CSS puisse en dériver fond, filet et balayage d'un seul sélecteur.
  it('expose son palier au CSS', () => {
    for (const tier of ['c', 'u', 'r', 'l']) {
      expect(mountCard({ tier }).find('.pkc').attributes('data-tier')).toBe(tier)
    }
  })

  it('marque le chromatique, et lui seul', () => {
    expect(mountCard({ shiny: true }).find('.pkc').classes()).toContain('is-shiny')
    expect(mountCard({ shiny: false }).find('.pkc').classes()).not.toContain('is-shiny')
  })

  it('tire le sprite chromatique quand l’exemplaire l’est', () => {
    const normal = mountCard({ speciesId: 25, shiny: false }).find('.pkc-art img').attributes('src')
    const chromatique = mountCard({ speciesId: 25, shiny: true }).find('.pkc-art img').attributes('src')
    expect(normal).not.toContain('/shiny/')
    expect(chromatique).toContain('/shiny/')
  })

  // La scène est l'éclairage, pas la matière : la carte est la même au tirage et au tiroir.
  it('porte la scène demandée, et le tiroir par défaut', () => {
    expect(mountCard().find('.pkc').classes()).toContain('scene-day')
    expect(mountCard({ scene: 'night' }).find('.pkc').classes()).toContain('scene-night')
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/components/PokeCard.test.js`
Expected: FAIL — `Failed to resolve import "./PokeCard.vue"`

- [ ] **Step 3: Écrire le composant**

Créer `src/components/PokeCard.vue` :

```vue
<script setup>
import { computed } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  speciesId: { type: Number, required: true },
  tier: { type: String, required: true },
  shiny: { type: Boolean, default: false },
  // L'éclairage, pas la matière. Une carte qui changerait d'identité entre l'écran où on la
  // gagne et celui où on la retrouve ne se posséderait pas.
  scene: { type: String, default: 'day' },
})

const species = computed(() => DEX[props.speciesId])
const pad = (n) => String(n).padStart(3, '0')
</script>

<template>
  <div
    class="pkc" :class="[`scene-${scene}`, { 'is-shiny': shiny }]"
    :data-tier="tier" :style="{ '--tier': TIER_VAR[tier] }"
  >
    <div class="pkc-face pkc-front">
      <div class="pkc-bg"></div>
      <div class="pkc-frame"></div>
      <span class="pkc-corner tl"></span><span class="pkc-corner tr"></span>
      <span class="pkc-corner bl"></span><span class="pkc-corner br"></span>
      <div class="pkc-top">
        <span class="pkc-no mono">Nº {{ pad(speciesId) }}</span>
      </div>
      <div class="pkc-art">
        <img :src="spriteUrl(speciesId, shiny)" :alt="species.name" @error="$event.target.dataset.broken = '1'">
      </div>
      <span v-if="tier === 'r' || tier === 'l'" class="pkc-wax">PR</span>
      <div class="pkc-sheen"></div>
      <div class="pkc-rule"></div>
      <div class="pkc-bot">
        <span class="pkc-name">{{ species.name }}{{ shiny ? ' ✦' : '' }}</span>
        <span class="pkc-tier">{{ TIER_LABEL[tier] }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Écrire les styles**

Ajouter dans `src/styles.css`, juste avant le commentaire `/* ───────── rituel ───────── */` :

```css
  /* ───────── carte ─────────
     Une seule matière pour les deux surfaces ; `scene-night` ne change que l'éclairage.
     Le palier se lit dans le carton (teinte) et dans ce que la lumière trouve à accrocher. */
  .pkc{position:relative;width:266px;height:372px}
  .pkc-face{position:absolute;inset:0;overflow:hidden;display:flex;flex-direction:column;
    background:linear-gradient(168deg,var(--plate-hi),var(--plate) 40%,var(--paper-lo));
    border:1px solid var(--rule-hi);
    box-shadow:0 12px 30px rgba(64,50,30,.26),inset 0 0 0 4px rgba(255,255,255,.34)}
  .pkc.scene-night .pkc-face{box-shadow:0 0 var(--pkc-halo,14px) rgba(255,214,140,.55),0 18px 40px rgba(0,0,0,.6),inset 0 0 0 4px rgba(255,255,255,.28)}
  .pkc-bg,.pkc-frame,.pkc-sheen{position:absolute;inset:0;pointer-events:none}
  .pkc-corner{position:absolute;width:16px;height:16px;border:1px solid transparent;opacity:0;z-index:3;pointer-events:none}
  .pkc-corner.tl{top:13px;left:13px;border-right:0;border-bottom:0}
  .pkc-corner.tr{top:13px;right:13px;border-left:0;border-bottom:0}
  .pkc-corner.bl{bottom:13px;left:13px;border-right:0;border-top:0}
  .pkc-corner.br{bottom:13px;right:13px;border-left:0;border-top:0}
  .pkc-top{display:flex;justify-content:space-between;padding:13px 15px 0;position:relative;z-index:4}
  .pkc-no{font-family:var(--f-data);font-size:10px;letter-spacing:.04em;color:var(--ink)}
  .pkc-art{flex:1;display:grid;place-items:center;position:relative;z-index:4}
  .pkc-art img{width:140px;height:140px;object-fit:contain}
  .pkc.scene-night .pkc-art img{filter:drop-shadow(0 0 var(--pkc-halo,10px) rgba(255,222,160,.5))}
  .pkc-rule{height:1px;margin:0 15px;position:relative;z-index:4;opacity:.55;
    background:linear-gradient(90deg,transparent,var(--tier),transparent)}
  .pkc-bot{padding:10px 15px 14px;display:flex;flex-direction:column;gap:5px;position:relative;z-index:4}
  .pkc-name{font-family:var(--f-display);font-size:20px;font-weight:600;line-height:1;color:var(--ink)}
  .pkc-tier{font-family:var(--f-label);font-size:8.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--tier)}
  .pkc-wax{position:absolute;right:17px;bottom:52px;width:34px;height:34px;border-radius:50%;z-index:4;
    background:radial-gradient(circle at 36% 32%,#c0503f,#8e3025 62%,#6d2119);
    box-shadow:0 1px 3px rgba(60,20,12,.5),inset 0 -2px 4px rgba(0,0,0,.3);
    display:grid;place-items:center;transform:rotate(-8deg);
    font-family:var(--f-display);font-size:9px;font-weight:600;color:rgba(255,230,215,.85)}

  /* le halo de scène nocturne croît avec le palier */
  .pkc[data-tier="c"]{--pkc-halo:8px}
  .pkc[data-tier="u"]{--pkc-halo:14px}
  .pkc[data-tier="r"]{--pkc-halo:34px}
  .pkc[data-tier="l"]{--pkc-halo:60px}

  /* commun — papier pâle, aucun métal */
  .pkc[data-tier="c"] .pkc-frame{inset:9px;border:1px solid var(--t-c);opacity:.4}
  .pkc[data-tier="c"] .pkc-sheen{z-index:5;mix-blend-mode:soft-light;opacity:calc(.3 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 34%,rgba(120,104,78,.1) 44%,rgba(255,255,255,.5) 50%,rgba(120,104,78,.08) 56%,transparent 66%);
    background-size:340% 100%;background-position:calc((1 - var(--px,.5))*100%) 0}

  /* peu commun — trame pointillée, filet vert double */
  .pkc[data-tier="u"] .pkc-bg{z-index:1;opacity:.55;
    background-image:radial-gradient(circle at 50% 50%,rgba(92,110,80,.42) .9px,transparent 1.4px),
                     radial-gradient(circle at 50% 50%,rgba(108,94,70,.28) .7px,transparent 1.2px);
    background-size:7px 7px,7px 7px;background-position:0 0,3.5px 3.5px;
    -webkit-mask-image:radial-gradient(ellipse 66% 54% at 50% 45%,#000 22%,transparent 80%);
    mask-image:radial-gradient(ellipse 66% 54% at 50% 45%,#000 22%,transparent 80%)}
  .pkc[data-tier="u"] .pkc-frame{inset:9px;border:1px solid var(--t-u);opacity:.62;
    box-shadow:inset 0 0 0 3px rgba(255,255,255,.5),inset 0 0 0 4px rgba(92,122,82,.3)}
  .pkc[data-tier="u"] .pkc-sheen{z-index:5;mix-blend-mode:soft-light;opacity:calc(.42 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 34%,rgba(96,92,84,.14) 44%,rgba(255,255,255,.62) 49.4%,rgba(226,230,222,.6) 50%,rgba(255,255,255,.5) 50.8%,rgba(96,92,84,.1) 57%,transparent 67%);
    background-size:340% 100%;background-position:calc((1 - var(--px,.5))*100%) 0}

  /* rare — le carton lui-même vire à l'ocre ; aucun motif, c'est la matière qui parle */
  .pkc[data-tier="r"] .pkc-face{background:linear-gradient(168deg,#f4e6c4,#ecd9ad 45%,#dfc890);border-color:#a8813f}
  .pkc[data-tier="r"] .pkc-frame{inset:9px;border:1px solid rgba(184,134,43,.8);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.5),0 0 0 1px rgba(120,90,30,.14)}
  .pkc[data-tier="r"] .pkc-corner{border-color:rgba(184,134,43,.85);opacity:.9}
  .pkc[data-tier="r"] .pkc-sheen{z-index:5;mix-blend-mode:soft-light;opacity:calc(.5 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 32%,rgba(112,84,34,.2) 42%,rgba(255,246,222,.62) 48.6%,rgba(226,190,120,.7) 50%,rgba(255,246,222,.45) 51.6%,rgba(112,84,34,.14) 59%,transparent 68%);
    background-size:340% 100%;background-position:calc((1 - var(--px,.5))*100%) 0}

  /* légendaire — carton profond et guilloché plein */
  .pkc[data-tier="l"] .pkc-face{background:linear-gradient(168deg,#fbf0d2,#f2e2b4 45%,#e4d09b);border-color:#a8813f}
  .pkc[data-tier="l"] .pkc-bg{z-index:1;opacity:.42;
    background-image:repeating-conic-gradient(from 0deg at 50% 46%,rgba(184,134,43,.3) 0 2deg,transparent 2deg 8deg),
                     radial-gradient(circle at 50% 46%,rgba(255,240,205,.7),transparent 62%)}
  .pkc[data-tier="l"] .pkc-frame{inset:9px;border:1.5px solid rgba(184,134,43,.85);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.65),inset 0 0 0 4px rgba(184,134,43,.22),0 0 0 1px rgba(120,90,30,.18)}
  .pkc[data-tier="l"] .pkc-corner{border-color:rgba(184,134,43,.9);border-width:1.5px;opacity:1;width:22px;height:22px}
  .pkc[data-tier="l"] .pkc-sheen{z-index:5;mix-blend-mode:soft-light;opacity:calc(.62 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 31%,rgba(112,84,34,.22) 41%,rgba(255,248,228,.68) 48.2%,rgba(232,196,124,.8) 50%,rgba(255,248,228,.5) 52%,rgba(112,84,34,.16) 60%,transparent 69%),
                     linear-gradient(102deg,transparent 64%,rgba(255,240,198,.3) 68%,transparent 73%);
    background-size:340% 100%,340% 100%;
    background-position:calc((1 - var(--px,.5))*100%) 0,calc((1 - var(--px,.5))*100%) 0}

  /* la scène nocturne pousse la dorure ; la matière, elle, ne bouge pas */
  .pkc.scene-night[data-tier="c"]{--pkc-light:1.5}
  .pkc.scene-night[data-tier="u"]{--pkc-light:1.6}
  .pkc.scene-night[data-tier="r"]{--pkc-light:1.75}
  .pkc.scene-night[data-tier="l"]{--pkc-light:1.9}

  /* irisation — réservée au chromatique, quel que soit le palier */
  .pkc-iris{position:absolute;inset:0;pointer-events:none;z-index:6;mix-blend-mode:color-burn;opacity:0;
    background-image:repeating-linear-gradient(112deg,#d94f6a 0%,#d99a3f 9%,#3fbf95 18%,#4a86d9 27%,#8f5bc4 36%,#d94f6a 45%);
    background-size:300% 300%;
    background-position:calc(var(--px,.5)*100%) calc(var(--py,.5)*100%)}
  .pkc.is-shiny .pkc-iris{opacity:calc(.3 * var(--pkc-iris,1))}
  .pkc.scene-night.is-shiny{--pkc-iris:1.5}
```

Ajouter aussi `<div class="pkc-iris"></div>` dans le template, juste après `.pkc-sheen`.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run src/components/PokeCard.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/PokeCard.vue src/components/PokeCard.test.js src/styles.css
git commit -m "feat(carte): la face avant, et la rareté qui se lit dans le carton"
```

---

### Task 3: PokeCard — le dos et sa provenance

**Files:**
- Modify: `src/components/PokeCard.vue`
- Modify: `src/components/PokeCard.test.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: le composant de la Task 2.
- Produces: la prop `provenance: Object|null` de forme `{ ref: String|null, label: String, date: String }`, et la face `.pkc-back`. La Task 6 la remplit depuis `entry`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/components/PokeCard.test.js` :

```js
const provenance = {
  ref: 'moi/atlas#142 · a3f8c21',
  label: 'fix: race condition sur la file de synchronisation',
  date: '2026-02-03',
}

describe('dos', () => {
  it('porte la provenance de l’exemplaire', () => {
    const w = mountCard({ provenance })
    expect(w.find('.pkc-back').text()).toContain('moi/atlas#142')
    expect(w.find('.pkc-lab-title').text()).toBe('fix: race condition sur la file de synchronisation')
    expect(w.find('.pkc-back').text()).toContain('2026-02-03')
  })

  // Une source peut n'avoir aucune référence courte à donner — le pli scellé gère déjà ce cas.
  it('se passe de la ligne de référence quand la source n’en fournit pas', () => {
    const w = mountCard({ provenance: { ...provenance, ref: null } })
    expect(w.find('.pkc-lab-ref').exists()).toBe(false)
    expect(w.find('.pkc-lab-title').exists()).toBe(true)
  })

  // La fiche d'espèce affiche la carte sans dos : on y consulte une espèce, pas un exemplaire.
  it('n’a pas de dos quand aucune provenance n’est donnée', () => {
    expect(mountCard().find('.pkc-back').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/components/PokeCard.test.js -t "dos"`
Expected: FAIL — `.pkc-back` introuvable

- [ ] **Step 3: Implémenter le dos**

Dans `src/components/PokeCard.vue`, ajouter la prop :

```js
  // Absente sur la fiche d'espèce : on y consulte une espèce, pas un exemplaire daté.
  provenance: { type: Object, default: null },
```

Et la face, après `.pkc-front` :

```vue
    <div v-if="provenance" class="pkc-face pkc-back">
      <div class="pkc-back-head">
        <span class="pkc-mark">PR·DEX</span><span class="pkc-torn">ouvert</span>
      </div>
      <div class="pkc-lab">
        <span class="pkc-lab-eyebrow">Provenance</span>
        <span v-if="provenance.ref" class="pkc-lab-ref mono">{{ provenance.ref }}</span>
        <span class="pkc-lab-title">{{ provenance.label }}</span>
        <span class="pkc-lab-date mono">{{ provenance.date }}</span>
      </div>
      <span class="pkc-back-foot">Une PR mergée · un tirage</span>
    </div>
```

- [ ] **Step 4: Écrire les styles du dos**

Ajouter dans `src/styles.css`, à la suite de la section carte :

```css
  /* le dos, c'est le sachet ouvert : sa trame, et une étiquette de spécimen collée dessus */
  .pkc-back{
    background-color:var(--paper-lo);
    background-image:
      repeating-linear-gradient(45deg,rgba(158,59,46,.055) 0 7px,transparent 7px 14px),
      repeating-linear-gradient(90deg,rgba(110,88,58,.05) 0 1px,transparent 1px 5px),
      radial-gradient(ellipse 80% 60% at 50% 30%,rgba(255,252,244,.35),transparent 72%),
      linear-gradient(168deg,var(--paper),var(--paper-lo));
    padding:20px 18px;justify-content:space-between;
    transform:rotateY(180deg);backface-visibility:hidden;
  }
  .pkc-front{backface-visibility:hidden}
  .pkc-back-head{display:flex;justify-content:space-between;align-items:flex-start}
  .pkc-mark{font-family:var(--f-display);font-size:12px;font-weight:600;letter-spacing:.16em;color:var(--stamp)}
  .pkc-torn{font-family:var(--f-label);font-size:8px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-3)}
  .pkc-lab{background:rgba(251,246,232,.86);border:1px solid var(--rule);padding:13px;
    display:flex;flex-direction:column;gap:7px;box-shadow:0 2px 0 rgba(120,96,64,.1)}
  .pkc-lab-eyebrow{font-family:var(--f-label);font-size:8px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)}
  .pkc-lab-ref{font-size:10px;color:var(--ink-2);word-break:break-all}
  /* Un titre de PR peut dépasser 90 caractères : il est tronqué, jamais laissé déborder. */
  .pkc-lab-title{font-family:var(--f-display);font-size:12.5px;line-height:1.35;color:var(--ink);
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .pkc-lab-date{font-size:9px;color:var(--ink-3);padding-top:2px;border-top:1px solid var(--rule)}
  .pkc-back-foot{font-family:var(--f-label);font-size:8px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3);text-align:center}
```

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run src/components/PokeCard.test.js`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/PokeCard.vue src/components/PokeCard.test.js src/styles.css
git commit -m "feat(carte): un dos qui dit d'où vient l'exemplaire"
```

---

### Task 4: PokeCard — l'inclinaison et le retournement

**Files:**
- Modify: `src/components/PokeCard.vue`
- Modify: `src/components/PokeCard.test.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: le composant des Tasks 2 et 3.
- Produces: les props `flipped: Boolean` et `tiltable: Boolean` (défaut `true`), l'événement `flip` émis au clic, et les variables CSS `--px`, `--py`, `--rx`, `--ry` posées sur `.pkc`. La Task 6 écoute `flip`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/components/PokeCard.test.js` :

```js
describe('inclinaison et retournement', () => {
  it('montre le dos quand on le lui demande', () => {
    const w = mountCard({ provenance, flipped: true })
    expect(w.find('.pkc').classes()).toContain('is-flipped')
  })

  it('émet « flip » au clic, sans se retourner de sa propre initiative', async () => {
    const w = mountCard({ provenance })
    await w.find('.pkc').trigger('click')
    expect(w.emitted('flip')).toHaveLength(1)
    expect(w.find('.pkc').classes()).not.toContain('is-flipped')
  })

  // L'inclinaison suit le pointeur : la position sert au relief ET au déplacement du balayage.
  it('traduit la position du pointeur en inclinaison', async () => {
    const w = mountCard()
    const pkc = w.find('.pkc')
    pkc.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 })
    await pkc.trigger('pointermove', { clientX: 200, clientY: 0 })
    const style = pkc.attributes('style')
    expect(style).toContain('--px: 1')
    expect(style).toContain('--py: 0')
    expect(style).toContain('--ry: 14deg')   // (1 - .5) * 28
    expect(style).toContain('--rx: 12deg')   // (.5 - 0) * 24
  })

  it('revient à plat quand le pointeur s’en va', async () => {
    const w = mountCard()
    const pkc = w.find('.pkc')
    pkc.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 })
    await pkc.trigger('pointermove', { clientX: 200, clientY: 0 })
    await pkc.trigger('pointerleave')
    expect(pkc.attributes('style')).toContain('--rx: 0deg')
    expect(pkc.attributes('style')).toContain('--ry: 0deg')
  })

  // Sur mobile il n'y a pas de survol : la carte doit rester entière sans l'inclinaison.
  it('ignore le pointeur quand l’inclinaison est désactivée', async () => {
    const w = mountCard({ tiltable: false })
    const pkc = w.find('.pkc')
    pkc.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 })
    await pkc.trigger('pointermove', { clientX: 200, clientY: 0 })
    expect(pkc.attributes('style') ?? '').not.toContain('--rx')
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/components/PokeCard.test.js -t "inclinaison"`
Expected: FAIL — aucun événement `flip`, aucune variable `--rx`

- [ ] **Step 3: Implémenter**

Dans `src/components/PokeCard.vue`, ajouter aux props :

```js
  flipped: { type: Boolean, default: false },
  // Sur mobile il n'y a pas de survol. L'inclinaison est un bonus de bureau : la carte doit
  // rester complète sans elle, et on ne demande pas de permission `devicemotion` pour un décor.
  tiltable: { type: Boolean, default: true },
```

Puis l'état et les gestionnaires :

```js
const emit = defineEmits(['flip'])

const tilt = ref(null)   // { px, py, rx, ry } ou null quand la carte est à plat

const style = computed(() => ({
  '--tier': TIER_VAR[props.tier],
  ...(tilt.value
    ? {
        '--px': tilt.value.px, '--py': tilt.value.py,
        '--rx': tilt.value.rx + 'deg', '--ry': tilt.value.ry + 'deg',
      }
    : {}),
}))

const clamp = (v) => Math.min(Math.max(v, 0), 1)

function onMove(e) {
  if (!props.tiltable) return
  const r = e.currentTarget.getBoundingClientRect()
  const px = clamp((e.clientX - r.left) / r.width)
  const py = clamp((e.clientY - r.top) / r.height)
  tilt.value = {
    px: Number(px.toFixed(3)), py: Number(py.toFixed(3)),
    rx: Number(((0.5 - py) * 24).toFixed(2)),
    ry: Number(((px - 0.5) * 28).toFixed(2)),
  }
}

function onLeave() {
  if (!props.tiltable) return
  tilt.value = { px: 0.5, py: 0.5, rx: 0, ry: 0 }
}
```

Et sur la racine du template :

```vue
  <div
    class="pkc" :class="[`scene-${scene}`, { 'is-shiny': shiny, 'is-flipped': flipped, 'is-live': tilt }]"
    :data-tier="tier" :style="style"
    @pointermove="onMove" @pointerleave="onLeave" @click="emit('flip')"
  >
```

Ajouter `import { computed, ref } from 'vue'`.

- [ ] **Step 4: Écrire les styles**

Ajouter dans `src/styles.css` :

```css
  /* L'inclinaison est une manipulation directe, pas une animation : elle suit le pointeur
     au trait près (transition courte), là où le retournement, lui, est une transition longue. */
  .pkc{transform-style:preserve-3d;cursor:pointer;
    transform:rotateX(var(--rx,0deg)) rotateY(calc(var(--ry,0deg) + var(--pkc-flip,0deg)));
    transition:transform .62s cubic-bezier(.2,.8,.2,1)}
  .pkc.is-live{transition:transform .08s linear}
  .pkc.is-flipped{--pkc-flip:180deg}
  .pkc-stage{perspective:900px}

  @media (prefers-reduced-motion:reduce){
    .pkc,.pkc.is-live{transition:none}
  }
```

- [ ] **Step 5: Lancer les tests**

Run: `npm test`
Expected: 360 tests passent.

- [ ] **Step 6: Commit**

```bash
git add src/components/PokeCard.vue src/components/PokeCard.test.js src/styles.css
git commit -m "feat(carte): l'incliner du doigt, la retourner d'un clic"
```

---

### Task 5: Rituel — l'entaille du sceau

**Files:**
- Modify: `src/components/RitualOverlay.vue`
- Modify: `src/components/RitualOverlay.test.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: la table `INTENSITY` corrigée (Task 1).
- Produces: l'état `cutting` inséré entre `sealed` et `tearing`, et la constante `CUT_MS = 760`. La Task 6 s'y branche.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/components/RitualOverlay.test.js` :

```js
describe('entaille du sceau', () => {
  it('entaille le pli avant de le déchirer', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    expect(w.find('.packet').classes()).toContain('cutting')
    expect(w.find('.packet').classes()).not.toContain('tearing')

    await vi.advanceTimersByTimeAsync(760)
    expect(w.find('.packet').classes()).toContain('tearing')
  })

  // Les rayons appartiennent à ce qui sort du pli, pas au pli fermé.
  it('ne fait monter les rayons qu’une fois le pli cédé', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    expect(w.find('.ray-layer').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(760)
    expect(w.find('.ray-layer').exists()).toBe(true)
  })

  it('inscrit la capture dès le sceau brisé, sans attendre la révélation', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    expect(w.emitted('claim')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/components/RitualOverlay.test.js -t "entaille"`
Expected: FAIL — la classe `cutting` n'existe pas

- [ ] **Step 3: Implémenter l'état `cutting`**

Dans `src/components/RitualOverlay.vue`, remplacer `const stage = ref('sealed')` et `tear()` par :

```js
// sealed → cutting → tearing → awaiting → revealed
const stage = ref('sealed')
const timers = []
const after = (ms, fn) => timers.push(setTimeout(fn, ms))

// L'entaille court sur la pliure (.42 s) puis le bandeau se soulève (.34 s) : le pli n'a
// pas cédé avant. C'est ce qui donne au geste son épaisseur — on ouvre, on ne fait pas
// disparaître un rectangle.
const CUT_MS = 760

function tear() {
  stage.value = 'cutting'
  // Émis avant que l'écriture ne soit confirmée : la révélation est une animation, pas une
  // preuve d'écriture. Si `claim` échoue, `state.claimed` n'est jamais mis à jour et le pli
  // reste dans `pending` — il réapparaît à la prochaine ouverture. C'est le comportement
  // voulu : ne pas avaler l'échec en gardant la révélation silencieuse sur son sort réel.
  emit('claim', props.entry.key)
  after(CUT_MS, () => { stage.value = 'tearing' })
}

onUnmounted(() => timers.forEach(clearTimeout))
```

Supprimer l'ancien `let timer = null` et son `onUnmounted`.

Dans le template, le pli reste monté pendant `cutting` et `tearing` :

```vue
    <template v-if="stage === 'sealed' || stage === 'cutting' || stage === 'tearing'">
      <div class="stack">
        <div v-if="remaining > 2" class="ghost-pkt g1"></div>
        <div v-if="remaining > 1" class="ghost-pkt g2"></div>
        <button
          ref="packetEl" class="packet" :class="{ cutting: stage !== 'sealed', tearing: stage === 'tearing' }"
          :disabled="stage !== 'sealed'" @click="tear"
        >
          <span class="pkt-flap"><span class="pkt-kicker">Pli scellé · {{ entry.date }}</span></span>
          <span class="pkt-cut"></span>
          <div class="pkt-body" :style="stage === 'sealed' ? null : { clipPath: TORN }">
            <div class="pkt-seal">✳</div>
            <div class="pkt-title">{{ entry.label }}</div>
            <div v-if="entry.ref" class="pkt-pr mono">{{ entry.ref }}</div>
            <div class="pkt-foot">Briser le sceau</div>
          </div>
        </button>
      </div>
      <div v-if="stage === 'sealed'" class="queue-note">{{ remaining > 1 ? remaining + ' plis en attente' : 'dernier pli' }}</div>
    </template>
```

Le `pkt-head` disparaît : son contenu passe dans `pkt-flap`, qui est la partie découpée.

Et la dentelure, calculée une seule fois au chargement du module :

```js
/**
 * Le bord de coupe. Une dentelure parfaitement régulière se lit comme un cranté machine ;
 * les profondeurs et les décalages sont donc inégaux — mais en suite fixe, jamais tirés au
 * hasard : deux ouvertures du même pli doivent produire le même bord.
 */
const TORN = (() => {
  const profondeurs = [8, 5.5, 9, 6.5, 7.5, 5, 8.5, 6]
  const decalages = [0, 0.9, -0.6, 1.2, -0.4, 0.7, -1, 0.5]
  const dents = 26
  const points = []
  for (let i = 0; i <= dents; i++) {
    const brut = (i / dents) * 100 + (i > 0 && i < dents ? decalages[i % decalages.length] : 0)
    const x = Math.min(Math.max(brut, 0), 100).toFixed(2)
    points.push(`${x}% ${i % 2 ? profondeurs[i % profondeurs.length] : 0}px`)
  }
  return `polygon(${points.join(',')},100% 100%,0 100%)`
})()
```

- [ ] **Step 4: Écrire les styles de l'entaille**

Dans `src/styles.css`, section rituel, remplacer `.pkt-head` par le rabat et ajouter l'entaille :

```css
  .pkt-flap{display:flex;align-items:center;justify-content:center;height:36px;
    background:linear-gradient(180deg,var(--plate-hi),var(--plate));
    border-bottom:1px dashed var(--rule);position:relative;z-index:2}
  .packet.cutting .pkt-flap{animation:flapOff .34s ease-in .42s both}
  @keyframes flapOff{to{transform:translateY(-18px) rotate(-1.8deg);opacity:0}}
  .pkt-cut{position:absolute;left:0;top:35px;height:2px;width:100%;z-index:3;pointer-events:none;
    transform:scaleX(0);transform-origin:left center;opacity:0;
    background:linear-gradient(90deg,rgba(255,244,214,0),rgba(255,246,222,.9) 55%,#fffdf4 100%)}
  .pkt-cut::after{content:"";position:absolute;right:-3px;top:-3px;width:8px;height:8px;border-radius:50%;
    background:#fff8e4;box-shadow:0 0 10px 3px rgba(255,226,150,.9)}
  .packet.cutting .pkt-cut{animation:cutRun .42s cubic-bezier(.35,0,.2,1) both}
  @keyframes cutRun{0%{transform:scaleX(0);opacity:1}78%{opacity:1}100%{transform:scaleX(1);opacity:0}}
  .pkt-body{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 24px 18px;text-align:center}

  @media (prefers-reduced-motion:reduce){
    .packet.cutting .pkt-flap,.packet.cutting .pkt-cut{animation-duration:.01s}
  }
```

Le `.packet::after` existant (le filet à `inset:9px`) reste inchangé.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run src/components/RitualOverlay.test.js`
Expected: les 3 nouveaux tests passent ; **plusieurs anciens échouent** — c'est attendu, la Task 6 les migre. Ne pas les corriger ici : ils portent sur l'étape `silhouette`, qui n'est supprimée qu'à la tâche suivante.

Si des échecs portent sur autre chose que `silhouette` / `revealed` / les temporisations 2200-2800, les corriger avant de continuer.

- [ ] **Step 6: Commit**

```bash
git add src/components/RitualOverlay.vue src/components/RitualOverlay.test.js src/styles.css
git commit -m "feat(rituel): on entaille le pli avant qu'il cède"
```

---

### Task 6: Rituel — la carte remplace la silhouette

C'est la tâche centrale : elle supprime l'étape `silhouette`, monte la carte dos visible, rend le retournement au joueur, et migre les 36 tests existants.

**Files:**
- Modify: `src/components/RitualOverlay.vue`
- Modify: `src/components/RitualOverlay.test.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `PokeCard` (Tasks 2-4) avec ses props `speciesId`, `tier`, `shiny`, `scene`, `provenance`, `flipped`, et son événement `flip` ; l'état `cutting` (Task 5).
- Produces: les états `awaiting` et `revealed`, la constante `AUTO_REVEAL_MS = 4000`, et la fonction `reveal()` — la Task 7 y accroche la fanfare.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/components/RitualOverlay.test.js` :

```js
// Après la déchirure, la carte est là mais retournée : le joueur décide quand il la retourne.
const jusquAuDos = async (w) => {
  await w.find('.packet').trigger('click')
  await vi.advanceTimersByTimeAsync(1180)
}

describe('la carte tenue dos visible', () => {
  it('sort dos visible et attend', async () => {
    const w = mountRitual()
    await jusquAuDos(w)
    expect(w.findComponent({ name: 'PokeCard' }).props('flipped')).toBe(true)
    expect(w.find('.reveal-name').exists()).toBe(false)
  })

  it('ne divulgue rien tant qu’elle n’est pas retournée', async () => {
    const w = mountRitual()
    await jusquAuDos(w)
    expect(w.text()).not.toContain('Pikachu')
  })

  it('se retourne au clic, immédiatement', async () => {
    const w = mountRitual()
    await jusquAuDos(w)
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('flip')
    expect(w.findComponent({ name: 'PokeCard' }).props('flipped')).toBe(false)
    expect(w.find('.reveal-name').text()).toBe('Pikachu')
  })

  // Le filet pour qui a posé son téléphone — pas pour qui attend.
  it('se retourne seule au bout de quatre secondes', async () => {
    const w = mountRitual()
    await jusquAuDos(w)
    await vi.advanceTimersByTimeAsync(3999)
    expect(w.find('.reveal-name').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(w.find('.reveal-name').text()).toBe('Pikachu')
  })

  // Sans annulation, le minuteur rejouerait la révélation par-dessus une carte déjà retournée.
  it('annule le retournement automatique quand le joueur a cliqué', async () => {
    const w = mountRitual()
    await jusquAuDos(w)
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('flip')
    await vi.advanceTimersByTimeAsync(5000)
    expect(w.findAll('.reveal-name')).toHaveLength(1)
  })

  it('annonce le décompte au joueur', async () => {
    const w = mountRitual()
    await jusquAuDos(w)
    expect(w.find('.reveal-hint').text()).toContain('Cliquer pour retourner')
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('flip')
    expect(w.find('.reveal-hint').exists()).toBe(false)
  })

  it('donne le focus à la carte, puisque c’est elle qui porte l’action', async () => {
    const w = mountRitual({ attachTo: document.body })
    await jusquAuDos(w)
    expect(document.activeElement.closest('.pkc-stage')).not.toBeNull()
    w.unmount()
  })
})
```

- [ ] **Step 2: Migrer les tests existants**

Dans `src/components/RitualOverlay.test.js`, appliquer mécaniquement :

- Remplacer chaque `vi.advanceTimersByTime(2200)` et `vi.advanceTimersByTime(2800)` qui sert à **atteindre la révélation** par l'assistant :

```js
// La révélation n'est plus une attente subie : on ouvre, puis on retourne la carte.
const reveler = async (w) => {
  await w.find('.packet').trigger('click')
  await vi.advanceTimersByTimeAsync(1180)
  await w.findComponent({ name: 'PokeCard' }).vm.$emit('flip')
  return w
}
```

- Supprimer les trois tests devenus sans objet, en les remplaçant par ceux de l'étape 1 : `passe par la silhouette avant la révélation`, `ne divulgue rien avant la révélation — le pli scellé et la silhouette restent muets`, `ne focalise rien pendant la silhouette`.
- Remplacer `expect(w.find('.reveal').classes()).toContain('revealed')` par `expect(w.find('.reveal-name').exists()).toBe(true)`.
- Supprimer les assertions sur `.dev-note` et `img.silh`.

Les assertions **métier** — bannière chromatique, bannière légendaire, chip « Nouveau », note de bonbons, bouton « Suivant », `skip-all`, `close` — ne changent pas : elles portent sur la révélation, pas sur le chemin qui y mène. Ne pas les affaiblir.

- [ ] **Step 3: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/components/RitualOverlay.test.js`
Expected: FAIL — `PokeCard` n'est pas monté par le rituel

- [ ] **Step 4: Implémenter**

Dans `src/components/RitualOverlay.vue` :

```js
import PokeCard from './PokeCard.vue'

// La carte dos visible remplace l'étape « silhouette ». Elle tient moins longtemps que les
// 2,2 s d'attente subie d'avant, parce que le retournement porte lui-même le suspense — et
// parce que le joueur peut le devancer d'un clic.
const CARD_AT = 1180
const AUTO_REVEAL_MS = 4000

let autoTimer = null

function reveal() {
  if (stage.value !== 'awaiting') return
  clearTimeout(autoTimer)
  stage.value = 'revealed'
}
```

Dans `tear()`, enchaîner après la déchirure :

```js
  after(CUT_MS, () => {
    stage.value = 'tearing'
    after(CARD_AT - CUT_MS, () => {
      stage.value = 'awaiting'
      autoTimer = setTimeout(reveal, AUTO_REVEAL_MS)
    })
  })
```

Ajouter `clearTimeout(autoTimer)` au `onUnmounted`.

Dans le template, remplacer tout le bloc `<div class="reveal">` — le `<img>`, `img.silh`, `.dev-ring`, `.dev-note` et l'ancien `.burst` disparaissent :

```vue
    <template v-else>
      <div class="reveal" :class="stage">
        <div
          v-for="layer in rayLayers" :key="layer.key" class="ray-layer"
          :style="rayLayerStyle(layer)"
        ></div>
        <div class="pkc-stage">
          <PokeCard
            ref="cardEl"
            :species-id="entry.species" :tier="tier" :shiny="entry.shiny"
            :provenance="{ ref: entry.ref, label: entry.label, date: entry.date }"
            :flipped="stage === 'awaiting'" scene="night"
            @flip="reveal"
          />
        </div>
      </div>

      <div v-if="stage === 'awaiting'" class="reveal-hint">
        <span>Cliquer pour retourner</span>
        <span class="hint-bar"><i></i></span>
      </div>

      <template v-if="stage === 'revealed'">
        <!-- inchangé : .reveal-meta, .next-btn, « tout ouvrir sans cérémonie » -->
      </template>
    </template>
```

Le focus suit l'action de l'étape : mettre à jour le `watch` et son commentaire.

```js
const cardEl = ref(null)

/**
 * Le focus part sur l'action principale de l'étape courante, et Espace agit alors nativement.
 * Cela corrige au passage un vrai trou d'accessibilité : sans ça, le focus reste sur le bouton
 * « Ouvrir » de TheRail, DERRIÈRE l'overlay.
 *
 * L'étape `awaiting` focalise la carte : contrairement à l'ancienne silhouette, qui imposait
 * une attente, c'est désormais elle qui porte l'action — la retourner.
 */
watch(stage, async (s) => {
  await nextTick()
  if (s === 'awaiting') cardEl.value?.$el?.focus()
  if (s === 'revealed') nextEl.value?.focus()
})
```

Pour que la carte soit focalisable, ajouter `tabindex="0"` sur la racine `.pkc` dans `PokeCard.vue`, ainsi qu'un `@keyup.enter="emit('flip')"` — sans quoi le clavier ne peut pas retourner la carte.

- [ ] **Step 5: Écrire les styles de l'indice**

```css
  /* Le retournement automatique ne doit jamais surprendre : on voit le temps venir, donc on
     choisit de le devancer ou de le laisser filer. */
  .reveal-hint{display:flex;flex-direction:column;align-items:center;gap:7px;
    font-family:var(--f-label);font-size:9px;font-weight:600;letter-spacing:.2em;
    text-transform:uppercase;color:#a29172}
  .hint-bar{display:block;width:132px;height:2px;background:rgba(255,235,190,.16)}
  .hint-bar i{display:block;height:100%;width:0;background:rgba(255,214,140,.75);
    animation:countdown 4s linear forwards}
  @keyframes countdown{to{width:100%}}
  .pkc-stage{perspective:900px}

  @media (prefers-reduced-motion:reduce){
    .hint-bar i{animation-duration:.01s}
  }
```

- [ ] **Step 6: Lancer toute la suite**

Run: `npm test`
Expected: tous verts. Si un test métier migré échoue, c'est une régression réelle — le corriger, ne pas l'affaiblir.

- [ ] **Step 7: Commit**

```bash
git add src/components/RitualOverlay.vue src/components/RitualOverlay.test.js src/styles.css
git commit -m "feat(rituel): la carte remplace la silhouette, et c'est le joueur qui la retourne"
```

---

### Task 7: Rituel — la fanfare au retournement, dosée par le palier

**Files:**
- Modify: `src/components/RitualOverlay.vue`
- Modify: `src/components/RitualOverlay.test.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: la fonction `reveal()` et l'état `revealed` (Task 6).
- Produces: la table `FANFARE` et le multiplicateur `PUNCH`.

- [ ] **Step 1: Écrire les tests qui échouent**

```js
describe('fanfare', () => {
  const reveler = async (species) => {
    const w = mountRitual({ entry: entryOf({ species }) })
    await w.find('.packet').trigger('click')
    await vi.advanceTimersByTimeAsync(1180)
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('flip')
    return w
  }

  // Un commun ne déclenche rien. C'est ce silence qui donne sa valeur au reste : si chaque
  // tirage explose, l'explosion du légendaire ne signifie plus rien.
  it('reste muette sur un commun', async () => {
    const w = await reveler(16)
    expect(w.findAll('.fx-spark')).toHaveLength(0)
    expect(w.findAll('.fx-ring')).toHaveLength(0)
    expect(w.find('.flash').exists()).toBe(false)
  })

  it('monte avec le palier', async () => {
    const peuCommun = await reveler(25)
    const rare = await reveler(6)
    const legendaire = await reveler(151)

    expect(peuCommun.findAll('.fx-spark').length).toBeGreaterThan(0)
    expect(rare.findAll('.fx-spark').length).toBeGreaterThan(peuCommun.findAll('.fx-spark').length)
    expect(legendaire.findAll('.fx-spark').length).toBeGreaterThan(rare.findAll('.fx-spark').length)

    expect(peuCommun.findAll('.fx-ring')).toHaveLength(0)
    expect(legendaire.findAll('.fx-ring').length).toBeGreaterThan(rare.findAll('.fx-ring').length)
  })

  it('ne part qu’une fois par tirage, et jamais à la déchirure', async () => {
    const w = mountRitual({ entry: entryOf({ species: 6 }) })
    await w.find('.packet').trigger('click')
    await vi.advanceTimersByTimeAsync(1180)
    expect(w.findAll('.fx-spark')).toHaveLength(0)

    await w.findComponent({ name: 'PokeCard' }).vm.$emit('flip')
    const salve = w.findAll('.fx-spark').length
    await vi.advanceTimersByTimeAsync(5000)
    expect(w.findAll('.fx-spark')).toHaveLength(salve)
  })
})
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/components/RitualOverlay.test.js -t "fanfare"`
Expected: FAIL — `.fx-spark` introuvable

- [ ] **Step 3: Implémenter**

Dans `src/components/RitualOverlay.vue` :

```js
/**
 * La fanfare EST le palier. Le rituel se rejoue ~300 fois par an et n'est pas facultatif :
 * si le plancher est bruyant, le plafond ne veut plus rien dire. Un commun ne reçoit donc
 * rien du tout — c'est ce silence qui donne sa valeur au légendaire.
 */
const FANFARE = {
  c: { flash: 0, sparks: 0, rings: 0, shake: 0 },
  u: { flash: 1.6, sparks: 7, rings: 0, shake: 0 },
  r: { flash: 4.2, sparks: 20, rings: 1, shake: 1.6 },
  l: { flash: 6.5, sparks: 34, rings: 3, shake: 3 },
}
// Dosage retenu après essais sur maquette. Il module la courbe, il ne l'aplatit jamais :
// un commun reste muet quel que soit le réglage.
const PUNCH = 1.7

const fanfare = computed(() => FANFARE[tier.value])

// Positions déterministes : deux tirages du même palier produisent la même salve.
const fxSparks = computed(() => {
  const n = Math.round(fanfare.value.sparks * PUNCH)
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.21
    const distance = 120 + (i % 5) * 46
    return {
      '--dx': (Math.cos(angle) * distance).toFixed(1) + 'px',
      '--dy': (Math.sin(angle) * distance).toFixed(1) + 'px',
      '--sd': (0.85 + (i % 4) * 0.22).toFixed(2) + 's',
    }
  })
})

const fxRings = computed(() =>
  Array.from({ length: Math.round(fanfare.value.rings * PUNCH) }, (_, i) => ({
    animationDelay: i * 0.17 + 's',
  })),
)
```

Ajouter au `style` calculé de la racine : `'--flashscale': (fanfare.value.flash * PUNCH).toFixed(2)` et `'--shake': (fanfare.value.shake * PUNCH).toFixed(2)`.

Dans le template, à l'intérieur de `.reveal`, rendu seulement en `revealed` et seulement si `fanfare.flash` :

```vue
        <template v-if="stage === 'revealed' && fanfare.flash">
          <div class="flash"></div>
          <span v-for="(r, i) in fxRings" :key="'r' + i" class="fx-ring" :style="r"></span>
          <span v-for="(s, i) in fxSparks" :key="'s' + i" class="fx-spark" :style="s"></span>
        </template>
```

Et la secousse sur la racine : `:class="{ shaking: stage === 'revealed' && fanfare.shake }"`.

- [ ] **Step 4: Écrire les styles**

```css
  /* Les particules d'avant tournaient en boucle et ignoraient le palier. Celles-ci partent
     une fois, du centre, en nombre dicté par la rareté. */
  .fx-spark{position:absolute;width:5px;height:5px;border-radius:50%;pointer-events:none;
    background:#ffe9a8;box-shadow:0 0 8px 2px rgba(255,215,102,.9);
    animation:fxSpark var(--sd,1.1s) cubic-bezier(.15,.7,.3,1) forwards}
  @keyframes fxSpark{
    0%{transform:translate(0,0) scale(0);opacity:0}
    12%{opacity:1;transform:translate(calc(var(--dx)*.18),calc(var(--dy)*.18)) scale(1.6)}
    100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}
  .fx-ring{position:absolute;width:150px;height:150px;border-radius:50%;pointer-events:none;
    border:2px solid rgba(255,214,140,.75);animation:fxRing .95s cubic-bezier(.1,.7,.3,1) forwards}
  @keyframes fxRing{0%{transform:scale(.3);opacity:.85}100%{transform:scale(3.6);opacity:0}}
  .ritual.shaking{animation:fxShake .42s cubic-bezier(.36,.07,.19,.97)}
  @keyframes fxShake{
    10%,90%{transform:translate(calc(var(--shake) * -1px),0)}
    30%,70%{transform:translate(calc(var(--shake) * 2px),calc(var(--shake) * -1px))}
    50%{transform:translate(calc(var(--shake) * -2px),calc(var(--shake) * 1px))}}

  /* La secousse d'écran est un vrai sujet vestibulaire, pas une coquetterie. */
  @media (prefers-reduced-motion:reduce){
    .fx-spark,.fx-ring{display:none}
    .ritual.shaking{animation:none}
  }
```

Supprimer les anciens `.burst` / `.spark` / `@keyframes spark` de `src/styles.css`, ainsi que le tableau `sparks` et la constante `big` devenus morts dans `RitualOverlay.vue`.

- [ ] **Step 5: Lancer les tests**

Run: `npm test`
Expected: tous verts.

- [ ] **Step 6: Commit**

```bash
git add src/components/RitualOverlay.vue src/components/RitualOverlay.test.js src/styles.css
git commit -m "feat(rituel): une fanfare qui se mérite"
```

---

### Task 8: La fiche d'espèce montre la même carte

**Files:**
- Modify: `src/components/SpeciesSheet.vue:80-88`
- Modify: `src/components/SpeciesSheet.test.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `PokeCard` (Tasks 2-4).
- Produces: rien.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `src/components/SpeciesSheet.test.js` :

```js
describe('la carte de la fiche', () => {
  it('montre la même carte que le rituel, en lumière du jour', () => {
    const w = mountSheet({ id: 6 })
    const carte = w.findComponent({ name: 'PokeCard' })
    expect(carte.props('scene')).toBe('day')
    expect(carte.props('tier')).toBe('r')
    // On consulte une espèce, pas un exemplaire daté : pas de dos, donc pas de provenance.
    expect(carte.props('provenance')).toBeNull()
  })
})
```

Adapter l'appel au harnais de montage déjà présent en tête de `SpeciesSheet.test.js`.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run src/components/SpeciesSheet.test.js -t "carte de la fiche"`
Expected: FAIL — aucun composant `PokeCard`

- [ ] **Step 3: Implémenter**

Dans `SpeciesSheet.vue`, remplacer le bloc `.panel-art` par :

```vue
        <div class="pkc-stage panel-card">
          <PokeCard :species-id="id" :tier="species.tier" :shiny="shiny" scene="day" />
        </div>
```

Ajouter l'import. Le zoom au clic (`zoomed`) disparaît : la carte inclinable le remplace — supprimer l'état `zoomed`, son overlay et les tests qui le couvrent, en le mentionnant dans le message de commit.

- [ ] **Step 4: Ajuster les styles**

```css
  /* Sur la fiche, la carte est posée à plat : elle est plus petite que sous les projecteurs. */
  .panel-card{flex:0 0 auto}
  .panel-card .pkc{width:186px;height:260px}
  .panel-card .pkc-art img{width:100px;height:100px}
  .panel-card .pkc-name{font-size:15px}
```

- [ ] **Step 5: Lancer toute la suite**

Run: `npm test`
Expected: tous verts.

- [ ] **Step 6: Commit**

```bash
git add src/components/SpeciesSheet.vue src/components/SpeciesSheet.test.js src/styles.css
git commit -m "feat(fiche): on y retrouve la carte qu'on a gagnée"
```

---

### Task 9: Documentation et pull request

**Files:**
- Modify: `README.md`
- Modify: `NOTES.md`

- [ ] **Step 1: Consigner les partis pris**

Ajouter à `NOTES.md`, dans « Décisions prises pendant l'implémentation », une entrée par décision non déductible du code : la carte unique sous deux éclairages, la rareté portée par le carton, la fanfare muette en commun, le retournement rendu au joueur, et le correctif des rayons.

- [ ] **Step 2: Mettre le README à jour**

La section qui décrit le rituel doit mentionner la carte et son dos-provenance.

- [ ] **Step 3: Vérifier l'ensemble**

Run: `npm test` puis `npm run build`
Expected: tests verts, build sans erreur.

- [ ] **Step 4: Commit et pull request**

```bash
git add README.md NOTES.md
git commit -m "docs: la carte, ses paliers et son rituel"
git push -u origin worktree-carte-rituel
gh pr create --title "La carte et son rituel d'ouverture" --body "..."
```

Le corps de la PR doit contenir : le lien vers la spec, le lien vers la maquette, le tableau des paliers, le tableau de la fanfare, et une mention explicite du correctif d'accessibilité des rayons (défaut de production, corrigé au passage).

---

## Auto-revue du plan

**Couverture de la spec.** Une carte unique sous deux scènes → Tasks 2 et 8. Quatre paliers → Task 2. Fanfare dosée → Task 7. Retournement rendu au joueur avec filet à 4 s → Task 6. Dos-provenance → Task 3. Entaille et découpe → Task 5. Correctif des rayons → Task 1. `prefers-reduced-motion` → Tasks 4, 5, 6, 7. Tactile → Task 4 (`tiltable`). Clavier → Task 6 (`tabindex`, `@keyup.enter`, focus). Migration des tests → Task 6. Coût de rendu des rayons → non couvert par un test automatisé : à vérifier à la main sur mobile avant de fusionner.

**Points de vigilance relevés à la relecture :**

1. La Task 5 laisse volontairement la suite rouge — c'est le seul endroit du plan où `npm test` ne finit pas au vert. Ne pas « réparer » les tests de silhouette à ce moment-là : ils sont supprimés à la Task 6.
2. `SpeciesSheet.vue` perd la fonction de zoom. C'est un retrait de fonctionnalité, à assumer explicitement dans le message de commit et la PR.
3. Les noms de classes `.flash` et `@keyframes flash` **existent déjà** dans `styles.css` et sont réutilisés tels quels ; `.spark` existe aussi mais avec une animation en boucle — d'où le renommage en `.fx-spark`, et la suppression de l'ancien.
