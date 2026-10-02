# Refonte UI — direction Vitrine — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le décor parchemin par la scène Vitrine (velours sombre, or, Fraunces), avec la structure Studio (trois vues en onglets, barre d'outils avec recherche, pastilles de palier), sans toucher à la carte ni au rituel.

**Architecture:** La carte (`PokeCard.vue` et ses règles `.pkc*`) ne change pas : ses tokens parchemin sont redéclarés sur `.pkc`, le `:root` passe à la palette Vitrine. `App.vue` porte une vue courante (`collection | team | stats`) ; le panneau de classement est découpé en deux vues qui partagent un composable de chargement. La recherche est une fonction pure dans `useTrayFilters.js`, appliquée par `TheTray`. Les noms de classes utilisés par les tests existants (`.cell`, `.cell-no`, `.cell-dupes`, `.cell-evo`, `.cell-origin`, `.has`, `.ghost`, `.shiny`, `.legendary`, `.panel`, `.evo-btn`, `.evostage`, `.new-chip`, `.packet`, `.tray-empty`, `.filter-chip`, `.filter-reset`) sont gardés : on restyle, on ne renomme pas.

**Tech Stack:** Vue 3 (Composition API, SFC), Vite, Vitest + @vue/test-utils, CSS à la main dans `src/styles.css`. Aucune dépendance ajoutée.

**Spec:** `docs/superpowers/specs/2026-10-01-refonte-ui-vitrine-design.md`

## Global Constraints

- **Français** partout : tests, commentaires, commits, textes d'interface.
- **Pas de TypeScript**, pas de bloc `<style>` dans les SFC, pas de dépendance ajoutée.
- **Commentaires** : le *pourquoi*, jamais le *quoi*, au ton du projet.
- **`PokeCard.vue` n'est pas modifié.** Les règles `.pkc*` de `src/styles.css` (de `/* ───────── carte ─────────` jusqu'à `.pkc-back-foot`) ne sont pas modifiées non plus, sauf l'ajout des tokens parchemin sur `.pkc`.
- **`prefers-reduced-motion` n'est pas honoré** (décision `ac68ba4`) — ne pas l'ajouter.
- Palette exacte de la spec : `--bg:#14110e`, `--surface:#211c18`, `--surface-hi:#2b2520`, `--line:rgba(239,230,207,.10)`, `--line-gold:rgba(212,176,106,.16)`, `--fg:#efe7d8`, `--fg-2:#a89a85`, `--fg-3:#8a7d6b`, `--gold:#d4b06a`, `--gold-btn:linear-gradient(180deg,#e2c37c,#c99e4e)`, `--cream:#efe6cf`, paliers `#8a8175 / #7fb59a / #d7756a / #d4b06a`.
- Polices : Fraunces (titres), Manrope (interface), IBM Plex Mono (chiffres) ; les trois IBM Plex de la carte restent chargées.
- **Une seule PR.** Chaque tâche finit sur `npm test` au vert et un commit. Push avec `GS_REVIEW_BYPASS=1`.
- Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Recherche avec accents et majuscules mêlés** (« ÉVOLI », « nidoran ♀ », « mr mime » pour « M. Mime ») : la normalisation retire accents et casse, et ne garde que lettres et chiffres → test dans la tâche 2.
2. **Recherche par numéro avec zéros** (« 025 », « 25 », « #25 ») : les trois trouvent Pikachu → test dans la tâche 2.
3. **Changer de vue pendant qu'un overlay est ouvert** : impossible, puisque l'overlay est par-dessus l'en-tête ; mais Échap pendant qu'on est sur Équipe ne doit pas revenir à Collection → test dans la tâche 7.
4. **Vue Équipe ouverte sans client** (démo pas encore chargée) : la vue ne monte que si `dataClient` existe → garde dans `App.vue`, test dans la tâche 7.
5. **Une case à la fois légendaire et shiny** : un seul halo (irisé), cadre doré conservé → test dans la tâche 5.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `index.html` | **modifié** — polices Fraunces et Manrope |
| `src/styles.css` | **modifié** — `:root` Vitrine, tokens parchemin sur `.pkc`, tout le décor hors carte |
| `src/styles.test.js` | **modifié** — la carte garde ses tokens |
| `src/composables/useTrayFilters.js` / `.test.js` | **modifié** — `query`, `normalize`, `matchesQuery`, `open` retiré |
| `src/lib/leaderboard.js` / `.test.js` | **modifié** — `teamTotals` |
| `src/components/TheRail.vue` / `.test.js` | **modifié** — devient l'en-tête à onglets |
| `src/components/TheTray.vue` / `.test.js` | **modifié** — barre d'outils, recherche, pastilles, halos |
| `src/composables/useLeaderboardRows.js` / `.test.js` | **créé** — chargement, erreur, réessai des lignes du classement |
| `src/components/TeamView.vue` / `.test.js` | **créé** — classement et totaux d'équipe |
| `src/components/StatsView.vue` / `.test.js` | **créé** — mes stats |
| `src/components/LeaderboardPanel.vue` / `.test.js` | **supprimés** |
| `src/App.vue` / `src/App.test.js` | **modifiés** — `view`, rendu des vues, clavier |
| `src/components/SpeciesSheet.vue` / `.test.js` | **modifiés** — deux colonnes, `scene="night"` |
| `src/components/ConnectScreen.vue` / `.test.js` | **modifiés** — éventail de quatre cartes |
| `src/components/SettingsPanel.vue`, `RitualOverlay.vue`, `EvolutionOverlay.vue` | restylés par CSS ; balisage inchangé sauf mention |
| `README.md` | **modifié** — section « Le décor » |

---

### Task 1: les tokens Vitrine, la carte garde les siens

**Files:**
- Modify: `index.html:9`
- Modify: `src/styles.css:1-51` (le `:root`, `html,body`, `a`, `#app`, `.eyebrow`, `.mono`)
- Test: `src/styles.test.js`

**Interfaces:**
- Produces: les custom properties de la Global Constraints, disponibles partout ; `.pkc` redéclare `--paper --paper-lo --plate --plate-hi --ink --ink-2 --ink-3 --rule --rule-hi --stamp --ochre --herb --t-c --t-u --t-r --t-l` avec leurs valeurs parchemin actuelles, et `--f-display --f-label --f-data` aux polices IBM Plex.
- Produces: `--f-title:"Fraunces"…`, `--f-ui:"Manrope"…` pour le décor.

- [ ] **Step 1: le test qui échoue**

Ajouter dans `src/styles.test.js`, dans le `describe('feuille de style')` :

```js
  /**
   * La carte est un objet qui ne change pas avec le décor : ses matières lisent les tokens
   * parchemin. Le `:root` passe au velours ; si `.pkc` ne redéclarait pas ces tokens, le
   * carton du commun virerait au brun et l'ocre du rare se perdrait.
   */
  it('redéclare sur la carte les tokens parchemin, aux valeurs d’avant la refonte', () => {
    const carte = regles.find((r) => r.selecteur === '.pkc')
    expect(carte).toBeDefined()
    for (const [token, valeur] of [
      ['--paper', '#e7ddc7'], ['--paper-lo', '#ddd0b3'], ['--plate', '#f2ecda'], ['--plate-hi', '#fbf6e8'],
      ['--ink', '#2c2620'], ['--ink-2', '#6f6350'], ['--ink-3', '#9a8a6d'],
      ['--rule', '#c3b48f'], ['--rule-hi', '#b3a179'], ['--stamp', '#9e3b2e'], ['--ochre', '#b8862b'], ['--herb', '#5c7a52'],
      ['--t-c', '#8a8175'], ['--t-u', '#5c7a52'], ['--t-r', '#9e3b2e'], ['--t-l', '#b8862b'],
    ]) {
      expect(carte.corps).toMatch(new RegExp(`${token}\\s*:\\s*${valeur}`))
    }
  })

  it('pose la palette Vitrine sur :root', () => {
    const racine = regles.find((r) => r.selecteur === ':root')
    expect(racine.corps).toMatch(/--bg\s*:\s*#14110e/)
    expect(racine.corps).toMatch(/--gold\s*:\s*#d4b06a/)
    expect(racine.corps).toMatch(/--t-r\s*:\s*#d7756a/)
  })
```

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/styles.test.js`
Expected: FAIL — `expected undefined to be defined` (aucune règle `.pkc` ne porte les tokens) et `--bg` absent.

- [ ] **Step 3: les polices**

Dans `index.html`, remplacer la ligne `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono…` par :

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300;1,9..144,600&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=IBM+Plex+Serif:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 4: le `:root` Vitrine et la base**

Dans `src/styles.css`, remplacer tout le bloc `:root{ … }` (lignes 1 à 32 actuelles) par :

```css
  /* Le décor est un velours éclairé par le dessus : la lumière, c'est ce qu'on a gagné. Un
     seul accent, l'or, pour qu'il garde son poids — il dit « précieux », il ne décore pas. */
  :root{
    --bg:#14110e;
    --surface:#211c18;
    --surface-hi:#2b2520;
    --line:rgba(239,230,207,.10);
    --line-gold:rgba(212,176,106,.16);
    --fg:#efe7d8;
    --fg-2:#a89a85;
    --fg-3:#8a7d6b;
    --gold:#d4b06a;
    --gold-btn:linear-gradient(180deg,#e2c37c,#c99e4e);
    --cream:#efe6cf;
    --danger:#e07a6c;

    /* Les paliers du décor : les mêmes familles que sur la carte, remontées pour se lire sur
       le velours. La carte, elle, garde les siens (voir `.pkc`). */
    --t-c:#8a8175;
    --t-u:#7fb59a;
    --t-r:#d7756a;
    --t-l:#d4b06a;
    --iris:radial-gradient(circle, rgba(201,167,230,.7), rgba(63,191,149,.25) 45%, transparent 70%);

    /* Teintes de type, éclaircies pour le fond sombre. */
    --type-normal:#a39a8e;   --type-fire:#e0805a;     --type-water:#7fa3c4;
    --type-electric:#d8b44f; --type-grass:#8fb37f;    --type-ice:#94bcbc;
    --type-fighting:#c9786a; --type-poison:#a98bc0;   --type-ground:#c2a676;
    --type-flying:#a9aec8;   --type-psychic:#d0889d;  --type-bug:#a8b673;
    --type-rock:#b3a684;     --type-ghost:#9b90b3;    --type-dragon:#9493d1;
    --type-dark:#9a8f86;     --type-steel:#aeb2b8;    --type-fairy:#d39ab0;

    --f-title:"Fraunces", Georgia, serif;
    --f-ui:"Manrope", "Helvetica Neue", sans-serif;
    --f-data:"IBM Plex Mono", ui-monospace, monospace;
    --f-display:var(--f-title);
    --f-label:var(--f-ui);
  }
```

Remplacer le bloc `html,body{ … }` par :

```css
  html,body{
    color:var(--fg);font-family:var(--f-ui);-webkit-font-smoothing:antialiased;
    background-color:var(--bg);
    background-image:radial-gradient(ellipse 60% 40% at 50% -10%, rgba(212,176,106,.12), transparent 70%);
    background-attachment:fixed;
    min-height:100vh;
  }
```

Remplacer `a{…}`, `a:hover{…}`, `#app{…}`, `.eyebrow{…}` par :

```css
  a{color:var(--gold);text-decoration:none}
  a:hover{color:var(--fg)}
  #app{max-width:1280px;margin:0 auto;padding:0 48px 90px}
  .eyebrow{font-family:var(--f-ui);font-weight:700;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--fg-3)}
```

- [ ] **Step 5: les tokens parchemin sur la carte**

Juste avant la règle `.pkc{position:relative;width:266px;…}`, ajouter une règle `.pkc` distincte :

```css
  /* La carte garde son parchemin. Le décor a changé autour d'elle, pas sa matière : « une
     carte qui changerait d'identité entre l'écran où on la gagne et celui où on la retrouve
     ne se posséderait pas ». Ses tokens sont donc redéclarés ici, aux valeurs d'avant. */
  .pkc{
    --paper:#e7ddc7; --paper-lo:#ddd0b3; --plate:#f2ecda; --plate-hi:#fbf6e8;
    --ink:#2c2620; --ink-2:#6f6350; --ink-3:#9a8a6d;
    --rule:#c3b48f; --rule-hi:#b3a179; --stamp:#9e3b2e; --ochre:#b8862b; --herb:#5c7a52;
    --t-c:#8a8175; --t-u:#5c7a52; --t-r:#9e3b2e; --t-l:#b8862b;
    --f-display:"IBM Plex Serif", Georgia, serif;
    --f-label:"IBM Plex Sans Condensed", "Helvetica Neue", sans-serif;
    --f-data:"IBM Plex Mono", ui-monospace, monospace;
    color:var(--ink);font-family:var(--f-label);
  }
```

- [ ] **Step 6: vérifier le succès**

Run: `npx vitest run src/styles.test.js`
Expected: PASS, 3 tests. Puis `npm test` : la suite reste verte (aucun test n'inspecte les couleurs du décor).

- [ ] **Step 7: commit**

```bash
git add index.html src/styles.css src/styles.test.js
git commit -m "feat(ui): palette Vitrine, la carte garde ses tokens parchemin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: la recherche dans les filtres

**Files:**
- Modify: `src/composables/useTrayFilters.js`
- Test: `src/composables/useTrayFilters.test.js`

**Interfaces:**
- Produces: `normalize(s: string) → string` (minuscules, sans accents, seulement `[a-z0-9]`).
- Produces: `matchesQuery(id: number, query: string) → boolean`, pure, exportée.
- Produces: `useTrayFilters()` → `{ activeTiers, statusFilter, query, active, toggleTier, setStatusFilter, setQuery, reset }`. `open` disparaît.

- [ ] **Step 1: les tests qui échouent**

Ajouter à `src/composables/useTrayFilters.test.js` (l'import devient `import { useTrayFilters, matchesQuery, normalize } from './useTrayFilters.js'`) :

```js
describe('matchesQuery', () => {
  it('accepte tout quand la recherche est vide ou blanche', () => {
    expect(matchesQuery(25, '')).toBe(true)
    expect(matchesQuery(25, '   ')).toBe(true)
  })

  it('trouve par nom sans tenir compte de la casse ni des accents', () => {
    expect(matchesQuery(133, 'evoli')).toBe(true)
    expect(matchesQuery(133, 'ÉVOLI')).toBe(true)
    expect(matchesQuery(133, 'pika')).toBe(false)
  })

  it('trouve par morceau de nom', () => {
    expect(matchesQuery(25, 'chu')).toBe(true)
  })

  it('ignore la ponctuation et les symboles du nom', () => {
    expect(matchesQuery(122, 'mmime')).toBe(true) // M. Mime
    expect(matchesQuery(29, 'nidoran')).toBe(true) // Nidoran ♀
  })

  it('trouve par numéro, avec ou sans zéros ni dièse', () => {
    expect(matchesQuery(25, '25')).toBe(true)
    expect(matchesQuery(25, '025')).toBe(true)
    expect(matchesQuery(25, '#25')).toBe(true)
    expect(matchesQuery(99, '25')).toBe(false)
  })

  it('ne confond pas un numéro avec un morceau d’un autre numéro', () => {
    expect(matchesQuery(125, '25')).toBe(false)
  })
})

describe('normalize', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalize('Évoli')).toBe('evoli')
    expect(normalize('M. Mime')).toBe('mmime')
    expect(normalize('Nidoran ♀')).toBe('nidoran')
  })
})

describe('useTrayFilters — recherche', () => {
  it('part d’une recherche vide, inactive', () => {
    const f = useTrayFilters()
    expect(f.query.value).toBe('')
    expect(f.active.value).toBe(false)
  })

  it('se dit actif dès qu’une recherche est saisie', () => {
    const f = useTrayFilters()
    f.setQuery('pika')
    expect(f.active.value).toBe(true)
  })

  it('reset vide aussi la recherche', () => {
    const f = useTrayFilters()
    f.setQuery('pika')
    f.reset()
    expect(f.query.value).toBe('')
  })

  it('n’expose plus de panneau repliable', () => {
    expect(useTrayFilters().open).toBeUndefined()
  })
})
```

Retirer de ce fichier tout test existant qui lit `f.open` (le chercher avec `grep -n "open" src/composables/useTrayFilters.test.js`).

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/composables/useTrayFilters.test.js`
Expected: FAIL — `matchesQuery is not a function`.

- [ ] **Step 3: l'implémentation**

Remplacer `src/composables/useTrayFilters.js` par :

```js
import { ref, computed } from 'vue'
import { DEX, TIER_LABEL } from '../../shared/species.js'

const TIERS = Object.keys(TIER_LABEL)

/**
 * Minuscules, sans accents, sans rien d'autre que des lettres et des chiffres. « Évoli »,
 * « EVOLI » et « evoli » doivent se retrouver : personne ne tape l'accent d'un nom de Pokémon,
 * et « M. Mime » ou « Nidoran ♀ » portent des signes qu'on ne tape pas non plus.
 */
export function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Une recherche purement numérique est un numéro de Pokédex, comparé en entier : « 25 »,
 * « 025 » et « #25 » trouvent Pikachu, mais pas Élektek (125). Sinon, c'est un morceau de nom.
 */
export function matchesQuery(id, query) {
  const q = normalize(query ?? '')
  if (!q) return true
  if (/^\d+$/.test(q)) return Number(q) === id
  return normalize(DEX[id].name).includes(q)
}

/** État des filtres de la planche (paliers, statut, recherche). Pure UI, aucun effet de bord. */
export function useTrayFilters() {
  const activeTiers = ref(new Set(TIERS))
  const statusFilter = ref('all') // 'all' | 'caught' | 'uncaught' | 'evolvable'
  const query = ref('')

  const active = computed(
    () => activeTiers.value.size < TIERS.length || statusFilter.value !== 'all' || normalize(query.value) !== '',
  )

  // Ne jamais désactiver le dernier palier restant : un filtre qui vide la grille en
  // silence est pire qu'un clic ignoré.
  function toggleTier(t) {
    const next = new Set(activeTiers.value)
    if (next.has(t)) { if (next.size > 1) next.delete(t) } else next.add(t)
    activeTiers.value = next
  }

  function setStatusFilter(v) {
    statusFilter.value = v
  }

  function setQuery(v) {
    query.value = v
  }

  function reset() {
    activeTiers.value = new Set(TIERS)
    statusFilter.value = 'all'
    query.value = ''
  }

  return { activeTiers, statusFilter, query, active, toggleTier, setStatusFilter, setQuery, reset }
}
```

- [ ] **Step 4: vérifier le succès**

Run: `npx vitest run src/composables/useTrayFilters.test.js`
Expected: PASS. `npm test` échouera encore sur `App.vue` qui lit `filters.open` : c'est attendu, la tâche 7 le corrige. Vérifier que les seuls échecs sont dans `App.test.js` et `TheRail.test.js`.

Ruling attendu à noter : la suite n'est pas verte entre la tâche 2 et la tâche 7 ; les commits intermédiaires restent locaux et la PR n'est poussée qu'au vert.

- [ ] **Step 5: commit**

```bash
git add src/composables/useTrayFilters.js src/composables/useTrayFilters.test.js
git commit -m "feat(planche): recherche par nom ou numéro, sans casse ni accents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: les totaux d'équipe

**Files:**
- Modify: `src/lib/leaderboard.js`
- Test: `src/lib/leaderboard.test.js`

**Interfaces:**
- Consumes: `rankPlayers(rows, today)` (existant).
- Produces: `teamTotals(rows, today) → { collective: number, opened: number, shiny: number }`.

- [ ] **Step 1: les tests qui échouent**

Ajouter à `src/lib/leaderboard.test.js` (ajouter `teamTotals` à l'import) :

```js
describe('teamTotals', () => {
  it('somme plis ouverts et shiny, et dédoublonne le Pokédex collectif', () => {
    const t = teamTotals([
      row('a', [c('1', 1), c('2', 4, { shiny: true })]),
      row('b', [c('3', 4), c('4', 7)], [], true),
    ], TODAY)
    expect(t).toEqual({ collective: 3, opened: 4, shiny: 1 })
  })

  it('vaut zéro partout sans joueur', () => {
    expect(teamTotals([], TODAY)).toEqual({ collective: 0, opened: 0, shiny: 0 })
  })
})
```

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/lib/leaderboard.test.js`
Expected: FAIL — `teamTotals is not a function`.

- [ ] **Step 3: l'implémentation**

À la fin de `src/lib/leaderboard.js` :

```js
/**
 * Les trois chiffres d'en-tête de la vue Équipe. Le Pokédex collectif compte les espèces vues
 * par au moins un joueur : c'est l'objectif commun, celui où personne n'est dernier.
 */
export function teamTotals(rows, today) {
  const players = rankPlayers(rows, today)
  return {
    collective: new Set(players.flatMap((p) => p.speciesIds)).size,
    opened: players.reduce((n, p) => n + p.copies, 0),
    shiny: players.reduce((n, p) => n + p.shiny, 0),
  }
}
```

- [ ] **Step 4: vérifier le succès**

Run: `npx vitest run src/lib/leaderboard.test.js`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add src/lib/leaderboard.js src/lib/leaderboard.test.js
git commit -m "feat(équipe): totaux d'équipe pour l'en-tête du classement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: l'en-tête à onglets

**Files:**
- Modify: `src/components/TheRail.vue`
- Test: `src/components/TheRail.test.js`
- Modify: `src/styles.css` (section `/* ───────── rail ───────── */`, jusqu'à `@keyframes pulse`)

**Interfaces:**
- Produces: `TheRail` — props `caughtCount: Number`, `pendingCount: Number`, `syncing: Boolean`, `syncError: String|null`, `view: 'collection'|'team'|'stats'` (défaut `'collection'`) ; émet `open`, `settings`, `sync`, `navigate(view)`. Les props `filtersOpen`, `filtersActive` et les émissions `toggle-filters`, `leaderboard` disparaissent.
- Classes gardées : `.claim-btn`, `.pip`, `.gear`, `.sync`, `.spinning`, `.err-dot`. Nouvelles : `.rail-nav`, `.rail-tab` (avec `.active`).

- [ ] **Step 1: les tests**

Dans `src/components/TheRail.test.js` :
- supprimer le test `'émet leaderboard au clic sur le trophée'` ;
- supprimer tout le `describe` qui contient `'émet toggle-filters au clic'` (les tests `.filter-toggle`) ;
- ajouter :

```js
  describe('onglets', () => {
    const tab = (w, label) => w.findAll('.rail-tab').find((t) => t.text() === label)

    it('propose les trois vues dans une navigation', () => {
      const w = mountRail()
      expect(w.find('nav.rail-nav').exists()).toBe(true)
      expect(w.findAll('.rail-tab').map((t) => t.text())).toEqual(['Collection', 'Équipe', 'Mes stats'])
    })

    it('marque l’onglet courant, pour l’œil et pour les lecteurs d’écran', () => {
      const w = mountRail({ view: 'team' })
      expect(tab(w, 'Équipe').classes()).toContain('active')
      expect(tab(w, 'Équipe').attributes('aria-current')).toBe('page')
      expect(tab(w, 'Collection').attributes('aria-current')).toBeUndefined()
    })

    it('émet navigate avec la vue cliquée', async () => {
      const w = mountRail()
      await tab(w, 'Mes stats').trigger('click')
      expect(w.emitted('navigate')[0]).toEqual(['stats'])
    })

    it('n’a plus ni filtre ni trophée', () => {
      const w = mountRail()
      expect(w.find('.filter-toggle').exists()).toBe(false)
      expect(w.find('.trophy').exists()).toBe(false)
    })
  })
```

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/components/TheRail.test.js`
Expected: FAIL — `.rail-tab` introuvable.

- [ ] **Step 3: le composant**

Dans `src/components/TheRail.vue`, remplacer `defineProps`/`defineEmits` par :

```js
const props = defineProps({
  caughtCount: { type: Number, required: true },
  pendingCount: { type: Number, required: true },
  syncing: { type: Boolean, default: false },
  syncError: { type: String, default: null }, // 'offline' | 'server' | 'conflict' | 'revoked'
  view: { type: String, default: 'collection' }, // 'collection' | 'team' | 'stats'
})
const emit = defineEmits(['open', 'settings', 'sync', 'navigate'])

const TABS = [['collection', 'Collection'], ['team', 'Équipe'], ['stats', 'Mes stats']]
```

Et remplacer tout le `<template>` par :

```html
<template>
  <header class="rail">
    <div class="rail-brand">
      <div class="wordmark"><i>PR</i>·DEX</div>
      <div class="eyebrow rail-sub">Une PR mergée, un Pokémon</div>
    </div>
    <!-- Les vues sont des pages, pas des onglets d'une modale : une vraie navigation, avec
         l'onglet courant annoncé — c'était le défaut relevé sur le panneau de classement. -->
    <nav class="rail-nav" aria-label="Vues">
      <button
        v-for="[key, label] in TABS" :key="key" class="rail-tab" :class="{ active: view === key }"
        :aria-current="view === key ? 'page' : undefined" @click="emit('navigate', key)"
      >{{ label }}</button>
    </nav>
    <div class="progress">
      <span class="progress-count"><b>{{ caughtCount }}</b><i> / 151</i></span>
      <div class="bar"><div class="bar-fill" :style="{ width: (caughtCount / 151 * 100) + '%' }"></div></div>
    </div>
    <div class="rail-tools">
      <button class="claim-btn" :class="{ pulsing: pendingCount }" :disabled="!pendingCount" @click="$emit('open')">
        {{ pendingCount ? 'Ouvrir' : 'Rien à ouvrir' }}
        <span v-if="pendingCount" class="pip">{{ pendingCount }}</span>
      </button>
      <button class="gear sync" :title="syncTitle" :aria-label="syncTitle" :disabled="syncing || cooling" @click="triggerSync">
        <span :class="{ spinning: syncing }">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" aria-hidden="true"
          ><path d="M19 12A7 7 0 1 1 12 5"></path><polygon points="12 1.5 12 8.5 16.5 5" fill="currentColor"
            stroke="none"></polygon></svg>
        </span><span v-if="syncError" class="err-dot"></span>
      </button>
      <button class="gear" title="Réglages" aria-label="Réglages" @click="$emit('settings')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round" aria-hidden="true"
        ><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"></path></svg>
      </button>
    </div>
  </header>
</template>
```

Vérifier qu'aucun test existant ne repère encore le bouton réglages par son texte `⚙` (`grep -n "⚙" src`). S'il y en a un, le faire viser `[aria-label="Réglages"]`.

- [ ] **Step 4: le CSS de l'en-tête**

Dans `src/styles.css`, remplacer toute la section depuis `/* ───────── rail ───────── */` jusqu'à `@keyframes pulse{…}` inclus par :

```css
  /* ───────── en-tête ───────── */
  .rail{
    position:sticky;top:0;z-index:20;
    background:linear-gradient(180deg, rgba(20,17,14,.97) 60%, rgba(20,17,14,.85));
    backdrop-filter:blur(10px);
    border-bottom:1px solid var(--line-gold);
    padding:22px 0 18px;margin-bottom:22px;
    display:flex;align-items:center;gap:32px;flex-wrap:wrap;
  }
  .wordmark{font-family:var(--f-title);font-weight:300;font-size:30px;letter-spacing:-.02em;line-height:1;color:#f4ecda}
  .wordmark i{font-weight:600;color:var(--gold)}
  .rail-sub{margin-top:7px}
  .rail-nav{display:flex;gap:4px;padding:4px;border-radius:999px;background:rgba(239,230,207,.05);border:1px solid rgba(239,230,207,.08)}
  .rail-tab{font-family:var(--f-ui);font-size:12px;font-weight:600;letter-spacing:.04em;padding:8px 16px;border-radius:999px;
    border:0;background:transparent;color:var(--fg-2);cursor:pointer;transition:background .16s,color .16s}
  .rail-tab:hover{color:var(--fg)}
  .rail-tab.active{background:var(--cream);color:#1a1410;font-weight:700}
  .rail-tab:focus-visible,.gear:focus-visible,.claim-btn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .progress{flex:1;min-width:160px;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
  .progress-count{font-family:var(--f-title);font-size:24px;font-weight:300;line-height:1;color:#f4ecda}
  .progress-count b{font-weight:300}
  .progress-count i{font-style:normal;font-family:var(--f-ui);font-size:12px;letter-spacing:.1em;color:var(--fg-3)}
  .bar{width:180px;height:2px;background:rgba(212,176,106,.15);position:relative}
  .bar-fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#8a6f3a,var(--gold));box-shadow:0 0 10px rgba(212,176,106,.6);transition:width .8s cubic-bezier(.2,.8,.2,1)}
  .rail-tools{display:flex;align-items:center;gap:8px}
  .gear{
    position:relative;display:inline-flex;align-items:center;justify-content:center;
    border:1px solid rgba(212,176,106,.25);border-radius:50%;background:transparent;color:var(--gold);width:40px;height:40px;
    cursor:pointer;transition:background .16s,color .16s,border-color .16s;
  }
  .gear:hover:not(:disabled){background:rgba(212,176,106,.1);color:var(--fg)}
  .gear:disabled{cursor:default;opacity:.55}
  /* La rotation est sur le glyphe (span), pas sur le bouton entier : sinon la pastille
     d'erreur, positionnée dans un coin du bouton, tournait avec tout le bloc. Le SVG est
     carré et symétrique, donc le pivot tombe au centre de l'anneau. */
  .gear.sync span:not(.err-dot){display:inline-flex;line-height:0}
  .gear.sync span.spinning{color:var(--fg);animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .err-dot{position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:50%;background:var(--danger);box-shadow:0 0 0 2px var(--bg)}

  .claim-btn{
    position:relative;border:0;border-radius:999px;background:var(--gold-btn);color:#1a1410;
    font-family:var(--f-ui);font-weight:700;font-size:12px;letter-spacing:.18em;text-transform:uppercase;
    padding:13px 22px;cursor:pointer;display:inline-flex;align-items:center;gap:10px;
    box-shadow:0 10px 30px rgba(212,176,106,.25);transition:filter .16s;
  }
  .claim-btn:hover:not(:disabled){filter:brightness(1.06)}
  .claim-btn:disabled{background:transparent;border:1px solid var(--line);color:var(--fg-3);box-shadow:none;cursor:default}
  .claim-btn .pip{display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#1a1410;color:#e2c37c;font-family:var(--f-data);font-size:11px;font-weight:600;letter-spacing:0}
  .claim-btn.pulsing{animation:pulse 2.6s ease-in-out infinite}
  @keyframes pulse{0%,100%{box-shadow:0 10px 30px rgba(212,176,106,.25)}50%{box-shadow:0 10px 30px rgba(212,176,106,.25),0 0 0 6px rgba(212,176,106,.14)}}
```

- [ ] **Step 5: vérifier le succès**

Run: `npx vitest run src/components/TheRail.test.js`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/components/TheRail.vue src/components/TheRail.test.js src/styles.css
git commit -m "feat(ui): l'en-tête porte les trois vues, le filtre et le trophée en sortent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: la planche — barre d'outils, cases, halos

**Files:**
- Modify: `src/components/TheTray.vue`
- Test: `src/components/TheTray.test.js`
- Modify: `src/styles.css` (section `/* ───────── tiroir ───────── */` jusqu'à `.cell-evo{…}`)

**Interfaces:**
- Consumes: `matchesQuery(id, query)` (tâche 2).
- Produces: `TheTray` — props `bySpecies`, `copies`, `evolvable`, `activeTiers`, `statusFilter`, `query: String` (défaut `''`) ; émet `select`, `toggle-tier`, `set-status-filter`, `set-query(string)`, `reset-filters`. La prop `filtersOpen` disparaît : la barre est toujours là.
- Classes : `.toolbar`, `.tray-search` (input), `.filter-chip` (gardée), `.filter-reset` (gardée), `.cell-pill` (nouvelle, avec `.u` `.r` `.l`), `.cell-halo` (nouvelle, avec `.l` `.s`). Les modificateurs de case `.has`, `.ghost`, `.shiny`, `.legendary` sont gardés ; `.rare` est ajouté.

- [ ] **Step 1: les tests**

Dans `src/components/TheTray.test.js` :
- `mountFiltered` devient `(props) => mount(TheTray, { props: { bySpecies: {}, ...props } })` ;
- supprimer `'ne rend pas le panneau quand filtersOpen est faux'` et `'rend le panneau quand filtersOpen est vrai'` ;
- dans `'émet set-status-filter au clic sur un chip de statut'`, rien ne change ;
- ajouter dans `describe('filtres')` :

```js
    it('affiche toujours la barre d’outils, sans panneau à ouvrir', () => {
      expect(mountTray({}).find('.toolbar').exists()).toBe(true)
      expect(mountTray({}).find('.tray-search').exists()).toBe(true)
    })

    it('nomme le filtre des non-capturées « Manquants »', () => {
      expect(chipByText(mountFiltered(), 'Manquants')).toBeDefined()
    })

    it('émet set-query à la saisie, sans filtrer elle-même', async () => {
      const w = mountFiltered()
      await w.find('.tray-search').setValue('pika')
      expect(w.emitted('set-query').at(-1)).toEqual(['pika'])
    })

    it('ne garde que les espèces qui répondent à la recherche', () => {
      const w = mountFiltered({ query: 'evoli' })
      expect(w.findAll('.cell')).toHaveLength(1)
      expect(w.find('.cell-no').text()).toBe('133')
    })

    it('croise la recherche avec les paliers', () => {
      expect(mountFiltered({ query: 'pika', activeTiers: new Set(['l']) }).findAll('.cell')).toHaveLength(0)
    })

    it('dit qu’aucun Pokémon ne correspond et propose d’effacer', async () => {
      const w = mountFiltered({ query: 'zzz' })
      expect(w.find('.tray-empty').text()).toContain('Aucun Pokémon ne correspond')
      await w.find('.tray-empty .filter-reset').trigger('click')
      expect(w.emitted('reset-filters')).toBeTruthy()
    })
```

- ajouter hors du `describe('filtres')` :

```js
  describe('pastilles et halos', () => {
    it('nomme le palier d’une capture peu commune, rare ou légendaire', () => {
      const w = mountTray({ 37: [entry('a', 37)], 4: [entry('b', 4)], 144: [entry('c', 144)] })
      expect(w.findAll('.cell')[36].find('.cell-pill').text()).toBe('Peu c.')
      expect(w.findAll('.cell')[3].find('.cell-pill').text()).toBe('Rare')
      expect(w.findAll('.cell')[143].find('.cell-pill').text()).toBe('Légende')
    })

    it('ne met pas de pastille sur une capture commune', () => {
      expect(mountTray({ 25: [entry('a', 25)] }).findAll('.cell')[24].find('.cell-pill').exists()).toBe(false)
    })

    it('ne met pas de pastille sur une silhouette', () => {
      expect(mountTray({}).findAll('.cell')[143].find('.cell-pill').exists()).toBe(false)
    })

    it('donne un halo doré à une légendaire capturée', () => {
      const halo = mountTray({ 144: [entry('a', 144)] }).findAll('.cell')[143].find('.cell-halo')
      expect(halo.classes()).toContain('l')
    })

    it('donne un seul halo, irisé, à une légendaire shiny', () => {
      const cell = mountTray({ 144: [entry('a', 144, { shiny: true })] }).findAll('.cell')[143]
      expect(cell.findAll('.cell-halo')).toHaveLength(1)
      expect(cell.find('.cell-halo').classes()).toContain('s')
      expect(cell.classes()).toContain('legendary')
    })

    it('ne montre pas ↑ sur une case shiny, même évoluable', () => {
      const cell = mountTray({ 10: [entry('a', 10, { shiny: true })] }, new Set([10])).findAll('.cell')[9]
      expect(cell.find('.cell-evo').exists()).toBe(false)
      expect(cell.classes()).toContain('shiny')
    })

    it('marque une rare capturée pour son cadre', () => {
      expect(mountTray({ 4: [entry('a', 4)] }).findAll('.cell')[3].classes()).toContain('rare')
    })
  })
```

Remplacer aussi le test `'marque une case dont l’espèce peut évoluer maintenant'` : il reste valide (capture non shiny). Rien à changer.

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/components/TheTray.test.js`
Expected: FAIL — `.toolbar` introuvable, `.cell-pill` introuvable.

- [ ] **Step 3: le composant**

Dans `src/components/TheTray.vue` :

Props et émissions :

```js
import { computed } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'
import { matchesQuery } from '../composables/useTrayFilters.js'

const props = defineProps({
  bySpecies: { type: Object, required: true },
  // Exemplaires disponibles par espèce (après consommation par des évolutions) — à défaut,
  // retombe sur le total brut de `bySpecies` (rétrocompatible avec un appelant qui ne le passe pas).
  copies: { type: Object, default: () => ({}) },
  evolvable: { type: Set, default: () => new Set() },
  activeTiers: { type: Set, default: () => new Set(['c', 'u', 'r', 'l']) },
  statusFilter: { type: String, default: 'all' }, // 'all' | 'caught' | 'uncaught' | 'evolvable'
  query: { type: String, default: '' },
})
const emit = defineEmits(['select', 'toggle-tier', 'set-status-filter', 'set-query', 'reset-filters'])

// Libellés courts : la pastille tient dans le coin d'une case de 90 px. Le commun n'en a pas —
// c'est la case par défaut, la nommer chargerait la grille pour rien.
const PILL = { u: 'Peu c.', r: 'Rare', l: 'Légende' }
```

`hasActiveFilters` tient compte de la recherche :

```js
const hasActiveFilters = computed(
  () => props.activeTiers.size < TIERS.length || props.statusFilter !== 'all' || props.query.trim() !== '',
)
```

Dans `visibleIds`, ajouter en première ligne du `filter` :

```js
    if (!matchesQuery(id, props.query)) return false
```

`emptyLabel` devient :

```js
const emptyLabel = computed(() => {
  if (visibleIds.value.length > 0) return null
  if (props.query.trim()) return 'Aucun Pokémon ne correspond'
  const seulementEvolvable = props.statusFilter === 'evolvable'
    && props.activeTiers.size === TIERS.length
  return seulementEvolvable
    ? 'Rien à faire évoluer pour l’instant : il faut un exemplaire disponible, assez de bonbons, et une forme évoluée encore absente du Pokédex.'
    : 'Aucune espèce ne répond à ces filtres.'
})

const evolvableCount = computed(() => props.evolvable.size)
const tierOf = (id) => DEX[id].tier
// Un seul halo par case : l'irisé du shiny l'emporte. Deux halos superposés se mêleraient en
// une tache sans couleur, et le cadre doré dit déjà le légendaire.
const haloOf = (id) => {
  if (!props.bySpecies[id]) return null
  if (isShiny(props.bySpecies[id])) return 's'
  return tierOf(id) === 'l' ? 'l' : null
}
```

Le `<template>` complet :

```html
<template>
  <div class="toolbar">
    <label class="tray-search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
      <span class="sr-only">Chercher un Pokémon</span>
      <input
        class="tray-search" type="search" placeholder="Chercher un Pokémon" :value="query"
        @input="emit('set-query', $event.target.value)"
      >
    </label>
    <div class="filter-group">
      <button class="filter-chip" :class="{ active: statusFilter === 'all' }" @click="emit('set-status-filter', 'all')">Tous</button>
      <button class="filter-chip" :class="{ active: statusFilter === 'caught' }" @click="emit('set-status-filter', 'caught')">Capturés</button>
      <button class="filter-chip" :class="{ active: statusFilter === 'uncaught' }" @click="emit('set-status-filter', 'uncaught')">Manquants</button>
    </div>
    <span class="toolbar-sep" aria-hidden="true"></span>
    <div class="filter-group">
      <button
        v-for="t in TIERS" :key="t" class="filter-chip tier-chip"
        :class="{ active: activeTiers.has(t) }" :style="{ '--tier': TIER_VAR[t] }"
        :aria-pressed="activeTiers.has(t)" @click="emit('toggle-tier', t)"
      >{{ TIER_LABEL[t] }}</button>
    </div>
    <span class="toolbar-grow"></span>
    <button v-if="hasActiveFilters" class="filter-reset" @click="emit('reset-filters')">Réinitialiser</button>
    <button
      class="filter-chip chip-evo" :class="{ active: statusFilter === 'evolvable' }"
      title="Espèces qui ont de quoi évoluer maintenant vers une forme qui manque encore"
      @click="emit('set-status-filter', 'evolvable')"
    >Évoluables · {{ evolvableCount }}</button>
  </div>

  <div class="tray">
    <button
      v-for="id in visibleIds" :key="id" class="cell"
      :class="{
        has: bySpecies[id], ghost: !bySpecies[id], shiny: isShiny(bySpecies[id]),
        legendary: bySpecies[id] && tierOf(id) === 'l',
        rare: bySpecies[id] && tierOf(id) === 'r',
      }"
      :style="{ '--tier': TIER_VAR[tierOf(id)] }"
      :disabled="!bySpecies[id]"
      @click="$emit('select', id)"
    >
      <span v-if="haloOf(id)" class="cell-halo" :class="haloOf(id)"></span>
      <span class="cell-no mono">{{ String(id).padStart(3, '0') }}</span>
      <span v-if="bySpecies[id]" class="cell-origin mono">
        {{ bySpecies[id][0].via === 'catch' ? bySpecies[id][0].source : 'évolué' }}
      </span>
      <span v-if="bySpecies[id] && PILL[tierOf(id)]" class="cell-pill" :class="tierOf(id)">{{ PILL[tierOf(id)] }}</span>
      <img
        :src="spriteUrl(id, isShiny(bySpecies[id]))" :alt="DEX[id].name" loading="lazy"
        @error="$event.target.dataset.broken = '1'"
      >
      <span v-if="copyCount(id) > 1" class="cell-dupes mono">×{{ copyCount(id) }}</span>
      <span v-if="isShiny(bySpecies[id])" class="cell-shiny" aria-label="chromatique">✦</span>
      <span v-else-if="evolvable.has(id)" class="cell-evo" title="Peut évoluer vers une forme manquante">↑</span>
    </button>
  </div>

  <p v-if="emptyLabel" class="tray-empty">
    {{ emptyLabel }}
    <button v-if="query.trim()" class="filter-reset" @click="emit('reset-filters')">Effacer les filtres</button>
  </p>
</template>
```

Le test existant `'ne garde que les espèces évoluables via le prop statusFilter'` cherche `.cell-evo` sur Bulbizarre non shiny : il reste vert. Le test `'marque une espèce dont au moins une capture est chromatique'` lit `.classes()` : vert.

- [ ] **Step 4: le CSS de la planche**

Remplacer la section depuis `/* ───────── tiroir ───────── */` jusqu'à `.cell-evo{…}` incluse par :

```css
  /* ───────── planche ───────── */
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:20px}
  .toolbar-sep{width:1px;height:20px;background:var(--line);margin:0 4px}
  .toolbar-grow{flex:1}
  .filter-group{display:flex;gap:6px;flex-wrap:wrap}
  .tray-search-wrap{display:flex;align-items:center;gap:8px;border:1px solid rgba(239,230,207,.12);border-radius:999px;padding:0 14px;height:38px;width:220px;color:var(--fg-3)}
  .tray-search-wrap:focus-within{border-color:var(--gold)}
  .tray-search{border:0;outline:0;background:transparent;color:var(--fg);font:inherit;font-size:13px;width:100%}
  .tray-search::placeholder{color:var(--fg-3)}
  /* Coché vs non coché doit se lire d'un regard : plein crème contre contour discret. */
  .filter-chip{
    font-family:var(--f-ui);font-size:12px;font-weight:600;
    padding:0 13px;height:34px;border:1px solid rgba(239,230,207,.12);border-radius:999px;background:transparent;
    color:var(--fg-2);cursor:pointer;display:inline-flex;align-items:center;gap:7px;
    transition:border-color .15s,color .15s,background-color .15s;
  }
  .filter-chip:hover{color:var(--fg);border-color:rgba(239,230,207,.24)}
  .filter-chip.active{background:var(--cream);border-color:var(--cream);color:#1a1410}
  .filter-chip:focus-visible,.filter-reset:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  /* Le palier garde son point de couleur coché ou non : c'est lui qu'on cherche du regard. */
  .tier-chip::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--tier)}
  .tier-chip.active{background:transparent;border-color:var(--tier);color:var(--fg)}
  .tier-chip:not(.active){opacity:.55}
  /* « Évoluables » reprend la flèche et le vert du badge de la case : même signe des deux côtés. */
  .chip-evo{color:#9fd0b6;border-color:rgba(127,181,154,.3)}
  .chip-evo.active{background:rgba(127,181,154,.18);border-color:#7fb59a;color:#cfe8da}
  .filter-reset{font-family:var(--f-ui);font-size:12px;font-weight:600;color:var(--fg-3);background:none;border:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
  .filter-reset:hover{color:var(--gold)}

  .tray{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:14px}
  .tray-empty{font-family:var(--f-ui);font-size:13px;color:var(--fg-2);text-align:center;padding:40px 12px;margin:0;display:flex;flex-direction:column;align-items:center;gap:10px}
  .cell{
    position:relative;aspect-ratio:1;border-radius:8px;padding:0;cursor:default;
    background:var(--surface);border:1px solid rgba(255,255,255,.04);
    display:flex;align-items:center;justify-content:center;transition:border-color .16s,background .16s;
  }
  .cell.has{cursor:pointer;background:linear-gradient(180deg,var(--surface-hi),var(--surface));border-color:var(--line);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
  .cell.has:hover{border-color:rgba(212,176,106,.45)}
  .cell.has:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .cell.rare{border-color:rgba(215,117,106,.35)}
  .cell.legendary{border-color:rgba(212,176,106,.6);box-shadow:inset 0 0 0 1px rgba(212,176,106,.2),0 0 18px rgba(212,176,106,.18)}
  /* Le halo dit d'un coup d'œil ce qui est précieux dans la grille pleine. Or pour le
     légendaire ; l'irisé, réservé au chromatique — l'or étant libéré, le rouge tampon
     d'avant n'a plus de raison d'être. */
  .cell-halo{position:absolute;inset:8px;border-radius:50%;z-index:0;pointer-events:none;opacity:.55}
  .cell-halo.l{background:radial-gradient(circle,rgba(212,176,106,.85),transparent 68%)}
  .cell-halo.s{background:var(--iris)}
  .cell img{width:66%;height:66%;object-fit:contain;transition:transform .18s;position:relative;z-index:1}
  .cell img[data-broken]{opacity:.18;filter:grayscale(1)}
  .cell.has:hover img{transform:scale(1.08) translateY(-2px)}
  .cell-no{position:absolute;left:10px;top:8px;font-family:var(--f-ui);font-size:10px;font-weight:600;letter-spacing:.12em;color:var(--fg-3);transition:opacity .16s;z-index:2}
  .cell.has:hover .cell-no{opacity:0}
  .cell-origin{position:absolute;left:10px;top:8px;font-family:var(--f-data);font-size:10px;color:var(--gold);opacity:0;transition:opacity .16s;z-index:2}
  .cell.has:hover .cell-origin{opacity:1}
  .cell-pill{position:absolute;right:8px;top:7px;z-index:2;font-family:var(--f-ui);font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:3px 7px;border-radius:999px}
  .cell-pill.u{background:rgba(127,181,154,.14);color:#9fd0b6}
  .cell-pill.r{background:rgba(215,117,106,.16);color:#f0a79b}
  .cell-pill.l{background:rgba(212,176,106,.2);color:#e8cc8e}
  .cell-dupes{position:absolute;left:10px;bottom:8px;z-index:2;font-family:var(--f-ui);font-size:10px;font-weight:700;color:var(--gold)}
  .cell-shiny{position:absolute;right:10px;bottom:7px;z-index:2;font-size:12px;color:#e8cc8e;text-shadow:0 0 8px rgba(201,167,230,.9)}
  .cell-evo{position:absolute;right:9px;bottom:8px;z-index:2;width:16px;height:16px;border-radius:50%;background:rgba(127,181,154,.2);color:#9fd0b6;display:grid;place-items:center;font-size:10px;font-weight:700}
  /* Silhouette éteinte : la case vide se lit comme un emplacement, pas comme une erreur. */
  .cell.ghost img{filter:grayscale(1) brightness(.3) contrast(1.1);opacity:.45}
  .cell.ghost .cell-no{color:#4a423b}
```

- [ ] **Step 5: vérifier le succès**

Run: `npx vitest run src/components/TheTray.test.js`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/components/TheTray.vue src/components/TheTray.test.js src/styles.css
git commit -m "feat(planche): barre d'outils avec recherche, pastilles de palier, halos or et irisé

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: les vues Équipe et Mes stats

**Files:**
- Create: `src/composables/useLeaderboardRows.js`, `src/composables/useLeaderboardRows.test.js`
- Create: `src/components/TeamView.vue`, `src/components/TeamView.test.js`
- Create: `src/components/StatsView.vue`, `src/components/StatsView.test.js`
- Delete: `src/components/LeaderboardPanel.vue`, `src/components/LeaderboardPanel.test.js`
- Modify: `src/styles.css` (remplacer le bloc `/* Classement — une plaque sombre…` jusqu'à la fin de son `@media (max-width:640px){…}`)

**Interfaces:**
- Consumes: `client.readLeaderboard()`, `rankPlayers`, `myStats`, `teamTotals`, `TIER_VAR`.
- Produces: `useLeaderboardRows(client) → { rows: Ref<Array|null>, loading: Ref<boolean>, error: Ref<string|null>, load: () => Promise<void> }`. Charge au `onMounted` du composant appelant.
- Produces: `TeamView` — props `client: Object`, `today: String`. `StatsView` — mêmes props. Ni l'une ni l'autre n'émet.
- Classes gardées de l'ancien panneau, pour réutiliser les tests : `.board-loading`, `.board-error`, `.board-empty`, `.board-table`, `.board-login`, `.board-detail`, `.board-rank`, `tr.me`, `[data-stat="…"] .stat-value`.

- [ ] **Step 1: les tests**

`src/composables/useLeaderboardRows.test.js` :

```js
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useLeaderboardRows } from './useLeaderboardRows.js'
import { SupabaseDataError } from '../lib/supabaseData.js'

const host = (client) => {
  let api
  const w = mount(defineComponent({ setup() { api = useLeaderboardRows(client); return () => h('div') } }))
  return { w, api: () => api }
}

describe('useLeaderboardRows', () => {
  it('est en chargement dès le premier rendu, puis porte les lignes', async () => {
    const { api } = host({ readLeaderboard: vi.fn().mockResolvedValue([{ login: 'a' }]) })
    expect(api().loading.value).toBe(true)
    await flushPromises()
    expect(api().loading.value).toBe(false)
    expect(api().rows.value).toEqual([{ login: 'a' }])
  })

  it('garde le message d’erreur et repart de zéro au réessai', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new SupabaseDataError('offline', 'Pas de connexion réseau.'))
      .mockResolvedValueOnce([])
    const { api } = host({ readLeaderboard: read })
    await flushPromises()
    expect(api().error.value).toBe('Pas de connexion réseau.')
    await api().load()
    expect(api().error.value).toBeNull()
    expect(api().rows.value).toEqual([])
  })
})
```

`src/components/TeamView.test.js` — reprendre de `LeaderboardPanel.test.js` les tests de chargement, ligne `me`, erreur et réessai, tableau vide, ligne de détail, en remplaçant `LeaderboardPanel` par `TeamView` et en retirant tout clic sur `.board-tab` ; ajouter :

```js
  it('affiche en tête les trois chiffres d’équipe', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    expect(w.find('[data-total="collective"]').text()).toContain('3')
    expect(w.find('[data-total="opened"]').text()).toContain('4')
    expect(w.find('[data-total="shiny"]').text()).toContain('1')
  })
```

avec `const mountView = (readLeaderboard) => mount(TeamView, { props: { client: { readLeaderboard }, today: TODAY } })` et les mêmes `ROWS` que l'ancien fichier (lea : 1, 4, 7 ; moi : 1 shiny) — Pokédex collectif 3, plis ouverts 4, shiny 1.

`src/components/StatsView.test.js` :

```js
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StatsView from './StatsView.vue'

const TODAY = '2026-09-30'
const c = (id, species, shiny = false) => ({ source: 'github', external_id: id, species, shiny, date: '2026-09-01' })
const ROWS = [
  { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1), c('b', 4), c('d', 7)], evolutions: [] },
  { login: 'moi', avatar_url: 'me.png', is_me: true, catches: [c('e', 1, true)], evolutions: [] },
]
const mountView = (readLeaderboard) => mount(StatsView, { props: { client: { readLeaderboard }, today: TODAY } })

describe('StatsView', () => {
  it('montre les stats du joueur courant seulement', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    expect(w.find('[data-stat="opened"] .stat-value').text()).toBe('1')
    expect(w.find('[data-stat="shiny"] .stat-value').text()).toContain('1 sur 1')
    expect(w.find('[data-stat="species"] .stat-value').text()).toBe('1 / 151')
  })

  it('invite à retourner une carte quand le joueur n’a aucune ligne', async () => {
    const w = mountView(vi.fn().mockResolvedValue([ROWS[0]]))
    await flushPromises()
    expect(w.find('.board-empty').text()).toContain('Retourne une carte')
  })

  it('affiche l’erreur et réessaie', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(ROWS)
    const w = mountView(read)
    await flushPromises()
    await w.find('.board-error button').trigger('click')
    await flushPromises()
    expect(w.find('[data-stat="opened"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/composables/useLeaderboardRows.test.js src/components/TeamView.test.js src/components/StatsView.test.js`
Expected: FAIL — fichiers introuvables.

- [ ] **Step 3: le composable**

`src/composables/useLeaderboardRows.js` :

```js
import { ref, onMounted } from 'vue'

/**
 * Les lignes du classement, rechargées à chaque montage — la vue est démontée quand on la
 * quitte, donc y revenir relit la base, comme rouvrir l'ancien panneau. Pas de cache : les
 * données tiennent en quelques Ko et un classement périmé se voit tout de suite.
 */
export function useLeaderboardRows(client) {
  const rows = ref(null)
  // À `true` dès le premier rendu : `onMounted` n'a pas encore tourné à cet instant, et un
  // tableau vide affiché un tick se lirait « personne n'a rien ouvert ».
  const loading = ref(true)
  const error = ref(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      rows.value = await client.readLeaderboard()
    } catch (e) {
      error.value = e.message ?? 'Le chargement a échoué.'
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
  return { rows, loading, error, load }
}
```

- [ ] **Step 4: `TeamView.vue`**

```vue
<script setup>
import { ref, computed } from 'vue'
import { rankPlayers, teamTotals } from '../lib/leaderboard.js'
import { TIER_VAR } from '../../shared/species.js'
import { useLeaderboardRows } from '../composables/useLeaderboardRows.js'

const props = defineProps({
  client: { type: Object, required: true },
  today: { type: String, required: true },
})

const { rows, loading, error, load } = useLeaderboardRows(props.client)
const players = computed(() => (rows.value ? rankPlayers(rows.value, props.today) : []))
const totals = computed(() => (rows.value ? teamTotals(rows.value, props.today) : null))

const COLUMNS = [
  ['species', 'Espèces'], ['shiny', 'Shiny'], ['legendaries', 'Légend.'], ['rares', 'Rares'],
  ['lineages', 'Lignées'], ['copies', 'Exempl.'], ['recent', '30 jours'],
]
// Sur un écran étroit, seules ces colonnes restent visibles ; les autres se déplient au toucher.
const PRIMARY = new Set(['species', 'shiny'])
const expanded = ref(null)
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Tableau des scores</div>
        <h1 class="view-title">Qui a le plus <i>de Pokémon</i></h1>
      </div>
      <div v-if="totals" class="view-totals">
        <div data-total="collective"><div class="eyebrow">Pokédex collectif</div><div class="view-num">{{ totals.collective }} <small>/ 151</small></div></div>
        <div data-total="opened"><div class="eyebrow">Plis ouverts</div><div class="view-num">{{ totals.opened }}</div></div>
        <div data-total="shiny"><div class="eyebrow">Shiny</div><div class="view-num gold">{{ totals.shiny }}</div></div>
      </div>
    </div>

    <div v-if="loading" class="board-loading">Chargement…</div>
    <div v-else-if="error" class="board-error">
      <p>{{ error }}</p>
      <button class="btn-ghost" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!players.length" class="board-empty">
      Personne n'a encore retourné de carte. Le classement commence à la première.
    </p>

    <table v-else class="board-table">
      <thead>
        <tr>
          <th class="board-rank">#</th>
          <th class="board-who">Joueur</th>
          <th v-for="[key, label] in COLUMNS" :key="key" :class="{ secondary: !PRIMARY.has(key) }">{{ label }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="p in players" :key="p.rank">
          <tr :class="{ me: p.isMe }" @click="expanded = expanded === p.rank ? null : p.rank">
            <td class="board-rank">{{ p.rank }}</td>
            <td class="board-who">
              <span class="board-who-in">
                <img v-if="p.avatarUrl" class="board-avatar" :src="p.avatarUrl" alt="">
                <span v-else class="board-avatar">{{ p.login[0]?.toUpperCase() }}</span>
                <span class="board-login">{{ p.login }}</span>
              </span>
            </td>
            <td v-for="[key] in COLUMNS" :key="key" class="mono" :class="{ secondary: !PRIMARY.has(key), lead: key === 'species' }">
              <span v-if="key === 'legendaries'" class="board-dot" :style="{ background: TIER_VAR.l }"></span>
              <span v-else-if="key === 'rares'" class="board-dot" :style="{ background: TIER_VAR.r }"></span>
              {{ p[key] }}
            </td>
          </tr>
          <!-- Les colonnes masquées en étroit, avec leur libellé : des nombres seuls, sans
               en-tête au-dessus, ne se liraient pas. Rendue partout, visible seulement en étroit. -->
          <tr v-if="expanded === p.rank" class="board-detail" :class="{ me: p.isMe }">
            <td :colspan="2 + COLUMNS.length">
              <span v-for="[key, label] in COLUMNS.filter(([k]) => !PRIMARY.has(k))" :key="key" class="board-detail-item">
                <span class="board-detail-label">{{ label }}</span> <b class="mono">{{ p[key] }}</b>
              </span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </section>
</template>
```

Ruling attendu : la clé `v-for` passe du login au rang. Deux comptes « inconnu » (mineur relevé sur la PR #19) avaient la même clé ; le rang est unique.

- [ ] **Step 5: `StatsView.vue`**

```vue
<script setup>
import { computed } from 'vue'
import { myStats } from '../lib/leaderboard.js'
import { TIER_VAR } from '../../shared/species.js'
import { useLeaderboardRows } from '../composables/useLeaderboardRows.js'

const props = defineProps({
  client: { type: Object, required: true },
  today: { type: String, required: true },
})

const { rows, loading, error, load } = useLeaderboardRows(props.client)
const stats = computed(() => (rows.value ? myStats(rows.value, props.today) : null))

const fmtPct = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
// « 0 sur N » plutôt qu'une division par zéro : le nombre dit la taille de l'échantillon.
const fmtOneIn = (s, total) => (s.oneIn ? `1 sur ${s.oneIn}` : `0 sur ${total}`)
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Mes stats</div>
        <h1 class="view-title">Ce que <i>tes PR</i> ont tiré</h1>
      </div>
    </div>

    <div v-if="loading" class="board-loading">Chargement…</div>
    <div v-else-if="error" class="board-error">
      <p>{{ error }}</p>
      <button class="btn-ghost" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!stats" class="board-empty">Retourne une carte pour voir tes stats.</p>

    <dl v-else class="board-stats">
      <div data-stat="opened"><dt>Plis ouverts</dt><dd class="stat-value">{{ stats.opened }}</dd></div>
      <div data-stat="species"><dt>Espèces</dt><dd class="stat-value">{{ stats.species }} / 151</dd></div>
      <div v-for="t in stats.tiers" :key="t.tier" :data-stat="'tier-' + t.tier">
        <dt><span class="board-dot" :style="{ background: TIER_VAR[t.tier] }"></span>{{ t.label }}</dt>
        <dd class="stat-value">{{ t.count }} <small>{{ fmtPct(t.pct) }}</small></dd>
      </div>
      <div data-stat="shiny">
        <dt>Shiny</dt>
        <dd class="stat-value">{{ stats.shiny.count }} <small>{{ fmtOneIn(stats.shiny, stats.opened) }}</small></dd>
      </div>
      <div data-stat="evolved"><dt>Pokémon évolués</dt><dd class="stat-value">{{ stats.evolved }}</dd></div>
    </dl>
  </section>
</template>
```

Le test `StatsView` attend `'1 sur 1'` dans `.stat-value` du shiny : le texte est « 1 1 sur 1 », `toContain` passe.

- [ ] **Step 6: supprimer l'ancien panneau**

```bash
git rm src/components/LeaderboardPanel.vue src/components/LeaderboardPanel.test.js
```

- [ ] **Step 7: le CSS des vues**

Remplacer dans `src/styles.css` tout le bloc qui commence par `/* Classement — une plaque sombre, le seul écran où l'on regarde les autres.` jusqu'à la fin du `@media (max-width:640px){ .board-table … }` qui le suit, par :

```css
  /* ───────── vues Équipe et Mes stats ───────── */
  .view{padding:8px 0 40px}
  .view-head{display:flex;align-items:flex-end;gap:40px;flex-wrap:wrap;margin-bottom:28px}
  .view-title{font-family:var(--f-title);font-weight:300;font-size:44px;letter-spacing:-.02em;line-height:1;color:#f4ecda;margin-top:10px}
  .view-title i{font-weight:600;color:var(--gold)}
  .view-totals{display:flex;gap:40px;margin-left:auto}
  .view-num{font-family:var(--f-title);font-weight:300;font-size:30px;color:#f4ecda;margin-top:6px}
  .view-num small{font-family:var(--f-ui);font-size:13px;color:var(--fg-3)}
  .view-num.gold{color:var(--gold)}
  .board-loading,.board-empty,.board-error{padding:48px 0;text-align:center;color:var(--fg-2)}
  .board-error p{margin:0 0 14px}
  .board-table{width:100%;border-collapse:collapse;font-size:14px}
  .board-table th{font-family:var(--f-ui);font-weight:700;font-size:10px;letter-spacing:.2em;text-transform:uppercase;
    color:var(--fg-3);text-align:right;padding:0 10px 12px;border-bottom:1px solid rgba(212,176,106,.2);white-space:nowrap}
  .board-table td{padding:16px 10px;text-align:right;border-bottom:1px solid rgba(212,176,106,.1);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--fg)}
  .board-table th.board-who,.board-table td.board-who{text-align:left}
  .board-table td.lead{font-size:18px;color:#f4ecda}
  .board-rank{width:48px;text-align:left !important;font-family:var(--f-title);font-weight:300;font-size:28px;color:var(--gold)}
  .board-who-in{display:inline-flex;align-items:center;gap:14px}
  .board-avatar{width:34px;height:34px;border-radius:50%;object-fit:cover;background:var(--surface-hi);border:1px solid rgba(212,176,106,.3);
    display:inline-grid;place-items:center;font-size:13px;font-weight:700;color:var(--gold)}
  .board-login{font-weight:600}
  .board-table tr.me td{background:linear-gradient(90deg,rgba(212,176,106,.12),rgba(212,176,106,.04))}
  .board-table tr.me .board-login{color:var(--gold)}
  .board-table tr.me .board-login::after{content:" · toi";font-weight:400;color:var(--fg-3)}
  .board-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:8px;vertical-align:2px}
  .board-detail{display:none}
  .board-detail td{text-align:left;padding-top:4px;color:var(--fg-3);font-size:12px;white-space:normal}
  .board-detail-item{display:inline-block;margin-right:14px}
  .board-detail-item b{color:var(--fg)}
  .board-stats{display:grid;gap:0;max-width:560px}
  .board-stats > div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:16px 4px;border-bottom:1px solid rgba(212,176,106,.1)}
  .board-stats dt{color:var(--fg);font-size:14px}
  .board-stats dd{margin:0;font-family:var(--f-title);font-weight:300;font-size:24px;color:#f4ecda;font-variant-numeric:tabular-nums}
  .board-stats small{font-family:var(--f-ui);color:var(--fg-3);font-size:12px;margin-left:8px}
```

- [ ] **Step 8: vérifier le succès**

Run: `npx vitest run src/composables/useLeaderboardRows.test.js src/components/TeamView.test.js src/components/StatsView.test.js`
Expected: PASS.

- [ ] **Step 9: commit**

```bash
git add -A src/composables/useLeaderboardRows.js src/composables/useLeaderboardRows.test.js src/components/TeamView.vue src/components/TeamView.test.js src/components/StatsView.vue src/components/StatsView.test.js src/components/LeaderboardPanel.vue src/components/LeaderboardPanel.test.js src/styles.css
git commit -m "feat(ui): Équipe et Mes stats deviennent des vues, le panneau de classement disparaît

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `App.vue` — la vue courante et le clavier

**Files:**
- Modify: `src/App.vue`
- Test: `src/App.test.js`
- Modify: `src/styles.css` (bloc mobile `@media (max-width:640px)` final, grille responsive)

**Interfaces:**
- Consumes: `TheRail` (`view`, `navigate`), `TheTray` (`query`, `set-query`), `TeamView`, `StatsView`, `useTrayFilters()` (sans `open`).
- Produces: `view: Ref<'collection'|'team'|'stats'>` dans `App.vue`.

- [ ] **Step 1: les tests**

Ajouter à `src/App.test.js` :

```js
describe('vues', () => {
  const tab = (w, label) => w.findAll('.rail-tab').find((t) => t.text() === label)

  it('ouvre sur la collection', async () => {
    const w = await mountApp()
    expect(tab(w, 'Collection').classes()).toContain('active')
    expect(w.find('.tray').exists()).toBe(true)
  })

  it('passe à l’équipe au clic sur l’onglet, et la planche disparaît', async () => {
    const w = await mountApp()
    await tab(w, 'Équipe').trigger('click')
    await flushPromises()
    expect(w.find('.tray').exists()).toBe(false)
    expect(w.find('.view-title').text()).toContain('Qui a le plus')
  })

  it('Échap ne change pas de vue', async () => {
    const w = await mountApp()
    await tab(w, 'Équipe').trigger('click')
    press('Escape')
    await flushPromises()
    expect(tab(w, 'Équipe').classes()).toContain('active')
  })

  it('Espace n’ouvre pas de pli depuis l’équipe', async () => {
    const w = await mountApp()
    await tab(w, 'Équipe').trigger('click')
    document.activeElement?.blur()
    press(' ')
    await flushPromises()
    expect(w.find('.ritual').exists()).toBe(false)
  })

  it('Espace ouvre toujours un pli depuis la collection', async () => {
    const w = await mountApp()
    document.activeElement?.blur()
    press(' ')
    await flushPromises()
    expect(w.find('.ritual').exists()).toBe(true)
  })
})
```

Chercher dans `src/App.test.js` tout usage de `.filter-toggle`, `leaderboard`, `.board-tab` ou `.trophy` (`grep -n "filter-toggle\|trophy\|board-tab\|leaderboard" src/App.test.js`) et le supprimer.

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/App.test.js`
Expected: FAIL — `.rail-tab` sans `active` piloté, `view-title` introuvable.

- [ ] **Step 3: `App.vue`**

Imports : retirer `LeaderboardPanel`, ajouter

```js
import TeamView from './components/TeamView.vue'
import StatsView from './components/StatsView.vue'
```

État : remplacer `const leaderboardOpen = ref(false)` par

```js
// Une vue est une page, pas un overlay : elle ne bloque pas le clavier et Échap ne la ferme
// pas. Rien n'est mémorisé d'un chargement à l'autre, on revient toujours à la planche.
const view = ref('collection')
```

`overlayOpen` redevient :

```js
const overlayOpen = computed(() =>
  Boolean(ritualEntry.value || evoAnim.value || selected.value || settingsOpen.value),
)
```

`closeTopOverlay` : supprimer la ligne `else if (leaderboardOpen.value) leaderboardOpen.value = false`, et dans le commentaire au-dessus, remplacer « puis réglages, classement et fiche (40) » par « puis réglages et fiche (40) ».

`useKeyboardNav` : Espace n'ouvre un pli que depuis la planche.

```js
useKeyboardNav({
  blocked: overlayOpen,
  // Espace ouvre le prochain pli depuis la planche seulement : depuis Équipe ou Mes stats, on
  // regarde les autres ou ses chiffres, un rituel qui surgit y serait un accident.
  onSpace: () => { if (view.value === 'collection') openRitual() },
  onEscape: closeTopOverlay,
})
```

Template — `TheRail` :

```html
    <TheRail
      :caught-count="collection.dex.caughtCount.value"
      :pending-count="collection.dex.pending.value.length"
      :syncing="collection.loading.value" :sync-error="collection.error.value"
      :view="view"
      @open="openRitual" @settings="settingsOpen = true" @sync="collection.refresh"
      @navigate="(v) => (view = v)"
    />
```

`TheTray` et les vues :

```html
    <TheTray
      v-if="view === 'collection'"
      :by-species="collection.dex.bySpecies.value" :copies="copiesById" :evolvable="collection.dex.evolvableIds.value"
      :active-tiers="filters.activeTiers.value" :status-filter="filters.statusFilter.value" :query="filters.query.value"
      @select="(id) => (selected = id)"
      @toggle-tier="filters.toggleTier" @set-status-filter="filters.setStatusFilter"
      @set-query="filters.setQuery" @reset-filters="filters.reset"
    />
    <!-- Sans client, rien à lire : la démo se charge d'un `import()` dynamique, et un clic sur
         un onglet pendant ce temps ne doit pas monter une vue qui planterait sur `null`. -->
    <TeamView v-else-if="view === 'team' && dataClient" :client="dataClient" :today="today" />
    <StatsView v-else-if="view === 'stats' && dataClient" :client="dataClient" :today="today" />
```

Supprimer le bloc `<transition name="fade"><LeaderboardPanel … /></transition>`.

Vérifier que `today` existe toujours (déclaré en tâche précédente de la PR #19) ; sinon l'ajouter :

```js
const today = new Date().toISOString().slice(0, 10)
```

- [ ] **Step 4: la grille et le mobile**

Dans `src/styles.css`, remplacer le bloc `@media (max-width:640px){ .tray{…} .rail{…} .panel-top{…} .reveal-name{…} }` par :

```css
  @media (max-width:1024px){
    .tray{grid-template-columns:repeat(6,minmax(0,1fr))}
    .view-totals{margin-left:0}
  }
  /* Étroit : les onglets descendent en barre fixe en bas d'écran, là où le pouce les trouve.
     L'en-tête garde le logo, le compteur, Ouvrir, la sync et les réglages. */
  @media (max-width:640px){
    #app{padding:0 16px calc(90px + env(safe-area-inset-bottom))}
    .rail{gap:12px;padding:14px 0 12px}
    .rail-sub{display:none}
    .wordmark{font-size:24px}
    .progress{min-width:0;flex:1}
    .bar{width:100%}
    .rail-nav{position:fixed;left:0;right:0;bottom:0;z-index:30;border-radius:0;border:0;border-top:1px solid var(--line-gold);
      background:rgba(20,17,14,.97);backdrop-filter:blur(10px);padding:8px 12px calc(8px + env(safe-area-inset-bottom));
      justify-content:space-around;height:auto}
    .rail-tab{flex:1;height:48px}
    .claim-btn{padding:11px 16px;letter-spacing:.12em}
    .tray-search-wrap{width:100%}
    .toolbar-grow,.toolbar-sep{display:none}
    .tray{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .cell-pill{display:none}
    .view-title{font-size:32px}
    .view-totals{gap:24px}
    .board-table .secondary{display:none}
    .board-table tbody tr{cursor:pointer}
    .board-detail{display:table-row}
    .reveal-name{font-size:30px}
  }
```

Ruling attendu : en 4 colonnes, la pastille de palier ne tient pas dans une case de ~80 px sans masquer le sprite ; elle est masquée sous 640 px, le cadre et le halo portent encore le palier.

- [ ] **Step 5: vérifier le succès**

Run: `npm test`
Expected: PASS, toute la suite. C'est le premier point vert depuis la tâche 2.

- [ ] **Step 6: commit**

```bash
git add src/App.vue src/App.test.js src/styles.css
git commit -m "feat(ui): trois vues dans l'app, Espace n'ouvre de pli que depuis la planche

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: la fiche d'espèce en deux colonnes

**Files:**
- Modify: `src/components/SpeciesSheet.vue`
- Test: `src/components/SpeciesSheet.test.js`
- Modify: `src/styles.css` (section `/* ───────── fiche ───────── */` jusqu'à `.press span{…}`, hors règles `.pkc*`)

**Interfaces:**
- Consumes: aucune nouvelle. Props et émissions de `SpeciesSheet` inchangées.
- Classes gardées : `.scrim`, `.panel`, `.panel-card`, `.panel-art`, `.panel-name`, `.panel-plate`, `.chip`, `.shiny-chip`, `.type-chip`, `.x`, `.sect`, `.sect-h`, `.log*`, `.line*`, `.candy*`, `.cbar*`, `.evo-btn`, `.evo-choice*`, `.picker-*`, `.cancel-btn`, `.reserve*`, `.press`, `.dexnote`, `.zoom-*`. Nouvelles : `.sheet-grid`, `.sheet-side`, `.sheet-main`.

- [ ] **Step 1: le test**

Dans `src/components/SpeciesSheet.test.js`, dans `describe('la carte de la fiche')`, le commentaire et le premier test deviennent :

```js
  // La carte gagnée au tirage est celle qu'on retrouve ici : même composant, même matière,
  // et désormais même lumière — la fiche est posée sur le velours, comme le rituel.
  it('montre la même carte que le rituel, sous la même lumière de nuit', () => {
    const w = mountSheet({ id: 6, entries: [capture('a', 6)] })
    const carte = w.findComponent({ name: 'PokeCard' })
    expect(carte.props('scene')).toBe('night')
    expect(carte.props('tier')).toBe(DEX[6].tier)
    // On consulte une espèce, pas un exemplaire daté : pas de dos, donc pas de provenance.
    expect(carte.props('provenance')).toBeNull()
  })

  it('pose la carte à gauche et le texte à droite', () => {
    const w = mountSheet({ id: 6, entries: [capture('a', 6)] })
    expect(w.find('.sheet-side .panel-card').exists()).toBe(true)
    expect(w.find('.sheet-main .panel-name').exists()).toBe(true)
  })

  it('agrandit la carte sous la même lumière', async () => {
    const w = mountSheet({ id: 6, entries: [capture('a', 6)] })
    await w.findComponent({ name: 'PokeCard' }).vm.$emit('activate')
    const cartes = w.findAllComponents({ name: 'PokeCard' })
    expect(cartes.at(-1).props('scene')).toBe('night')
  })
```

- [ ] **Step 2: vérifier l'échec**

Run: `npx vitest run src/components/SpeciesSheet.test.js`
Expected: FAIL — `expected 'day' to be 'night'`.

- [ ] **Step 3: le gabarit**

Dans `src/components/SpeciesSheet.vue`, les deux `scene="day"` deviennent `scene="night"`, et le commentaire au-dessus de la carte devient :

```html
        <!-- Capturée, l'espèce se montre sous la forme où on l'a gagnée : sa carte, sous la
             même lumière que le rituel puisque la fiche est elle aussi posée sur le velours.
             Non capturée, elle reste une silhouette — pas d'exemplaire, donc pas de carte. -->
```

Restructurer le haut du `.panel` :

```html
    <div class="panel" :style="{ '--tier': TIER_VAR[species.tier] }">
      <button class="x" aria-label="Fermer" @click="$emit('close')">✕</button>
      <div class="sheet-grid">
        <div class="sheet-side">
          <!-- (le commentaire ci-dessus) -->
          <div v-if="caught" class="pkc-stage panel-card">
            <PokeCard
              :species-id="id" :tier="species.tier" :shiny="shiny" scene="night"
              @activate="zoomed = true"
            />
          </div>
          <div v-else class="panel-art ghost" :tabindex="-1">
            <img :src="spriteUrl(id, shiny)" :alt="species.name" @error="$event.target.dataset.broken = '1'">
          </div>
        </div>
        <div class="sheet-main">
          <div class="panel-top">
            <span class="panel-plate">Planche nº {{ pad(id) }}<template v-if="caught"> · {{ availableCopies }} exemplaire{{ availableCopies > 1 ? 's' : '' }}</template></span>
            <h2 class="panel-name">{{ caught ? species.name : '—————' }}</h2>
            <div class="panel-chips">
              <span class="chip">{{ TIER_LABEL[species.tier] }}</span>
              <span v-if="shiny" class="chip shiny-chip">✦ Chromatique</span>
              <span
                v-for="t in (caught ? info?.types ?? [] : [])" :key="t.slug"
                class="type-chip" :style="{ '--type': `var(--type-${t.slug})` }"
              >{{ t.name }}</span>
            </div>
          </div>
          <!-- toutes les sections .sect existantes, dans le même ordre, sans changement -->
        </div>
      </div>
    </div>
```

Déplacer la section « Notice » (`dexnote`) en tête de `.sheet-main`, juste après `.panel-top` : c'est la phrase qu'on lit en premier dans la maquette. Les autres sections gardent leur ordre. Le bloc `zoom-scrim` reste en dehors de `.panel`, inchangé sauf `scene="night"`.

Le compteur `copies-count` du journal reste (un test peut le lire) ; vérifier avec `grep -n "copies-count" src`.

- [ ] **Step 4: le CSS de la fiche**

Remplacer la section depuis `/* ───────── fiche ───────── */` jusqu'à `.x:hover{…}` (avant le bloc des vues de la tâche 6), puis depuis `.sect{padding:…}` jusqu'à `.press span{…}`, par :

```css
  /* ───────── fiche ───────── */
  .scrim{position:fixed;inset:0;z-index:40;background:rgba(8,6,5,.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px}
  .panel{
    position:relative;width:min(1040px,100%);max-height:90vh;overflow:auto;border-radius:10px;
    background:linear-gradient(180deg,#1b1714,#120f0d);color:var(--fg);
    border:1px solid rgba(212,176,106,.22);box-shadow:0 40px 100px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.05);
  }
  .sheet-grid{display:grid;grid-template-columns:400px 1fr}
  /* La carte est posée sous un projecteur : un cône de lumière dorée, rien d'autre. */
  .sheet-side{display:flex;align-items:center;justify-content:center;padding:44px 24px;
    background:radial-gradient(ellipse 70% 60% at 50% 40%,rgba(212,176,106,.2),transparent 72%);border-right:1px solid rgba(212,176,106,.12)}
  .sheet-main{padding:40px 44px 32px 36px;min-width:0}
  .panel-top{padding:0 0 22px;border-bottom:1px solid rgba(212,176,106,.14)}
  .panel-art{width:180px;height:180px;display:grid;place-items:center;border-radius:10px;background:var(--surface)}
  .panel-art img{width:80%;height:80%;object-fit:contain}
  .panel-art img[data-broken]{opacity:.18;filter:grayscale(1)}
  .panel-art.ghost img{filter:grayscale(1) brightness(.3);opacity:.45}
  .panel-card{cursor:zoom-in}
  .panel-card .pkc{width:240px;height:336px}
  .panel-card .pkc-art img{width:124px;height:124px}
  .panel-card .pkc-name{font-size:18px}
  .panel-card .pkc-wax{width:30px;height:30px;right:14px;bottom:46px;font-size:8px}

  .zoom-scrim{position:fixed;inset:0;z-index:50;cursor:zoom-out;background:rgba(6,5,4,.88);backdrop-filter:blur(3px);
    display:flex;align-items:center;justify-content:center;padding:20px}
  .zoom-card{display:flex;flex-direction:column;align-items:center;gap:16px;cursor:default}
  .zoom-card .pkc{width:min(330px,78vw);height:min(462px,109vw)}
  .zoom-card .pkc-art img{width:172px;height:172px}
  .zoom-card .pkc-name{font-size:25px}
  .zoom-card .pkc-lab-title{font-size:14.5px}
  .zoom-hint{font-family:var(--f-ui);font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--fg-3)}

  .panel-plate{font-family:var(--f-ui);font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--fg-3)}
  .panel-name{font-family:var(--f-title);font-size:46px;font-weight:300;letter-spacing:-.02em;line-height:1;margin:12px 0 16px;color:#f4ecda}
  .panel-chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip{display:inline-block;font-family:var(--f-ui);font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
    padding:6px 12px;border-radius:999px;border:1px solid var(--tier);color:var(--tier);background:transparent}
  .chip.shiny-chip{border-color:#c9a7e6;color:#e2cdf3}
  .chip.new-chip{border-color:#9fd0b6;color:#9fd0b6}
  .type-chip{display:inline-block;font-family:var(--f-ui);font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
    padding:6px 12px;border-radius:999px;border:1px solid var(--type);color:var(--type)}
  .x{position:absolute;right:20px;top:18px;z-index:2;width:40px;height:40px;border-radius:50%;
    border:1px solid rgba(212,176,106,.25);background:transparent;color:var(--gold);font-size:14px;cursor:pointer;line-height:1}
  .x:hover{color:var(--fg);background:rgba(212,176,106,.1)}
  .x:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

  .sect{padding:22px 0;border-bottom:1px solid rgba(212,176,106,.12)}
  .sect:last-child{border-bottom:0}
  .sect-h{margin-bottom:14px;display:flex;justify-content:space-between;align-items:baseline}
  .copies-count{font-family:var(--f-data);font-size:11px;color:var(--gold)}
  .dexnote{font-family:var(--f-title);font-weight:300;font-size:18px;line-height:1.55;color:#c9bca7;margin:22px 0 0;max-width:52ch}

  .log{display:flex;flex-direction:column}
  .log-row{display:flex;gap:13px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--line);color:var(--fg)}
  .log-row:last-child{border-bottom:0}
  a.log-row:hover .log-title{color:var(--gold)}
  .log-sha{font-family:var(--f-data);font-size:11px;color:var(--gold);flex-shrink:0}
  .log-title{font-size:13.5px;line-height:1.4;flex:1;transition:color .15s}
  .log-repo{font-family:var(--f-data);font-size:11px;color:var(--fg-3)}
  .log-date{font-family:var(--f-data);font-size:11px;color:var(--fg-3);flex-shrink:0}
  .log-evo{font-family:var(--f-data);font-size:11px;color:#9fd0b6;flex-shrink:0}

  /* Lignée : les formes vues sont éclairées, les autres restent éteintes. */
  .line{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
  .line-step{display:flex;gap:8px;flex-wrap:wrap}
  .line-cell{width:84px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:8px;
    background:var(--surface-hi);border:1px solid var(--line)}
  .line-cell.here{border-color:var(--gold);background:radial-gradient(circle,rgba(212,176,106,.2),transparent 70%),var(--surface-hi)}
  .line-cell img{width:52px;height:52px;object-fit:contain}
  .line-cell.unseen{background:var(--surface)}
  .line-cell.unseen img{filter:grayscale(1) brightness(.3);opacity:.5}
  .line-name{font-family:var(--f-ui);font-size:11px;font-weight:600;color:var(--fg-2);text-align:center;line-height:1.25}
  .line-here{font-family:var(--f-ui);font-size:9px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
  .line-arrow{display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:28px;font-size:11px;color:var(--gold)}
  .line-cost{font-family:var(--f-data);font-size:10px;color:var(--fg-3)}
  .line-cost::after{content:" 🍬"}

  .candy{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
  .candy-meter{flex:1;min-width:150px}
  .candy-nums{font-family:var(--f-title);font-size:24px;font-weight:300;margin-bottom:8px;color:#f4ecda}
  .candy-nums b{font-weight:300;color:var(--gold)}
  .candy-nums i{font-style:normal;font-family:var(--f-ui);font-size:13px;color:var(--fg-3)}
  .cbar{height:2px;background:rgba(212,176,106,.15);position:relative}
  .cbar-fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#8a6f3a,var(--gold));box-shadow:0 0 10px rgba(212,176,106,.5);transition:width .5s}
  .evo-btn{border:0;border-radius:999px;background:var(--gold-btn);color:#1a1410;font-family:var(--f-ui);font-weight:700;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:14px 24px;cursor:pointer;box-shadow:0 10px 30px rgba(212,176,106,.2)}
  .evo-btn:hover:not(:disabled){filter:brightness(1.06)}
  .evo-btn:disabled{background:transparent;border:1px solid var(--line);color:var(--fg-3);box-shadow:none;cursor:default}
  .evo-btn:focus-visible,.cancel-btn:focus-visible,.evo-choice:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .evo-choices{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
  .evo-choice{background:var(--surface-hi);border:1px solid var(--line);border-radius:8px;padding:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;width:88px;font-family:var(--f-ui);font-size:11px;color:var(--fg-2)}
  .evo-choice:hover:not(:disabled){border-color:var(--gold);color:var(--fg)}
  .evo-choice:disabled{opacity:.45;cursor:default}
  .evo-choice img{width:48px;height:48px}
  .picker-row{cursor:pointer}
  .picker-row input{margin:0;accent-color:var(--gold)}
  .picker-actions{display:flex;gap:10px;margin-top:14px}
  .cancel-btn{border:1px solid rgba(239,230,207,.18);border-radius:999px;background:transparent;color:var(--fg-2);font-family:var(--f-ui);font-weight:700;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:14px 22px;cursor:pointer}
  .cancel-btn:hover{color:var(--fg);border-color:rgba(239,230,207,.32)}
  .muted{color:var(--fg-2);font-size:13px;line-height:1.6}
  .muted b{color:var(--fg)}

  /* réserve : doublons sans évolution */
  .reserve{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .reserve-count{font-family:var(--f-title);font-size:40px;font-weight:300;color:var(--gold);line-height:1}
  .reserve-txt{flex:1;min-width:180px}
  .press{display:flex;gap:4px;margin-top:10px;flex-wrap:wrap}
  .press span{width:18px;height:22px;border-radius:3px;background:var(--surface-hi);border:1px solid var(--line);display:grid;place-items:center;font-family:var(--f-data);font-size:8px;color:var(--fg-3)}

  @media (max-width:900px){
    .sheet-grid{grid-template-columns:1fr}
    .sheet-side{border-right:0;border-bottom:1px solid rgba(212,176,106,.12);padding:32px 16px}
    .sheet-main{padding:28px 20px}
    .panel-name{font-size:36px}
  }
```

- [ ] **Step 5: vérifier le succès**

Run: `npx vitest run src/components/SpeciesSheet.test.js && npm test`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add src/components/SpeciesSheet.vue src/components/SpeciesSheet.test.js src/styles.css
git commit -m "feat(fiche): modale velours en deux colonnes, la carte sous la lumière de nuit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: rituel, évolution, réglages, connexion — et la vérification

**Files:**
- Modify: `src/components/ConnectScreen.vue`, `src/components/ConnectScreen.test.js`
- Modify: `src/components/SettingsPanel.vue` (retrait des `style=` inline parchemin)
- Modify: `src/components/RitualOverlay.vue` (le lien « tout ouvrir » perd son `style=` inline, prend `class="queue-note"`)
- Modify: `src/components/EvolutionOverlay.vue` (le `style="color:var(--ochre)"` du bandeau devient `class="reveal-banner muted-banner"`)
- Modify: `src/styles.css` (sections rituel hors `.pkc*`, évolution, connexion/réglages)
- Modify: `README.md`

**Interfaces:**
- Consumes: `PokeCard` (props `speciesId`, `tier`, `shiny`, `scene`), sans modification.
- Produces: `ConnectScreen` inchangé côté props/émissions ; nouvelles classes `.front-fan`, `.front-card`.

- [ ] **Step 1: le test de la connexion**

Ajouter à `src/components/ConnectScreen.test.js` :

```js
  it('montre les quatre paliers en éventail : Roucool, Goupix, Salamèche, Sulfura', () => {
    const w = mount(ConnectScreen)
    const cartes = w.findAllComponents({ name: 'PokeCard' })
    expect(cartes.map((c) => [c.props('speciesId'), c.props('tier')])).toEqual([
      [16, 'c'], [37, 'u'], [4, 'r'], [146, 'l'],
    ])
    expect(cartes.every((c) => c.props('scene') === 'night')).toBe(true)
  })
```

Run: `npx vitest run src/components/ConnectScreen.test.js` — Expected: FAIL (aucune `PokeCard`).

- [ ] **Step 2: `ConnectScreen.vue`**

```vue
<script setup>
import PokeCard from './PokeCard.vue'

defineProps({
  error: { type: String, default: null }, // 'offline' | 'server'
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['connect'])

// Les quatre paliers, posés en éventail : l'écran d'accueil montre d'emblée ce qu'on va
// collectionner, et que la matière de la carte dit sa rareté. Espèces fixes, jamais tirées.
const FAN = [[16, 'c'], [37, 'u'], [4, 'r'], [146, 'l']]
</script>

<template>
  <div class="front">
    <div class="front-copy">
      <div class="front-mark"><i>PR</i>·DEX</div>
      <div class="eyebrow">Une PR mergée, un Pokémon</div>
      <p class="front-sub">
        Le dex se remplit depuis tes PR mergées sur GitHub. Connecte-toi une fois : rien d'autre à
        configurer, ta collection est liée à ton compte.
      </p>

      <div v-if="error" class="banner err">
        <span class="bico">✕</span>
        <div>
          <template v-if="error === 'offline'">
            <span class="bt">Pas de réseau.</span>
            Impossible de joindre GitHub ou Supabase. Vérifie ta connexion et réessaie.
          </template>
          <template v-else>
            <span class="bt">Service indisponible.</span>
            Ce n'est pas ton compte — réessaie dans un moment.
          </template>
        </div>
      </div>

      <div class="front-actions">
        <button class="btn-solid" :disabled="busy" @click="emit('connect')">
          {{ busy ? 'Connexion…' : 'Se connecter avec GitHub' }}
        </button>
        <span class="muted">Aucune donnée de jeu n'est stockée ailleurs que sur ton compte.</span>
      </div>
    </div>

    <div class="front-fan" aria-hidden="true">
      <div v-for="([id, tier], i) in FAN" :key="id" class="pkc-stage front-card" :style="{ '--i': i }">
        <PokeCard :species-id="id" :tier="tier" scene="night" />
      </div>
    </div>
  </div>
</template>
```

`PokeCard` a `provenance` et `flipped` avec des défauts (`null`, `false`) : rien à passer de plus. `@activate` n'est pas branché sur l'éventail, c'est voulu : ces cartes sont un décor.

Run: `npx vitest run src/components/ConnectScreen.test.js` — Expected: PASS. Les tests existants visent `.sim`, `.btn-solid` et `.banner`, qui restent.

- [ ] **Step 3: les inline à retirer**

- `RitualOverlay.vue` : sur le bouton « tout ouvrir sans cérémonie », retirer l'attribut `style="background:none;border:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px"` ; la classe `queue-note` reste.
- `EvolutionOverlay.vue` : `<div v-else class="reveal-banner" style="color:var(--ochre)">Évolution</div>` devient `<div v-else class="reveal-banner">Évolution</div>` (le bandeau est déjà or dans le nouveau CSS).
- `SettingsPanel.vue` : remplacer le contenu du template par :

```html
<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel settings">
      <button class="x" aria-label="Fermer" @click="$emit('close')">✕</button>
      <div class="settings-body">
        <span class="panel-plate">Réglages</span>
        <h2 class="panel-name settings-title">Compte</h2>
        <div class="sect">
          <div class="eyebrow sect-h"><span>Connecté avec GitHub</span></div>
          <div class="repo-ptr"><span class="dot"></span>{{ githubLogin }}</div>
        </div>
        <div class="sect">
          <button class="btn-ghost" @click="$emit('disconnect')">Se déconnecter</button>
        </div>
        <div class="sect">
          <p class="muted">
            Tes captures et tes décisions sont liées à ton compte GitHub, isolées des autres
            joueurs par les règles d'accès de la base.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
```

Run: `npm test` — Expected: PASS (les tests App qui cherchent `.panel` pour les réglages trouvent toujours `.panel`).

- [ ] **Step 4: le CSS du rituel, de l'évolution, de la connexion et des réglages**

Dans la section `/* ───────── rituel ───────── */`, ne remplacer que ces règles (les règles `.rays`, `.flash`, `.fx-*`, `@keyframes`, `.reveal .pkc-stage` ne bougent pas) :

```css
  .ritual{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;overflow:hidden;
    background:#070605;background-image:radial-gradient(ellipse 45% 70% at 50% 20%, rgba(212,176,106,.18), transparent 65%)}
  .ritual.leg{background:#0a0704;background-image:radial-gradient(ellipse 55% 75% at 50% 20%, rgba(212,176,106,.3), transparent 68%)}
  .ritual-close{color:var(--gold)}
  .ritual-close:hover{color:#fff}
  .reveal-hint{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:7px;
    font-family:var(--f-ui);font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
  .reveal-meta{position:relative;z-index:2;text-align:center;animation:fadeUp .5s ease-out .48s both;color:var(--fg)}
  .reveal-banner{font-family:var(--f-ui);font-weight:700;font-size:11px;letter-spacing:.4em;text-transform:uppercase;color:var(--gold);margin-bottom:10px;animation:fadeUp .4s ease-out .3s both}
  .reveal-name{font-family:var(--f-title);font-size:44px;font-weight:300;letter-spacing:-.02em;line-height:1;color:#f4ecda}
  .reveal-tags{display:flex;gap:8px;justify-content:center;margin-top:14px}
  .reveal .chip{background:transparent}
  /* « Nouveau » reste la seule chip pleine de la scène : le palier et le chromatique se lisent
     déjà sur la carte, « nouveau » n'a aucun autre porteur visuel. */
  .reveal-tags .chip.new-chip{border-color:#9fd0b6;color:#0f1a14;background:#9fd0b6}
  .reveal-note{font-family:var(--f-ui);font-size:12px;margin-top:16px;color:var(--fg-2)}
  .reveal-note b{color:var(--gold);font-weight:600}
  .next-btn{position:relative;z-index:2;border:0;border-radius:999px;background:var(--gold-btn);color:#1a1410;font-family:var(--f-ui);font-weight:700;font-size:12px;letter-spacing:.2em;text-transform:uppercase;padding:15px 30px;cursor:pointer;box-shadow:0 10px 30px rgba(212,176,106,.25);animation:fadeUp .5s ease-out .75s both}
  .next-btn:hover{filter:brightness(1.06)}
  .next-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}
  .queue-note{position:relative;z-index:2;background:none;border:0;cursor:pointer;font-family:var(--f-ui);font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-3);text-decoration:underline;text-underline-offset:3px}
  .queue-note:hover{color:var(--fg)}
```

Dans `/* ───────── évolution ───────── */`, remplacer `.evostage{…}` et `.evo-cap{…}`, `.evo-cap .reveal-name{…}` par :

```css
  .evostage{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;
    background:#070605;background-image:radial-gradient(ellipse 50% 60% at 50% 40%, rgba(212,176,106,.2), transparent 70%)}
  .evo-cap{text-align:center;color:var(--fg);animation:fadeUp .6s ease-out 2.4s both}
  .evo-cap .reveal-name{color:#f4ecda}
```

Remplacer toute la section `/* ───────── connexion / réglages ───────── */` jusqu'à `.sim-row button:hover{…}` par :

```css
  /* ───────── connexion / réglages ───────── */
  .front{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:40px;padding:60px 0}
  .front-copy{max-width:480px}
  .front-mark{font-family:var(--f-title);font-weight:300;font-size:72px;letter-spacing:-.03em;line-height:1;color:#f4ecda;margin-bottom:14px}
  .front-mark i{font-weight:600;color:var(--gold)}
  .front-sub{margin-top:22px;font-family:var(--f-title);font-weight:300;font-size:19px;color:#c9bca7;line-height:1.55;max-width:42ch}
  .front-actions{display:flex;gap:16px;align-items:center;margin-top:30px;flex-wrap:wrap}
  /* L'éventail : quatre cartes, du commun au légendaire, qui se chevauchent et s'inclinent. */
  .front-fan{position:relative;height:440px;display:flex;align-items:center;justify-content:center}
  .front-card{position:absolute;transform:translateX(calc((var(--i) - 1.5) * 92px)) rotate(calc((var(--i) - 1.5) * 7deg)) translateY(calc(var(--i) * -4px));z-index:calc(var(--i) + 1)}
  .front-card .pkc{width:200px;height:280px;cursor:default}
  .front-card .pkc-art img{width:104px;height:104px}
  .front-card .pkc-name{font-size:15px}
  .btn-solid{border:0;border-radius:999px;background:var(--gold-btn);color:#1a1410;font-family:var(--f-ui);font-weight:700;font-size:12px;letter-spacing:.18em;text-transform:uppercase;padding:16px 28px;cursor:pointer;box-shadow:0 10px 30px rgba(212,176,106,.25)}
  .btn-solid:hover{filter:brightness(1.06)}
  .btn-solid:disabled{opacity:.6;cursor:default}
  .btn-ghost{border:1px solid rgba(239,230,207,.18);border-radius:999px;background:transparent;color:var(--fg-2);font-family:var(--f-ui);font-weight:700;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:13px 22px;cursor:pointer}
  .btn-ghost:hover{color:var(--fg);border-color:rgba(239,230,207,.32)}
  .btn-solid:focus-visible,.btn-ghost:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .banner{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1px solid;border-radius:8px;margin-top:22px;font-size:13px;line-height:1.5}
  .banner.err{border-color:rgba(224,122,108,.5);background:rgba(224,122,108,.08);color:var(--fg)}
  .banner .bt{font-weight:700;color:var(--danger)}
  .banner .bico{font-family:var(--f-data);color:var(--danger);font-size:15px;line-height:1.2}
  .settings{width:min(480px,100%)}
  .settings-body{padding:36px 32px 24px}
  .settings-title{font-size:32px;margin-bottom:6px}
  .repo-ptr{font-family:var(--f-data);font-size:13px;color:var(--fg);display:flex;align-items:center;gap:9px}
  .repo-ptr .dot{width:8px;height:8px;border-radius:50%;background:#7fb59a}
  @media (max-width:900px){
    .front{grid-template-columns:1fr;padding:40px 0;min-height:auto}
    .front-mark{font-size:52px}
    .front-fan{height:320px;order:-1}
    .front-card{transform:translateX(calc((var(--i) - 1.5) * 62px)) rotate(calc((var(--i) - 1.5) * 7deg))}
    .front-card .pkc{width:150px;height:210px}
    .front-card .pkc-art img{width:76px;height:76px}
  }
```

Supprimer les règles orphelines de l'ancien écran (`.sheet`, `.sheet-h`, `.sheet-b`, `.steps*`, `.perm*`, `.field*`, `.sim*`) après avoir vérifié qu'aucun gabarit ne les utilise : `grep -rn "class=\"\(sheet\|steps\|perm\|field\|sim\)" src/components src/App.vue` ne doit rien renvoyer.

- [ ] **Step 5: README**

Dans `README.md`, après la section « L'ouverture » et avant « Le tableau des scores », ajouter :

```markdown
## Le décor

La carte ne bouge pas ; c'est la pièce autour qui a changé. L'app est posée sur un velours
sombre, éclairé par le dessus, avec l'or comme seul accent. Le parchemin du prototype
reste là où il a un sens : dans le carton de la carte, dont les tokens sont redéclarés sur
`.pkc`. Dans la grille, un légendaire capturé porte un halo doré, un chromatique un halo
irisé — un seul halo par case, l'irisé l'emporte.

La planche, l'équipe et les stats sont trois vues de la même page, en onglets ; la fiche,
le rituel et l'évolution restent des scènes par-dessus. Espace n'ouvre un pli que depuis la
planche.
```

Dans la section « Le tableau des scores », remplacer « Le 🏆 du rail ouvre » par « L'onglet Équipe ouvre ».

- [ ] **Step 5b: vérifier la suite**

Run: `npm test`
Expected: PASS, toute la suite.

- [ ] **Step 6: la vérification en navigateur**

Run: `npm run dev -- --host` puis ouvrir `http://<ip>:5173/?demo`.

À 1280×860 puis à 390×844, vérifier et capturer :
1. la planche, avec un shiny (Chenipan 010), un légendaire (Sulfura 146), un rare ;
2. la recherche « evoli », « 025 », puis « zzz » et « Effacer les filtres » ;
3. la fiche d'un commun, d'un peu commun, d'un rare, d'un légendaire et d'un shiny — la carte garde ses matières ;
4. le rituel : ouvrir un pli commun, puis le pli légendaire en file ;
5. la vue Équipe (avec la ligne « · toi ») et Mes stats ;
6. l'écran de connexion (sans `?demo`, se déconnecter depuis les réglages) ;
7. aucun défilement horizontal à 390 px ;
8. le contraste de `--fg-3` sur `--bg` : `#8a7d6b` sur `#14110e` doit atteindre 4,5:1 ; sinon l'éclaircir et le noter en ruling.

Enregistrer les captures dans le dossier de travail du plan (pas dans le repo) pour les joindre à la PR.

- [ ] **Step 7: commit**

```bash
git add src/components/ConnectScreen.vue src/components/ConnectScreen.test.js src/components/SettingsPanel.vue src/components/RitualOverlay.vue src/components/EvolutionOverlay.vue src/styles.css README.md
git commit -m "feat(ui): rituel, évolution, réglages et connexion passent au velours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Mise en production

Aucune migration, aucune donnée touchée. Merger la PR suffit : Pages redéploie. Retour arrière : revert de la PR.
