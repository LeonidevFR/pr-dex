# Cartes Onyx et thème clair / sombre — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un thème clair à côté du sombre, des cartes Onyx (carton noir en sombre, ivoire en clair, métal par palier) et un dos Onyx avec logo, numéro, date et PR.

**Architecture:** `data-theme` sur `<html>`, posé avant le premier rendu par un script en ligne, piloté ensuite par un composable `useTheme`. Les couleurs du décor passent toutes par des tokens ; `:root[data-theme="light"]` les redéfinit, et `.ritual, .evostage` redéclarent les tokens sombres pour rester des scènes de nuit. Les matières de la carte passent par des tokens de carte sur `.pkc`, redéfinis par `[data-theme="light"] .pkc`.

**Tech Stack:** Vue 3 SFC, Vitest + @vue/test-utils, CSS dans `src/styles.css`. Aucune dépendance.

**Spec:** `docs/superpowers/specs/2026-10-01-cartes-onyx-theme-design.md`

## Global Constraints

- Français partout ; commentaires sur le *pourquoi* ; pas de `<style>` dans les SFC ; aucune dépendance.
- Palette claire exacte de la spec : `--bg:#f6f0e2`, `--surface:#efe7d4`, `--surface-hi:#fbf6ea`, `--line:rgba(44,38,32,.10)`, `--line-gold:rgba(154,122,53,.28)`, `--fg:#2c2620`, `--fg-2:#5a5044`, `--fg-3:#6f6350`, `--gold:#7a5c22`, `--cream:#2c2620`, paliers `#665d53 / #4a6a42 / #9e3b2e / #7a581a`.
- Clé de stockage : `prdex.theme`, valeurs `'light' | 'dark'`. Tout accès à `localStorage` dans un `try/catch`.
- Le rituel et l'évolution restent sombres dans les deux thèmes.
- La carte suit le thème partout, rituel compris.
- `prefers-reduced-motion` n'est pas honoré (décision `ac68ba4`).
- Chaque tâche finit sur `npm test` au vert et un commit (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Push avec `GS_REVIEW_BYPASS=1`.

## Review Focus

1. **Thème clair dans le rituel** : les tokens redéclarés sur `.ritual` doivent garder le texte clair sur fond noir → test de feuille de style dans la tâche 2.
2. **Changement du thème système pendant la session** : suivi seulement sans choix enregistré → test dans la tâche 1.
3. **`localStorage` qui jette** (navigation privée, stockage bloqué) : la bascule marche quand même → test dans la tâche 1.
4. **Le dos dans le rituel** ne dévoile pas le numéro avant le retournement → test dans la tâche 4.
5. **Contraste du texte de carte en clair** (encre sur ivoire, palier sur carton ocre) → vérifié au navigateur dans la tâche 5.

---

### Task 1: `useTheme` et le bouton de l'en-tête

**Files:**
- Create: `src/composables/useTheme.js`, `src/composables/useTheme.test.js`
- Modify: `index.html` (script en ligne dans `<head>`)
- Modify: `src/components/TheRail.vue`, `src/components/TheRail.test.js`
- Modify: `src/App.vue`

**Interfaces:**
- Produces: `useTheme({ storage = window.localStorage, media = window.matchMedia?.('(prefers-color-scheme: light)'), root = document.documentElement } = {})` → `{ theme: Ref<'light'|'dark'>, toggle: () => void }`. Pose `root.dataset.theme`.
- Produces: `TheRail` prop `theme: String` (défaut `'dark'`), émission `toggle-theme`.

- [ ] **Step 1: tests du composable** — `src/composables/useTheme.test.js` :

```js
import { describe, it, expect, vi } from 'vitest'
import { useTheme } from './useTheme.js'

const fakeMedia = (matches) => {
  const listeners = []
  return { matches, addEventListener: (_, fn) => listeners.push(fn), fire: (m) => listeners.forEach((fn) => fn({ matches: m })) }
}
const fakeStorage = (init = {}) => {
  const data = { ...init }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v }, data }
}

describe('useTheme', () => {
  it('suit le système sans choix enregistré', () => {
    const root = { dataset: {} }
    const { theme } = useTheme({ storage: fakeStorage(), media: fakeMedia(true), root })
    expect(theme.value).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('suit un changement du système tant qu’aucun choix n’est enregistré', () => {
    const media = fakeMedia(false)
    const root = { dataset: {} }
    const { theme } = useTheme({ storage: fakeStorage(), media, root })
    media.fire(true)
    expect(theme.value).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('bascule et enregistre le choix', () => {
    const storage = fakeStorage()
    const root = { dataset: {} }
    const { theme, toggle } = useTheme({ storage, media: fakeMedia(false), root })
    toggle()
    expect(theme.value).toBe('light')
    expect(storage.data['prdex.theme']).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('préfère le choix enregistré au système, et ne suit plus le système ensuite', () => {
    const media = fakeMedia(true)
    const { theme } = useTheme({ storage: fakeStorage({ 'prdex.theme': 'dark' }), media, root: { dataset: {} } })
    expect(theme.value).toBe('dark')
    media.fire(true)
    expect(theme.value).toBe('dark')
  })

  it('marche sans stockage disponible', () => {
    const storage = { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('bloqué') } }
    const { theme, toggle } = useTheme({ storage, media: fakeMedia(false), root: { dataset: {} } })
    expect(theme.value).toBe('dark')
    toggle()
    expect(theme.value).toBe('light')
  })

  it('retombe sur le sombre sans matchMedia', () => {
    expect(useTheme({ storage: fakeStorage(), media: undefined, root: { dataset: {} } }).theme.value).toBe('dark')
  })
})
```

Run: `npx vitest run src/composables/useTheme.test.js` — Expected: FAIL (module introuvable).

- [ ] **Step 2: le composable** — `src/composables/useTheme.js` :

```js
import { ref } from 'vue'

const KEY = 'prdex.theme'

// Le stockage peut manquer ou jeter (navigation privée, données bloquées) : le thème marche
// alors pour la session, sans s'en souvenir.
const read = (storage) => { try { return storage?.getItem(KEY) } catch { return null } }
const write = (storage, v) => { try { storage?.setItem(KEY, v) } catch { /* rien à faire */ } }

/**
 * Le thème suit le système tant que la personne n'a rien choisi ; dès qu'elle bascule, son
 * choix l'emporte et le système n'a plus la main. `index.html` pose déjà le bon thème avant le
 * premier rendu ; ce composable reprend la main ensuite.
 */
export function useTheme({
  storage = globalThis.localStorage,
  media = globalThis.matchMedia?.('(prefers-color-scheme: light)'),
  root = globalThis.document?.documentElement,
} = {}) {
  const saved = read(storage)
  let chosen = saved === 'light' || saved === 'dark'
  const theme = ref(chosen ? saved : (media?.matches ? 'light' : 'dark'))
  const apply = () => { if (root) root.dataset.theme = theme.value }
  apply()

  media?.addEventListener?.('change', (e) => {
    if (chosen) return
    theme.value = e.matches ? 'light' : 'dark'
    apply()
  })

  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    chosen = true
    write(storage, theme.value)
    apply()
  }

  return { theme, toggle }
}
```

Run: `npx vitest run src/composables/useTheme.test.js` — Expected: PASS.

- [ ] **Step 3: le script en ligne** — dans `index.html`, juste après `<meta name="viewport" …>` :

```html
<script>
  // Posé avant le premier rendu : sans ça, l'app clignote en sombre avant de passer en clair.
  try {
    var t = localStorage.getItem('prdex.theme')
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    document.documentElement.dataset.theme = t
  } catch (e) { document.documentElement.dataset.theme = 'dark' }
</script>
```

- [ ] **Step 4: le bouton** — dans `src/components/TheRail.test.js`, ajouter :

```js
  describe('thème', () => {
    it('propose de passer au clair depuis le sombre', () => {
      const b = mountRail({ theme: 'dark' }).find('.theme-toggle')
      expect(b.attributes('aria-label')).toBe('Passer au thème clair')
    })

    it('propose de passer au sombre depuis le clair', () => {
      expect(mountRail({ theme: 'light' }).find('.theme-toggle').attributes('aria-label')).toBe('Passer au thème sombre')
    })

    it('émet toggle-theme au clic', async () => {
      const w = mountRail()
      await w.find('.theme-toggle').trigger('click')
      expect(w.emitted('toggle-theme')).toHaveLength(1)
    })
  })
```

Run — Expected: FAIL. Puis dans `TheRail.vue` : prop `theme: { type: String, default: 'dark' }`, émission `'toggle-theme'`, et avant le bouton Réglages :

```html
      <button
        class="gear theme-toggle" :aria-label="theme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair'"
        :title="theme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair'" @click="$emit('toggle-theme')"
      >
        <svg v-if="theme === 'light'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path></svg>
        <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
      </button>
```

- [ ] **Step 5: `App.vue`** — importer `useTheme`, `const { theme, toggle: toggleTheme } = useTheme()`, et sur `<TheRail>` : `:theme="theme" @toggle-theme="toggleTheme"`.

Run: `npm test` — Expected: PASS.

- [ ] **Step 6: commit** — `feat(ui): bascule de thème clair / sombre, qui suit le système par défaut`.

---

### Task 2: les tokens du thème clair

**Files:**
- Modify: `src/styles.css` (`:root`, toutes les couleurs écrites en dur du décor, nouveau bloc clair)
- Test: `src/styles.test.js`

**Interfaces:**
- Produces: tokens `--fg-title`, `--on-gold`, `--header-bg`, `--scrim`, `--panel-bg`, `--note`, `--u-text`, `--r-text`, `--l-text`, `--s-text` dans `:root` (valeurs sombres actuelles) et redéfinis sous `:root[data-theme="light"]`.

- [ ] **Step 1: tests**

```js
  it('redéfinit le décor en thème clair', () => {
    const clair = regles.find((r) => r.selecteur === ':root[data-theme="light"]')
    expect(clair).toBeDefined()
    expect(clair.corps).toMatch(/--bg\s*:\s*#f6f0e2/)
    expect(clair.corps).toMatch(/--fg\s*:\s*#2c2620/)
    expect(clair.corps).toMatch(/--gold\s*:\s*#7a5c22/)
  })

  /**
   * Le rituel et l'évolution sont des scènes de nuit dans les deux thèmes : s'ils héritaient
   * des tokens clairs, leur texte passerait à l'encre sur fond noir.
   */
  it('garde le rituel et l’évolution en tokens sombres', () => {
    const scenes = regles.find((r) => r.selecteur.split(',').map((s) => s.trim()).includes('.ritual')
      && r.selecteur.includes('.evostage') && /--fg\s*:/.test(r.corps))
    expect(scenes).toBeDefined()
    expect(scenes.corps).toMatch(/--fg\s*:\s*#efe7d8/)
  })

  it('ne laisse plus le titre crème écrit en dur dans le décor', () => {
    const horsCarte = regles.filter((r) => !r.selecteur.includes('.pkc') && !/^:root|\.ritual|\.evostage|\.reveal|\.evo-/.test(r.selecteur))
    expect(horsCarte.filter((r) => /#f4ecda/i.test(r.corps)).map((r) => r.selecteur)).toEqual([])
  })
```

Run — Expected: FAIL.

- [ ] **Step 2: les tokens** — ajouter à `:root` :

```css
    --fg-title:#f4ecda;
    --on-gold:#1a1410;
    --header-bg:rgba(20,17,14,.97);
    --scrim:rgba(8,6,5,.78);
    --panel-bg:linear-gradient(180deg,#1b1714,#120f0d);
    --note:#c9bca7;
    --u-text:#9fd0b6; --r-text:#f0a79b; --l-text:#e8cc8e; --s-text:#e2cdf3;
```

Changer le sélecteur `:root{` en `:root,.ritual,.evostage{` — les scènes reprennent ainsi la palette sombre telle quelle (commentaire : *pourquoi*). Puis, juste après, le bloc clair :

```css
  /* Le clair : le même décor sur papier crème. L'or s'assombrit pour rester lisible sur fond
     clair ; chaque texte tient 4,5:1 sur la surface où il est posé. */
  :root[data-theme="light"]{
    --bg:#f6f0e2; --surface:#efe7d4; --surface-hi:#fbf6ea;
    --line:rgba(44,38,32,.10); --line-gold:rgba(154,122,53,.28);
    --fg:#2c2620; --fg-2:#5a5044; --fg-3:#6f6350; --gold:#7a5c22; --cream:#2c2620;
    --t-c:#665d53; --t-u:#4a6a42; --t-r:#9e3b2e; --t-l:#7a581a;
    --fg-title:#2c2620; --header-bg:rgba(246,240,226,.97); --scrim:rgba(44,38,32,.45);
    --panel-bg:linear-gradient(180deg,#fbf6ea,#f3ead6); --note:#5a5044;
    --u-text:#3f5d38; --r-text:#8f3427; --l-text:#6b4d15; --s-text:#6a3f94;
    --iris:radial-gradient(circle, rgba(143,91,196,.45), rgba(63,191,149,.2) 45%, transparent 70%);
  }
  :root[data-theme="light"] .rail-tab.active{color:#f6f0e2}
```

- [ ] **Step 3: remplacer les couleurs en dur du décor** (hors règles `.pkc*`, hors `.ritual`, `.reveal*`, `.evo*`, `.next-btn`, `.queue-note`, `.fx-*`) :
  - `#f4ecda` → `var(--fg-title)` ;
  - `color:#1a1410` → `color:var(--on-gold)` ;
  - `rgba(20,17,14,.97)` / `rgba(20,17,14,.85)` de `.rail` et de la barre mobile → `var(--header-bg)` (un aplat suffit) ;
  - `background:rgba(8,6,5,.78)` de `.scrim` → `var(--scrim)` ;
  - le `background` de `.panel` → `var(--panel-bg)` ;
  - `#c9bca7` → `var(--note)` ;
  - `#9fd0b6` → `var(--u-text)`, `#f0a79b` → `var(--r-text)`, `#e8cc8e` → `var(--l-text)`, `#e2cdf3` → `var(--s-text)`.

Vérifier avec `grep` que les seules occurrences restantes de ces valeurs sont dans `:root`, dans le bloc clair, ou dans les règles des scènes.

Run: `npm test` — Expected: PASS.

- [ ] **Step 4: commit** — `feat(ui): thème clair, le rituel reste une scène de nuit`.

---

### Task 3: les matières Onyx

**Files:**
- Modify: `src/styles.css` (règles `.pkc*` de la face avant ; le dos est la tâche 4)
- Modify: `src/components/PokeCard.vue` (retrait du cachet de cire)
- Test: `src/styles.test.js`, `src/components/PokeCard.test.js`

**Interfaces:**
- Produces: tokens de carte sur `.pkc` : `--card-a --card-b --card-c` (dégradé du carton), `--card-edge`, `--card-ink` (numéro, nom), `--card-ink-2` (source, palier commun), `--iris-blend`. Redéfinis sous `[data-theme="light"] .pkc`. Les teintes de palier de la carte restent `--t-c…--t-l`, redéclarées sur `.pkc`.

- [ ] **Step 1: tests**

`src/styles.test.js` — remplacer le test « redéclare sur la carte les tokens parchemin… » par :

```js
  /**
   * La carte suit le thème : carton noir en sombre, ivoire en clair. Ses matières lisent des
   * tokens qui lui sont propres, pour que le décor puisse changer sans toucher au carton.
   */
  it('donne à la carte des tokens Onyx, redéfinis en clair', () => {
    const sombre = regles.find((r) => r.selecteur === '.pkc' && /--card-a\s*:/.test(r.corps))
    const clair = regles.find((r) => r.selecteur === '[data-theme="light"] .pkc')
    expect(sombre).toBeDefined()
    expect(clair).toBeDefined()
    for (const t of ['--card-a', '--card-b', '--card-c', '--card-edge', '--card-ink', '--iris-blend']) {
      expect(sombre.corps).toMatch(new RegExp(`${t}\\s*:`))
      expect(clair.corps).toMatch(new RegExp(`${t}\\s*:`))
    }
    expect(sombre.corps).toMatch(/--iris-blend\s*:\s*screen/)
    expect(clair.corps).toMatch(/--iris-blend\s*:\s*multiply/)
  })
```

`src/components/PokeCard.test.js` — remplacer le test du cachet (lignes 43-48) par :

```js
  it('n’a plus de cachet de cire, à aucun palier', () => {
    for (const tier of ['c', 'u', 'r', 'l']) expect(mountCard({ tier }).find('.pkc-wax').exists()).toBe(false)
  })
```

Run — Expected: FAIL.

- [ ] **Step 2: retirer le cachet** — dans `PokeCard.vue`, supprimer `const sealed …` et son commentaire, et la ligne `<span v-if="sealed" class="pkc-wax">PR</span>`. Dans `styles.css`, supprimer `.pkc-wax{…}`, `.panel-card .pkc-wax{…}`.

- [ ] **Step 3: les tokens de carte** — remplacer la règle `.pkc{ --paper:… }` (tokens parchemin) par :

```css
  /* Onyx : la carte suit le thème. En sombre, un carton noir où le palier se lit dans le
     métal ; en clair, la même construction sur ivoire. Le décor change autour, la matière
     reste celle du palier. */
  .pkc{
    --card-a:#2a241f; --card-b:#17130f; --card-c:#1f1a15;
    --card-edge:rgba(239,230,207,.14);
    --card-ink:#f4ecda; --card-ink-2:#a89a85;
    --iris-blend:screen; --iris-op:.42;
    --t-c:#a39a8e; --t-u:#7fb59a; --t-r:#e0805a; --t-l:#d4b06a;
    --f-display:"Fraunces", Georgia, serif;
    --f-label:"Manrope", "Helvetica Neue", sans-serif;
    --f-data:"IBM Plex Mono", ui-monospace, monospace;
    color:var(--card-ink);font-family:var(--f-label);
  }
  [data-theme="light"] .pkc{
    --card-a:#fbf3df; --card-b:#efe3c4; --card-c:#e3d3ac;
    --card-edge:#c9a961;
    --card-ink:#2c2620; --card-ink-2:#6f6350;
    --iris-blend:multiply; --iris-op:.32;
    --t-c:#665d53; --t-u:#4a6a42; --t-r:#9e3b2e; --t-l:#7a581a;
  }
```

- [ ] **Step 4: la face** — remplacer `.pkc-face{…}` (fond et bordure) et les règles par palier :

```css
  .pkc-face{position:absolute;inset:0;overflow:hidden;display:flex;flex-direction:column;border-radius:10px;
    background:linear-gradient(168deg,var(--card-a),var(--card-b) 55%,var(--card-c));
    border:1px solid var(--card-edge);
    box-shadow:0 12px 30px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06)}
  .pkc-no{font-size:10px;letter-spacing:.04em;color:var(--card-ink-2)}
  .pkc-name{font-family:var(--f-display);font-size:20px;font-weight:600;line-height:1;color:var(--card-ink)}

  /* commun — carton nu, filet étain, aucun métal */
  .pkc[data-tier="c"] .pkc-frame{inset:9px;border:1px solid var(--t-c);opacity:.45;border-radius:5px}
  .pkc[data-tier="c"] .pkc-sheen{z-index:5;opacity:calc(.12 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 34%,rgba(255,255,255,.35) 50%,transparent 66%);
    background-size:340% 100%;background-position:calc((1 - var(--px,.5))*100%) 0}

  /* peu commun — trame pointillée verte, double filet */
  .pkc[data-tier="u"] .pkc-bg{z-index:1;opacity:.7;
    background-image:radial-gradient(circle,color-mix(in srgb,var(--t-u) 45%,transparent) .9px,transparent 1.4px),
                     radial-gradient(circle,color-mix(in srgb,var(--t-u) 25%,transparent) .7px,transparent 1.2px);
    background-size:7px 7px,7px 7px;background-position:0 0,3.5px 3.5px;
    -webkit-mask-image:radial-gradient(ellipse 66% 54% at 50% 45%,#000 22%,transparent 80%);
    mask-image:radial-gradient(ellipse 66% 54% at 50% 45%,#000 22%,transparent 80%)}
  .pkc[data-tier="u"] .pkc-frame{inset:9px;border-radius:5px;border:1px solid var(--t-u);opacity:.75;
    box-shadow:inset 0 0 0 3px var(--card-b),inset 0 0 0 4px color-mix(in srgb,var(--t-u) 40%,transparent)}
  .pkc[data-tier="u"] .pkc-sheen{z-index:5;opacity:calc(.2 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 36%,rgba(220,240,228,.5) 50%,transparent 62%);
    background-size:340% 100%;background-position:calc((1 - var(--px,.5))*100%) 0}

  /* rare — le carton prend le cuivre */
  .pkc[data-tier="r"]{--card-a:#4a2a20;--card-b:#24140f;--card-c:#3a2018;--card-edge:rgba(215,117,106,.5)}
  [data-theme="light"] .pkc[data-tier="r"]{--card-a:#f2dcb0;--card-b:#e6c98e;--card-c:#d6b273;--card-edge:#a8813f}
  .pkc[data-tier="r"] .pkc-frame{inset:9px;border-radius:5px;border:1px solid color-mix(in srgb,var(--t-r) 80%,transparent)}
  .pkc[data-tier="r"] .pkc-corner{border-color:var(--t-r);opacity:.9}
  .pkc[data-tier="r"] .pkc-sheen{z-index:5;opacity:calc(.4 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 32%,rgba(255,200,160,.12) 44%,rgba(255,220,190,.5) 50%,rgba(255,200,160,.12) 56%,transparent 68%);
    background-size:340% 100%;background-position:calc((1 - var(--px,.5))*100%) 0}

  /* légendaire — or guilloché, double dorure */
  .pkc[data-tier="l"]{--card-a:#3a2f1c;--card-b:#1b150c;--card-c:#2e2516;--card-edge:rgba(212,176,106,.75)}
  [data-theme="light"] .pkc[data-tier="l"]{--card-a:#fbf0d2;--card-b:#f2e2b4;--card-c:#e4d09b;--card-edge:#a8813f}
  .pkc[data-tier="l"] .pkc-bg{z-index:1;opacity:.55;
    background-image:repeating-conic-gradient(from 0deg at 50% 46%,color-mix(in srgb,var(--t-l) 40%,transparent) 0 2deg,transparent 2deg 8deg),
                     radial-gradient(circle at 50% 46%,color-mix(in srgb,var(--t-l) 25%,transparent),transparent 62%)}
  .pkc[data-tier="l"] .pkc-frame{inset:9px;border-radius:5px;border:1.5px solid var(--t-l);
    box-shadow:inset 0 0 0 4px var(--card-b),inset 0 0 0 5px color-mix(in srgb,var(--t-l) 50%,transparent)}
  .pkc[data-tier="l"] .pkc-corner{border-color:var(--t-l);border-width:1.5px;opacity:1;width:22px;height:22px}
  .pkc[data-tier="l"] .pkc-sheen{z-index:5;opacity:calc(.55 * var(--pkc-light,1));
    background-image:linear-gradient(102deg,transparent 30%,rgba(255,230,170,.12) 42%,rgba(255,240,200,.55) 49%,rgba(232,196,124,.6) 50%,rgba(255,240,200,.3) 52%,transparent 66%);
    background-size:340% 100%;background-position:calc((1 - var(--px,.5))*100%) 0}

  /* shiny — l'irisation éclaire en sombre, s'imprime en clair */
  .pkc-iris{z-index:6;mix-blend-mode:var(--iris-blend);opacity:0;transition:opacity .5s ease;
    background-image:repeating-linear-gradient(112deg,#d94f6a 0%,#d99a3f 9%,#3fbf95 18%,#4a86d9 27%,#8f5bc4 36%,#d94f6a 45%);
    background-size:300% 300%;background-position:calc(var(--px,.5)*100%) calc(var(--py,.5)*100%)}
  .pkc.is-shiny .pkc-iris{opacity:calc(var(--iris-op) * var(--pkc-iris,1))}
```

Garder sans changement : `.pkc{position:relative;width:266px;…}`, `.pkc.is-live`, `.pkc.is-flipped`, `.pkc-stage`, `.pkc-bg,.pkc-frame,…{position:absolute…}`, `.pkc-corner*` de position, `.pkc-top`, `.pkc-art*`, `.pkc-rule`, `.pkc-bot`, `.pkc-tier`, les halos `--pkc-halo`, `--pkc-light`, `.pkc.scene-night*`, `.pkc-front,.pkc-back{backface-visibility}`, `.pkc-front{transform}`. Supprimer les anciennes règles par palier, l'ancien `.pkc-iris`, `.pkc.is-shiny .pkc-iris`.

La règle `.pkc:focus-visible` passe de `var(--stamp)` à `var(--gold)` (le contour était à 2:1 sur le velours, mineur relevé à la relecture précédente).

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: commit** — `feat(cartes): matières Onyx, carton noir en sombre et ivoire en clair`.

---

### Task 4: le dos Onyx

**Files:**
- Modify: `src/components/PokeCard.vue` (dos, prop `secret`)
- Modify: `src/components/RitualOverlay.vue` (`:secret="stage === 'awaiting'"`)
- Modify: `src/styles.css` (règles `.pkc-back*`, `.pkc-lab*`, `.pkc-mark`)
- Test: `src/components/PokeCard.test.js`, `src/components/RitualOverlay.test.js`

**Interfaces:**
- Produces: `PokeCard` prop `secret: { type: Boolean, default: false }`. Classes du dos : `.pkc-back-head`, `.pkc-back-no`, `.pkc-back-date`, `.pkc-mark`, `.pkc-lab`, `.pkc-lab-ref`, `.pkc-lab-title`.

- [ ] **Step 1: tests**

`PokeCard.test.js` (la fonction de montage existante accepte `provenance`) :

```js
describe('le dos Onyx', () => {
  const prov = { ref: 'moi/atlas#153 · a3f8c21', label: 'fix: fuseau horaire', date: '2026-02-24' }

  it('affiche le numéro et la date en tête', () => {
    const w = mountCard({ speciesId: 4, provenance: prov })
    expect(w.find('.pkc-back-no').text()).toBe('Nº 004')
    expect(w.find('.pkc-back-date').text()).toBe('2026-02-24')
  })

  it('cache le numéro quand la carte est secrète', () => {
    const w = mountCard({ speciesId: 4, provenance: prov, secret: true })
    expect(w.find('.pkc-back-no').text()).toBe('Nº ···')
    expect(w.find('.pkc-back').text()).not.toContain('004')
  })

  it('porte le logo et la provenance, sans les restes du sachet', () => {
    const back = mountCard({ speciesId: 4, provenance: prov }).find('.pkc-back')
    expect(back.find('.pkc-mark').text()).toBe('PR·DEX')
    expect(back.find('.pkc-lab-ref').text()).toBe('moi/atlas#153 · a3f8c21')
    expect(back.text()).not.toContain('ouvert')
    expect(back.text()).not.toContain('Une PR mergée · un tirage')
  })
})
```

`RitualOverlay.test.js` :

```js
  it('ne dévoile pas le numéro au dos avant le retournement', () => {
    const w = mountRitual()
    expect(w.find('.pkc-back-no').text()).toBe('Nº ···')
  })
```

Run — Expected: FAIL.

- [ ] **Step 2: le gabarit** — dans `PokeCard.vue`, ajouter la prop :

```js
  // Dans le rituel, le dos se voit avant la face : le numéro d'espèce y vendrait la mèche.
  secret: { type: Boolean, default: false },
```

et remplacer le bloc du dos par :

```html
    <!-- Le dos, c'est ce qu'on voit avant de savoir : le logo d'abord, puis d'où vient la carte. -->
    <div v-if="provenance" class="pkc-face pkc-back" :aria-hidden="flipped ? null : 'true'">
      <div class="pkc-back-rosace"></div>
      <div class="pkc-back-head mono">
        <span class="pkc-back-no">Nº {{ secret ? '···' : pad(speciesId) }}</span>
        <span class="pkc-back-date">{{ provenance.date }}</span>
      </div>
      <span class="pkc-mark"><i>PR</i>·DEX</span>
      <div class="pkc-lab">
        <span class="pkc-lab-eyebrow">Provenance</span>
        <span v-if="provenance.ref" class="pkc-lab-ref mono">{{ provenance.ref }}</span>
        <span class="pkc-lab-title">{{ provenance.label }}</span>
      </div>
    </div>
```

`.pkc-mark` a pour texte `PR·DEX` (le `<i>` ne change pas le texte).

Dans `RitualOverlay.vue`, sur `<PokeCard>` : `:secret="stage === 'awaiting'"`.

- [ ] **Step 3: le CSS du dos** — remplacer `.pkc-back{…}` jusqu'à `.pkc-back-foot{…}` inclus par :

```css
  /* Le dos Onyx : un velours (ou un ivoire), une rosace gravée, le logo, puis la provenance. */
  .pkc-back{
    transform:rotateY(180deg);
    background:linear-gradient(168deg,var(--back-a,#1c1712),var(--back-b,#0f0c09));
    border:1px solid color-mix(in srgb,var(--back-gold,#d4b06a) 45%,transparent);
    padding:18px 16px;justify-content:space-between;align-items:center}
  [data-theme="light"] .pkc-back{--back-a:#fbf3df;--back-b:#efe3c4;--back-gold:#7a5c22}
  .pkc-back-rosace{position:absolute;inset:0;pointer-events:none;
    background-image:repeating-radial-gradient(circle at 50% 44%,color-mix(in srgb,var(--back-gold,#d4b06a) 14%,transparent) 0 1px,transparent 1px 9px);
    -webkit-mask-image:radial-gradient(circle at 50% 44%,#000 38%,transparent 74%);
    mask-image:radial-gradient(circle at 50% 44%,#000 38%,transparent 74%)}
  .pkc-back-head{position:relative;width:100%;display:flex;justify-content:space-between;font-size:9px;color:var(--card-ink-2)}
  .pkc-mark{position:relative;font-family:var(--f-display);font-weight:300;font-size:34px;letter-spacing:.02em;color:var(--back-gold,#d4b06a)}
  .pkc-mark i{font-weight:600}
  .pkc-lab{position:relative;width:100%;box-sizing:border-box;padding:10px 12px;border-radius:4px;
    border:1px solid color-mix(in srgb,var(--back-gold,#d4b06a) 35%,transparent);
    background:color-mix(in srgb,var(--back-b,#0f0c09) 85%,transparent);display:flex;flex-direction:column;gap:5px}
  .pkc-lab-eyebrow{font-family:var(--f-label);font-size:8px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--card-ink-2)}
  .pkc-lab-ref{font-size:9.5px;color:var(--card-ink-2);word-break:break-all}
  /* Un titre de PR dépasse volontiers quatre-vingt-dix caractères : il est tronqué net,
     jamais laissé déborder de l'étiquette. */
  .pkc-lab-title{font-family:var(--f-display);font-size:12.5px;line-height:1.35;color:var(--card-ink);
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
```

Conserver `.pkc-front,.pkc-back{backface-visibility:hidden}` : `.pkc-back` déclare toujours `transform`, le test de feuille de style le vérifie.

Run: `npm test` — Expected: PASS.

- [ ] **Step 4: commit** — `feat(cartes): dos Onyx — logo, numéro, date et PR, sans dévoiler l'espèce`.

---

### Task 5: vérification et documentation

**Files:**
- Modify: `README.md` (sections « L'ouverture » et « Le décor »)

- [ ] **Step 1: README** — dans « L'ouverture », remplacer la description des cartons (« papier pâle en commun, trame pointillée en peu commun, carton teinté ocre en rare, carton profond guilloché en légendaire ») par : « carton nu en commun, trame pointillée verte en peu commun, carton cuivré en rare, or guilloché en légendaire — sur un carton noir en thème sombre, ivoire en thème clair » ; et « Son dos porte la provenance » reste. Dans « Le décor », remplacer le paragraphe sur les tokens parchemin par : « La carte suit le thème : Onyx en sombre, ivoire en clair, avec le même métal par palier. Le rituel et l'évolution restent des scènes de nuit dans les deux thèmes. »

- [ ] **Step 2: navigateur** — `npm run dev -- --host`, `?demo`, en sombre puis en clair (bouton de l'en-tête), à 1280 et 390 px :
  1. planche (cases, pastilles, halos lisibles en clair) ;
  2. fiche d'un commun, d'un peu commun, d'un rare, d'un légendaire, d'un shiny : carton, métal, reflet au survol ;
  3. carte agrandie et son dos (logo, Nº, date, provenance) ;
  4. rituel : dos à « Nº ··· », retournement, fanfare légendaire ; scène noire en clair aussi ;
  5. équipe, stats, réglages, connexion ;
  6. pas de défilement horizontal ; recharger la page en clair ne clignote pas en sombre.

Noter dans le journal tout défaut corrigé, avec sa raison.

- [ ] **Step 3: commit et push** — `docs: README à jour pour les cartes Onyx et le thème clair`, puis `GS_REVIEW_BYPASS=1 git push`.
