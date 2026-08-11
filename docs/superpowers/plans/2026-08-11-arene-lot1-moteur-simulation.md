# Mode arène — Lot 1 : moteur de combat et simulation d'équilibrage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écrire le moteur de combat de l'arène en JavaScript pur et faire tourner la simulation d'équilibrage qui valide — ou réfute — les constantes posées dans la spec, avant qu'une seule table Supabase ou un seul écran ne soit construit.

**Architecture:** Trois fichiers purs dans `shared/`, sans aucune dépendance à Vue, à Supabase ni au DOM. `battle.js` porte la puissance d'un exemplaire, la probabilité de victoire, le gain de niveau et la résolution déterministe d'un duel. `arena-economy.js` porte l'enjeu du duel, les gains, les prix de la boutique et les plafonds de jeu. Un script `scripts/simulate-arena.mjs` fait tourner des dizaines de milliers de duels sur des collections plausibles, et un test d'équilibrage assère les quatre acquis exigés par la spec. Aucune interface, aucune migration, rien de visible dans l'application : ce lot est livrable et mergeable sans que personne ne voie l'app changer.

**Tech Stack:** JavaScript ESM natif (`type: module`), Vitest 3, Node ≥ 20 pour les scripts (`.mjs`, `fetch` natif). Aucune dépendance nouvelle.

## Global Constraints

- **Spec de référence :** `docs/superpowers/specs/2026-08-10-mode-arene-design.md`. En cas de divergence, la spec fait foi.
- **Langue :** tout le texte visible, les noms de tests et les commentaires de code sont en **français**.
- **Commentaires :** le dépôt commente le *pourquoi*, jamais le *quoi*. N'écrire un commentaire que là où le plan en fournit un — ils portent un piège réel, pas une paraphrase du code.
- **Pureté :** rien dans `shared/` n'importe Vue, Supabase, le DOM ou `node:*`. `shared/` est chargé aussi bien par le front que par les scripts Node.
- **Déterminisme :** aucun `Math.random()` ni `Date.now()` dans `shared/`. Tout l'aléa dérive d'un seed passé en argument et passe par `fnv1a` (`shared/draw.js`), comme le tirage. C'est ce qui rend un duel rejouable et vérifiable.
- **Tests :** `npm test` (Vitest, un seul passage). Cible : `npx vitest run <chemin>` pour un fichier, `-t "<nom>"` pour un test.
- **Commits :** un commit par tâche, message en français, préfixe `feat:` / `test:` / `chore:`.
- **Branche :** `feature/poke-arena-battle` (PR #10, en draft). **Ne pas pousser** sans demande explicite. Si un `push` est demandé, préfixer par `GS_REVIEW_BYPASS=1` (ce dépôt n'utilise pas `gs-review-and-fix`).
- **Constantes de la spec, à reprendre telles quelles :**
  - Coefficients de rareté : `c 1.00 · u 1.06 · r 1.15 · l 1.25`
  - Niveaux : 1 à 10, facteur `1 + 0,05 × (niveau − 1)`, soit `1,00` à `1,45`
  - Formes : `0,90 · 0,95 · 1,00 · 1,05 · 1,10`
  - Probabilité : rapport des puissances **au cube**, bornée à **[0,10 ; 0,90]**
  - Gain de niveau : `< 0,75× → 0` · `0,75–1,10× → 1` · `1,10–1,50× → 2` · `1,50–2,00× → 3` · `≥ 2,00× → 5`
  - Gains sur l'enjeu : `c 50 $/5 pts` · `u 100 $/10 pts` · `r 250 $/25 pts` · `l 600 $/60 pts`
  - Maison : **quart** du palier de sa propre mise, en pokédollars seulement — `c 12 · u 25 · r 62 · l 150`. Le demi-tarif initial a été mesuré puis abandonné : il rendait le farming sans risque presque aussi rentable qu'une saison de vrais duels.
  - Plafonds : 1 crédit par jour ouvré, cumul 5, 2 duels par semaine et par paire

## Ce que ce lot ne fait pas

Aucune interface, donc **la contrainte « jouable en mode `?demo` » ne s'applique pas ici** — elle commence au lot 3, quand l'arène devient visible. Aucune table, aucune RPC, aucun changement de `useDex`. Le seul fichier existant modifié est le générateur de données d'espèces.

---

### Task 1: Stats de base dans `shared/species-stats.js`

Le moteur a besoin du total des stats de base de chaque espèce. `scripts/gen-species-info.mjs` appelle déjà `pokemon/{id}` pour les types — la réponse contient les stats, il suffit de les additionner et de les écrire.

**Pourquoi un module JS et non un champ de plus dans `species-info.json`.** `shared/battle.js` sera importé par trois environnements : Vite (le front), Vitest (les tests) et **Node nu** (le script de simulation de la tâche 8). Or Node exige `with { type: 'json' }` sur un import JSON, là où `src/components/SpeciesSheet.vue` importe `species-info.json` sans attribut. Un module JS supprime la question au lieu de la contourner, garde le fichier existant intact, et porte le nom de la future table `species_stats` de la spec (§ 6).

**Files:**
- Modify: `scripts/gen-species-info.mjs` (helper exporté + second fichier écrit)
- Create: `shared/species-stats.js` (généré)
- Test: `scripts/gen-species-info.test.js` (ajout d'un bloc)
- Test: `shared/species-stats.test.js`

**Interfaces:**
- Produces: `statTotal(stats)` exporté depuis `scripts/gen-species-info.mjs` — prend le tableau `stats` d'une réponse PokéAPI (`[{ base_stat: Number, stat: { name } }, …]`) et rend leur somme (`Number`).
- Produces: `STATS: { [id: Number]: Number }` exporté depuis `shared/species-stats.js` — le total des stats de base, une entrée par espèce de la planche. Les tâches 2 et suivantes le lisent.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `scripts/gen-species-info.test.js` :

```js
describe('statTotal', () => {
  const stat = (name, base_stat) => ({ base_stat, stat: { name } })

  it('additionne les six statistiques de base', () => {
    expect(statTotal([
      stat('hp', 45), stat('attack', 49), stat('defense', 49),
      stat('special-attack', 65), stat('special-defense', 65), stat('speed', 45),
    ])).toBe(318)
  })

  it('rend 0 pour une liste vide plutôt que NaN', () => {
    expect(statTotal([])).toBe(0)
  })
})
```

Et compléter la ligne d'import en tête du fichier :

```js
import { cleanFlavor, pickFlavor, statTotal } from './gen-species-info.mjs'
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/gen-species-info.test.js -t "statTotal"`
Expected: FAIL — `statTotal is not a function`

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `scripts/gen-species-info.mjs`, après la fonction `pickFlavor`, ajouter :

```js
/** Total des six stats de base — la colonne vertébrale de la puissance en arène. */
export const statTotal = (stats) => stats.reduce((sum, s) => sum + s.base_stat, 0)
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run scripts/gen-species-info.test.js -t "statTotal"`
Expected: PASS

- [ ] **Step 5: Écrire le test de forme sur le module généré**

Créer `shared/species-stats.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { SPECIES } from './species.js'
import { STATS } from './species-stats.js'

describe('species-stats.js', () => {
  // Une régénération partielle laisserait des puissances à zéro, et tous les duels
  // s'effondreraient sur la borne basse sans erreur visible.
  it('couvre exactement les 151 espèces de la planche', () => {
    expect(Object.keys(STATS).map(Number).sort((a, b) => a - b)).toEqual(SPECIES.map(([id]) => id))
  })

  it('reste dans la plage de totaux connue de la gen 1', () => {
    for (const [id] of SPECIES) {
      expect(STATS[id]).toBeGreaterThanOrEqual(190)
      expect(STATS[id]).toBeLessThanOrEqual(690)
    }
  })

  // Ces trois valeurs servent de fixtures aux tests de combat des tâches suivantes :
  // si PokeAPI les change un jour, c'est ici qu'on doit le voir en premier.
  it('donne les valeurs de référence de Roucool, Dracaufeu et Électhor', () => {
    expect(STATS[16]).toBe(251)
    expect(STATS[6]).toBe(534)
    expect(STATS[145]).toBe(580)
  })
})
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run shared/species-stats.test.js`
Expected: FAIL — `Failed to resolve import "./species-stats.js"`

- [ ] **Step 7: Brancher le helper et le second fichier dans la génération**

Dans `scripts/gen-species-info.mjs`, ajouter la seconde destination sous `OUT` :

```js
const OUT_STATS = new URL('../shared/species-stats.js', import.meta.url)
```

Dans `main()`, ajouter le calcul et l'accumulation. Le bloc de boucle devient :

```js
    const text = pickFlavor(species.flavor_text_entries)
    const stats = statTotal(mon.stats)

    // Échec bruyant plutôt que JSON partiel : une fiche silencieusement vide en production
    // est beaucoup plus difficile à repérer qu'un script qui refuse de finir.
    if (!types.length || types.some((t) => !t.name)) throw new Error(`types manquants pour l'id ${id}`)
    if (!text) throw new Error(`texte français manquant pour l'id ${id}`)
    if (!stats) throw new Error(`stats manquantes pour l'id ${id}`)

    out[id] = { types, text }
    statsOut[id] = stats
```

Déclarer `statsOut` à côté de `out`, en tête de `main()` :

```js
  const out = {}
  const statsOut = {}
```

Et écrire le second fichier juste après le premier, avant le `console.log` final :

```js
  // Un module JS et non du JSON : `shared/battle.js` est importé par Vite, par Vitest et
  // par Node nu (script de simulation), et Node exige `with { type: 'json' }` là où le
  // front s'en passe. Un module supprime la question.
  const statsBody = Object.entries(statsOut).map(([id, v]) => `  ${id}: ${v},`).join('\n')
  await writeFile(OUT_STATS, `/** Total des stats de base par espèce — généré par scripts/gen-species-info.mjs. */\nexport const STATS = {\n${statsBody}\n}\n`)
```

- [ ] **Step 8: Régénérer les données**

Run: `npm run gen:species-info`

Le script appelle PokéAPI pour les 18 types puis pour chacune des 151 espèces, avec 60 ms d'attente entre deux requêtes : **compter cinq à dix minutes**. Il affiche sa progression (`42/151`) et se termine par `151 espèces écrites dans shared/species-info.json`.

- [ ] **Step 9: Vérifier la régénération**

Run: `npx vitest run shared/species-stats.test.js shared/species-info.test.js scripts/gen-species-info.test.js`
Expected: PASS

Puis vérifier que le fichier existant n'a pas bougé — la régénération doit être idempotente sur les types et les notices :

Run: `git diff --stat shared/species-info.json`
Expected: aucune sortie (fichier inchangé).

- [ ] **Step 10: Vérifier que le module s'importe sous Node nu**

C'est la raison d'être du choix d'un module JS : si cette commande échoue, tout le lot 8 échouera aussi.

Run: `node --input-type=module -e "import { STATS } from './shared/species-stats.js'; console.log(STATS[16], STATS[6], STATS[145])"`
Expected: `251 534 580`

- [ ] **Step 11: Commit**

```bash
git add scripts/gen-species-info.mjs scripts/gen-species-info.test.js shared/species-stats.js shared/species-stats.test.js
git commit -m "feat: total des stats de base par espèce, pour le moteur d'arène"
```

---

### Task 2: Puissance d'un exemplaire

**Files:**
- Create: `shared/battle.js`
- Test: `shared/battle.test.js`

**Interfaces:**
- Consumes: `DEX` depuis `shared/species.js`, `STATS` depuis `shared/species-stats.js` (produit par la tâche 1).
- Produces:
  - `TIER_POWER: { c: 1.00, u: 1.06, r: 1.15, l: 1.25 }`
  - `LEVEL_MAX: 10`
  - `FORMS: Array<{ slug: String, name: String, factor: Number }>` — 5 entrées, ordonnées de la plus faible à la plus forte, `factor` de `0.90` à `1.10`
  - `NORMAL_FORM: Object` — l'entrée de `FORMS` dont le `factor` vaut `1.00`
  - `levelFactor(level: Number) => Number`
  - `power({ species: Number, level?: Number, form?: Object }) => Number` — `level` par défaut `1`, `form` par défaut `NORMAL_FORM`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `shared/battle.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { TIER_POWER, LEVEL_MAX, FORMS, NORMAL_FORM, levelFactor, power } from './battle.js'
import { DEX } from './species.js'
import { STATS } from './species-stats.js'

describe('coefficients de rareté', () => {
  it('couvre les quatre paliers, croissants, à partir de 1', () => {
    expect(Object.keys(TIER_POWER).sort()).toEqual(['c', 'l', 'r', 'u'])
    expect(TIER_POWER.c).toBe(1)
    expect(TIER_POWER.u).toBeGreaterThan(TIER_POWER.c)
    expect(TIER_POWER.r).toBeGreaterThan(TIER_POWER.u)
    expect(TIER_POWER.l).toBeGreaterThan(TIER_POWER.r)
  })

  // La mesure des stats par palier (spec § 3) montre que les stats portent déjà l'écart de
  // rareté : un coefficient lourd le compterait deux fois.
  it('reste léger — au plus 25 % d’écart entre commun et légendaire', () => {
    expect(TIER_POWER.l / TIER_POWER.c).toBeLessThanOrEqual(1.25)
  })
})

describe('formes du jour', () => {
  it('propose cinq états ordonnés du plus faible au plus fort', () => {
    expect(FORMS).toHaveLength(5)
    expect(FORMS.map((f) => f.factor)).toEqual([0.90, 0.95, 1.00, 1.05, 1.10])
  })

  it('donne à chaque forme un identifiant et un libellé non vides', () => {
    for (const f of FORMS) {
      expect(f.slug.length).toBeGreaterThan(0)
      expect(f.name.length).toBeGreaterThan(0)
    }
  })

  it('expose la forme neutre', () => {
    expect(NORMAL_FORM.factor).toBe(1)
  })
})

describe('levelFactor', () => {
  it('ne change rien au niveau 1', () => {
    expect(levelFactor(1)).toBe(1)
  })

  it('ajoute 45 % au niveau maximal', () => {
    expect(levelFactor(LEVEL_MAX)).toBeCloseTo(1.45, 10)
  })
})

describe('power', () => {
  // Roucool, commun, 251 de stats : aucun multiplicateur ne s'applique au niveau 1.
  it('rend les stats brutes pour un commun frais en forme normale', () => {
    expect(power({ species: 16 })).toBeCloseTo(251, 6)
  })

  it('applique le coefficient de rareté', () => {
    // Dracaufeu, rare, 534 de stats.
    expect(power({ species: 6 })).toBeCloseTo(534 * 1.15, 6)
  })

  it('applique le niveau et la forme', () => {
    const forte = FORMS[FORMS.length - 1]
    expect(power({ species: 16, level: 10, form: forte })).toBeCloseTo(251 * 1.45 * 1.10, 6)
  })

  it('rend une puissance strictement positive pour les 151 espèces', () => {
    for (const id of Object.keys(DEX).map(Number)) {
      expect(power({ species: id })).toBeGreaterThan(0)
      expect(Number.isFinite(power({ species: id }))).toBe(true)
    }
  })

  it('classe Électhor au-dessus de toutes les autres espèces fraîches', () => {
    const electhor = power({ species: 145 })
    const autres = Object.keys(STATS).map(Number).filter((id) => id !== 145)
    for (const id of autres) expect(power({ species: id })).toBeLessThan(electhor)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run shared/battle.test.js`
Expected: FAIL — `Failed to resolve import "./battle.js"`

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `shared/battle.js` :

```js
import { DEX } from './species.js'
import { STATS } from './species-stats.js'

/**
 * Le palier ne fait que nuancer : la mesure des stats par palier (spec § 3) montre que la
 * rareté est déjà largement portée par les stats elles-mêmes. Le coefficient appuie surtout
 * la frontière peu commun / rare, où les deux paliers se chevauchent lourdement.
 */
export const TIER_POWER = { c: 1.00, u: 1.06, r: 1.15, l: 1.25 }

export const LEVEL_MAX = 10

export const FORMS = [
  { slug: 'epuise', name: 'Épuisé', factor: 0.90 },
  { slug: 'fatigue', name: 'Fatigué', factor: 0.95 },
  { slug: 'normal', name: 'Normal', factor: 1.00 },
  { slug: 'en-forme', name: 'En forme', factor: 1.05 },
  { slug: 'pleine-forme', name: 'En pleine forme', factor: 1.10 },
]

export const NORMAL_FORM = FORMS.find((f) => f.factor === 1)

export const levelFactor = (level) => 1 + 0.05 * (level - 1)

export function power({ species, level = 1, form = NORMAL_FORM }) {
  return STATS[species] * TIER_POWER[DEX[species].tier] * levelFactor(level) * form.factor
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run shared/battle.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/battle.js shared/battle.test.js
git commit -m "feat: puissance d'un exemplaire d'arène — stats, rareté, niveau, forme"
```

---

### Task 3: Forme du jour, calculée et non stockée

La forme doit être lisible côté client avant d'engager, et recalculable par la fonction de résolution. Elle est donc une **fonction pure** de la clé d'exemplaire et du jour — aucune table, impossible à retirer en rafraîchissant la page, vérifiable par n'importe qui.

**Files:**
- Modify: `shared/battle.js`
- Test: `shared/battle.test.js`

**Interfaces:**
- Consumes: `fnv1a` depuis `shared/draw.js`.
- Produces: `formOf(key: String, day: String) => Object` — rend une entrée de `FORMS`. `key` est une clé d'exemplaire (`source:external_id`, cf. `shared/entry.js`), `day` une date `AAAA-MM-JJ`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `shared/battle.test.js` :

```js
describe('formOf', () => {
  it('rend toujours une forme de la liste', () => {
    expect(FORMS).toContain(formOf('github:abc123', '2026-08-11'))
  })

  it('est stable pour une même clé et un même jour', () => {
    expect(formOf('github:abc123', '2026-08-11')).toBe(formOf('github:abc123', '2026-08-11'))
  })

  it('change d’un jour à l’autre', () => {
    const jours = ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']
    const vues = new Set(jours.map((j) => formOf('github:abc123', j).slug))
    expect(vues.size).toBeGreaterThan(1)
  })

  it('ne donne pas la même forme à deux exemplaires le même jour', () => {
    const cles = Array.from({ length: 200 }, (_, i) => `github:sha${i}`)
    const vues = new Set(cles.map((k) => formOf(k, '2026-08-11').slug))
    expect(vues.size).toBe(FORMS.length)
  })

  // `fnv1a` est un hachage 32 bits : un `% 5` sur une entrée mal dispersée s'effondrerait
  // sur une ou deux formes. Le tirage a déjà connu ce défaut (cf. NOTES.md), on le vérifie.
  it('répartit les cinq formes à peu près également sur 50 000 clés', () => {
    const counts = Object.fromEntries(FORMS.map((f) => [f.slug, 0]))
    const n = 50_000
    for (let i = 0; i < n; i++) counts[formOf(`github:sha${i}`, '2026-08-11').slug]++
    for (const f of FORMS) {
      expect(counts[f.slug] / n).toBeGreaterThan(0.17)
      expect(counts[f.slug] / n).toBeLessThan(0.23)
    }
  })
})
```

Et compléter la ligne d'import en tête du fichier :

```js
import { TIER_POWER, LEVEL_MAX, FORMS, NORMAL_FORM, levelFactor, power, formOf } from './battle.js'
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run shared/battle.test.js -t "formOf"`
Expected: FAIL — `formOf is not a function`

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `shared/battle.js`, ajouter l'import en tête :

```js
import { fnv1a } from './draw.js'
```

Puis, après `NORMAL_FORM` :

```js
/**
 * Calculée, jamais stockée : une fonction pure de la clé d'exemplaire et du jour, sur le
 * modèle du tirage. Aucune table, aucune écriture, impossible à retirer en rafraîchissant
 * la page, et le serveur comme le client arrivent au même résultat sans se parler.
 */
export const formOf = (key, day) => FORMS[fnv1a(`${key}:forme:${day}`) % FORMS.length]
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run shared/battle.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/battle.js shared/battle.test.js
git commit -m "feat: forme du jour d'un exemplaire, fonction pure de la clé et de la date"
```

---

### Task 4: Probabilité de victoire

**Files:**
- Modify: `shared/battle.js`
- Test: `shared/battle.test.js`

**Interfaces:**
- Produces:
  - `P_FLOOR: 0.10`, `P_CEIL: 0.90`
  - `winProbability(a: Number, b: Number) => Number` — `a` et `b` sont des puissances ; rend la probabilité que **`a` l'emporte**, bornée à `[P_FLOOR, P_CEIL]`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `shared/battle.test.js` :

```js
describe('winProbability', () => {
  it('donne une chance sur deux à puissances égales', () => {
    expect(winProbability(400, 400)).toBe(0.5)
  })

  it('est symétrique — les deux probabilités somment à 1 hors bornage', () => {
    expect(winProbability(355, 614) + winProbability(614, 355)).toBeCloseTo(1, 10)
  })

  it('borne les deux extrêmes', () => {
    expect(winProbability(1, 10_000)).toBe(0.10)
    expect(winProbability(10_000, 1)).toBe(0.90)
  })

  // Un rapport direct laisserait un Rattata battre Électhor près d'une fois sur trois.
  // L'élévation au cube est ce qui rend l'écart de stats réellement décisif.
  it('amplifie l’écart au lieu de suivre le rapport brut', () => {
    expect(winProbability(300, 600)).toBeLessThan(300 / 900)
  })
})

describe('probabilités de référence de la spec', () => {
  const forte = FORMS[FORMS.length - 1]
  const duel = (gauche, droite) => winProbability(power(gauche), power(droite))

  it('Rattata contre Électhor tombe sur la borne basse', () => {
    expect(duel({ species: 19 }, { species: 145 })).toBe(0.10)
  })

  it('Salamèche contre Dracaufeu, tous deux frais : 16 %', () => {
    expect(duel({ species: 4 }, { species: 6 })).toBeCloseTo(0.162, 3)
  })

  it('Salamèche niveau 10 contre Dracaufeu frais : 37 %', () => {
    expect(duel({ species: 4, level: 10 }, { species: 6 })).toBeCloseTo(0.371, 3)
  })

  it('Roucool niveau 10 contre Dracaufeu frais : 17 %', () => {
    expect(duel({ species: 16, level: 10 }, { species: 6 })).toBeCloseTo(0.172, 3)
  })

  // Canarticho est rare et Rattatac peu commun, mais Rattatac a de meilleures stats :
  // le coefficient de rareté rattrape presque l'écart sans le renverser.
  it('Canarticho contre Rattatac, tous deux frais : 49 %', () => {
    expect(duel({ species: 83 }, { species: 20 })).toBeCloseTo(0.493, 3)
  })

  it('la forme du jour déplace l’issue sans la décider', () => {
    const neutre = duel({ species: 6 }, { species: 6 })
    const avantage = duel({ species: 6, form: forte }, { species: 6 })
    expect(avantage).toBeGreaterThan(neutre)
    expect(avantage).toBeLessThan(0.65)
  })
})
```

Et compléter la ligne d'import :

```js
import {
  TIER_POWER, LEVEL_MAX, FORMS, NORMAL_FORM, levelFactor, power, formOf,
  P_FLOOR, P_CEIL, winProbability,
} from './battle.js'
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run shared/battle.test.js -t "winProbability"`
Expected: FAIL — `winProbability is not a function`

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `shared/battle.js`, après `power` :

```js
/**
 * Le bornage fait à lui seul trois choses : aucun combat n'est gagné d'avance, l'exploit
 * existe sans règle dédiée, et tout légendaire descendu régulièrement finit par tomber
 * (espérance de vie ≈ 10 duels). C'est le curseur principal de l'équilibrage du mode.
 */
export const P_FLOOR = 0.10
export const P_CEIL = 0.90

/**
 * Élévation au cube et non rapport direct : un rapport direct laisserait un Rattata battre
 * Électhor près d'une fois sur trois, ce que l'écart de stats ne justifie pas.
 */
export function winProbability(a, b) {
  const brut = a ** 3 / (a ** 3 + b ** 3)
  return Math.min(P_CEIL, Math.max(P_FLOOR, brut))
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run shared/battle.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/battle.js shared/battle.test.js
git commit -m "feat: probabilité de victoire en arène, rapport des puissances au cube borné"
```

---

### Task 5: Gain de niveau

Gagné selon le **rapport de puissance déjà calculé pour le combat** — un seul calcul qui sert deux fois, aucune seconde formule.

**Files:**
- Modify: `shared/battle.js`
- Test: `shared/battle.test.js`

**Interfaces:**
- Produces: `levelGain(mine: Number, theirs: Number) => Number` — `mine` et `theirs` sont des puissances ; rend le nombre de niveaux gagnés par le vainqueur, dans `{0, 1, 2, 3, 5}`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `shared/battle.test.js` :

```js
describe('levelGain', () => {
  it('n’accorde rien pour un adversaire nettement plus faible', () => {
    expect(levelGain(1000, 500)).toBe(0)
    expect(levelGain(1000, 740)).toBe(0)
  })

  it('accorde un niveau pour un adversaire comparable', () => {
    expect(levelGain(1000, 750)).toBe(1)
    expect(levelGain(1000, 1000)).toBe(1)
    expect(levelGain(1000, 1090)).toBe(1)
  })

  it('accorde deux niveaux au-delà de 1,10×', () => {
    expect(levelGain(1000, 1100)).toBe(2)
    expect(levelGain(1000, 1490)).toBe(2)
  })

  it('accorde trois niveaux au-delà de 1,50×', () => {
    expect(levelGain(1000, 1500)).toBe(3)
    expect(levelGain(1000, 1990)).toBe(3)
  })

  it('accorde cinq niveaux pour un adversaire deux fois plus puissant', () => {
    expect(levelGain(1000, 2000)).toBe(5)
    expect(levelGain(1000, 9000)).toBe(5)
  })

  // Un légendaire écrase tout mais ne progresse plus : face au tout-venant de l'arène il
  // est très au-dessus de 1,33× l'adversaire, donc sous le seuil des 0,75× inverses.
  it('ne fait pas progresser un légendaire contre le tout-venant', () => {
    const electhor = power({ species: 145 })
    const rattatac = power({ species: 20 })
    expect(levelGain(electhor, rattatac)).toBe(0)
  })
})
```

Et compléter la ligne d'import avec `levelGain`.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run shared/battle.test.js -t "levelGain"`
Expected: FAIL — `levelGain is not a function`

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `shared/battle.js`, après `winProbability` :

```js
/**
 * Seuils croissants sur le rapport adversaire / soi. Écraser un adversaire faible ne fait
 * jamais progresser : c'est ce qui rend le farming des petits joueurs stérile, sans qu'une
 * règle ait besoin de l'interdire.
 */
const LEVEL_GAIN_STEPS = [[0.75, 0], [1.10, 1], [1.50, 2], [2.00, 3]]

export function levelGain(mine, theirs) {
  const rapport = theirs / mine
  for (const [seuil, gain] of LEVEL_GAIN_STEPS) if (rapport < seuil) return gain
  return 5
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run shared/battle.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/battle.js shared/battle.test.js
git commit -m "feat: gain de niveau en arène, indexé sur l'écart de puissance"
```

---

### Task 6: Résolution déterministe d'un duel

La résolution doit être **rejouable** : le serveur la calcule, le client peut la vérifier, et le résumé de combat affiche les mêmes chiffres des deux côtés. L'aléa dérive donc d'un seed, jamais de `Math.random()`.

**Files:**
- Modify: `shared/battle.js`
- Test: `shared/battle.test.js`

**Interfaces:**
- Produces: `resolveDuel({ left, right, seed }) => Object`
  - `left` et `right` : `{ species: Number, level?: Number, form?: Object }` — mêmes champs que `power`
  - `seed` : `String`, l'identifiant du duel
  - Rend :
    ```
    {
      winner: 'left' | 'right',
      probability: Number,          // probabilité que `left` l'emporte
      roll: Number,                 // le tirage dans [0, 1[, conservé pour l'audit
      left:  { power, level, form },
      right: { power, level, form },
      gain: Number,                 // niveaux gagnés par le vainqueur
      levelAfter: Number,           // niveau du vainqueur après gain, borné à LEVEL_MAX
    }
    ```

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `shared/battle.test.js` :

```js
describe('resolveDuel', () => {
  const duel = (over = {}) =>
    resolveDuel({ left: { species: 6 }, right: { species: 6 }, seed: 'duel-1', ...over })

  it('rend le même résultat pour un même seed', () => {
    expect(duel()).toEqual(duel())
  })

  it('désigne toujours exactement un vainqueur', () => {
    for (let i = 0; i < 100; i++) {
      expect(['left', 'right']).toContain(duel({ seed: `duel-${i}` }).winner)
    }
  })

  it('conserve les puissances des deux camps pour le résumé de combat', () => {
    const r = duel()
    expect(r.left.power).toBeCloseTo(power({ species: 6 }), 6)
    expect(r.right.power).toBeCloseTo(power({ species: 6 }), 6)
    expect(r.probability).toBe(0.5)
    expect(r.roll).toBeGreaterThanOrEqual(0)
    expect(r.roll).toBeLessThan(1)
  })

  it('fait gagner le favori à peu près à la fréquence annoncée', () => {
    const n = 20_000
    let gauche = 0
    for (let i = 0; i < n; i++) {
      if (resolveDuel({
        left: { species: 4 }, right: { species: 6 }, seed: `duel-${i}`,
      }).winner === 'left') gauche++
    }
    expect(gauche / n).toBeCloseTo(0.162, 2)
  })

  it('accorde le gain de niveau au seul vainqueur, borné au niveau maximal', () => {
    const r = resolveDuel({
      left: { species: 16, level: 9 }, right: { species: 16, level: 9 }, seed: 'duel-1',
    })
    expect(r.gain).toBe(1)
    expect(r.levelAfter).toBe(LEVEL_MAX)
  })

  it('ne dépasse jamais le niveau maximal, même sur un exploit', () => {
    const r = resolveDuel({
      left: { species: 16, level: 10 }, right: { species: 145, level: 10 }, seed: 'exploit',
    })
    expect(r.levelAfter).toBeLessThanOrEqual(LEVEL_MAX)
  })

  it('applique la forme passée en argument', () => {
    const forte = FORMS[FORMS.length - 1]
    const r = resolveDuel({
      left: { species: 6, form: forte }, right: { species: 6 }, seed: 'duel-1',
    })
    expect(r.probability).toBeGreaterThan(0.5)
    expect(r.left.form).toBe(forte)
  })
})
```

Et compléter la ligne d'import avec `resolveDuel`.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run shared/battle.test.js -t "resolveDuel"`
Expected: FAIL — `resolveDuel is not a function`

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `shared/battle.js`, à la fin :

```js
/**
 * Le seul aléa du duel, dérivé du seed comme l'est le tirage. Un duel est donc rejouable :
 * le client peut recalculer ce que le serveur a écrit, et le résumé de combat n'est pas une
 * affirmation à croire sur parole.
 */
const roll = (seed) => fnv1a(`${seed}:issue`) / 2 ** 32

export function resolveDuel({ left, right, seed }) {
  const pg = power(left)
  const pd = power(right)
  const probability = winProbability(pg, pd)
  const tirage = roll(seed)
  const gaucheGagne = tirage < probability

  const [vainqueur, perdant] = gaucheGagne ? [left, right] : [right, left]
  const [pv, pp] = gaucheGagne ? [pg, pd] : [pd, pg]
  const gain = levelGain(pv, pp)

  return {
    winner: gaucheGagne ? 'left' : 'right',
    probability,
    roll: tirage,
    left: { power: pg, level: left.level ?? 1, form: left.form ?? NORMAL_FORM },
    right: { power: pd, level: right.level ?? 1, form: right.form ?? NORMAL_FORM },
    gain,
    levelAfter: Math.min(LEVEL_MAX, (vainqueur.level ?? 1) + gain),
  }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run shared/battle.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/battle.js shared/battle.test.js
git commit -m "feat: résolution déterministe d'un duel d'arène, rejouable depuis son seed"
```

---

### Task 7: Économie de l'arène — enjeu, gains, boutique

Les constantes économiques sont dans un fichier séparé du moteur : la simulation de la tâche 8 en a besoin, et les lots suivants les liront sans importer le combat.

**Files:**
- Create: `shared/arena-economy.js`
- Test: `shared/arena-economy.test.js`

**Interfaces:**
- Produces:
  - `TIER_ORDER: ['c', 'u', 'r', 'l']`
  - `coveredTier(a: String, b: String) => String` — le plus petit des deux paliers, c'est-à-dire l'**enjeu du duel**
  - `REWARD: { [tier]: { dollars: Number, points: Number } }`
  - `HOUSE_REWARD: { [tier]: Number }` — pokédollars seulement
  - `SHOP: Array<{ slug, gen, tier, fresh: Boolean, price: Number }>`
  - `FRESH_MULTIPLIER: 2.5`
  - `SEASON_PODIUM: [2500, 1250, 600]`
  - `CREDIT_PER_WORKING_DAY: 1`, `CREDIT_CAP: 5`, `PAIR_WEEKLY_CAP: 2`, `CHALLENGE_EXPIRY_HOURS: 24`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `shared/arena-economy.test.js` :

```js
import { describe, it, expect } from 'vitest'
import {
  TIER_ORDER, coveredTier, REWARD, HOUSE_REWARD, SHOP, FRESH_MULTIPLIER,
  SEASON_PODIUM, CREDIT_PER_WORKING_DAY, CREDIT_CAP, PAIR_WEEKLY_CAP, CHALLENGE_EXPIRY_HOURS,
} from './arena-economy.js'

describe('coveredTier', () => {
  it('rend le palier commun quand les deux camps engagent un commun', () => {
    expect(coveredTier('c', 'c')).toBe('c')
  })

  // On ne gagne pas plus que ce que l'adversaire a engagé : c'est ce qui interdit à la fois
  // d'écraser un Roucool avec un légendaire et de venir en Roucool pour rafler gros.
  it('rend le plus petit des deux paliers', () => {
    expect(coveredTier('l', 'c')).toBe('c')
    expect(coveredTier('c', 'l')).toBe('c')
    expect(coveredTier('r', 'u')).toBe('u')
    expect(coveredTier('u', 'r')).toBe('u')
  })

  it('est commutatif sur toutes les paires', () => {
    for (const a of TIER_ORDER) for (const b of TIER_ORDER) {
      expect(coveredTier(a, b)).toBe(coveredTier(b, a))
    }
  })
})

describe('gains', () => {
  it('couvre les quatre paliers, strictement croissants', () => {
    const dollars = TIER_ORDER.map((t) => REWARD[t].dollars)
    const points = TIER_ORDER.map((t) => REWARD[t].points)
    expect(dollars).toEqual([50, 100, 250, 600])
    expect(points).toEqual([5, 10, 25, 60])
  })

  // Mesuré avant écriture : à demi-tarif, farmer la maison rapportait 2 750 $ par saison
  // SANS AUCUN RISQUE, contre 5 406 $ en duels réels — l'option sûre devenait presque aussi
  // rentable que l'option risquée. Le quart la ramène à 21 %.
  it('paye la maison au quart du tarif humain, en pokédollars seulement', () => {
    expect(HOUSE_REWARD).toEqual({ c: 12, u: 25, r: 62, l: 150 })
    for (const t of TIER_ORDER) expect(HOUSE_REWARD[t]).toBeLessThan(REWARD[t].dollars / 3)
  })
})

describe('boutique', () => {
  it('vend les trois paliers de chaque génération, plus le légendaire', () => {
    expect(SHOP.filter((a) => !a.fresh)).toHaveLength(7)
  })

  it('propose chaque article aussi en inédit garanti, à 2,5 fois le prix', () => {
    for (const normal of SHOP.filter((a) => !a.fresh)) {
      const inedit = SHOP.find((a) => a.fresh && a.gen === normal.gen && a.tier === normal.tier)
      expect(inedit.price).toBe(normal.price * FRESH_MULTIPLIER)
    }
  })

  it('vend la Gen 2 deux fois le prix de la Gen 1 à palier égal', () => {
    for (const tier of ['c', 'u', 'r']) {
      const g1 = SHOP.find((a) => !a.fresh && a.gen === 1 && a.tier === tier)
      const g2 = SHOP.find((a) => !a.fresh && a.gen === 2 && a.tier === tier)
      expect(g2.price).toBe(g1.price * 2)
    }
  })

  // ~5 400 pokédollars par saison (spec § 4) : le dernier objectif du jeu doit demander
  // près de trois saisons, sans quoi il n'y a plus rien à viser passé six mois.
  it('place le légendaire inédit à environ trois saisons d’économies', () => {
    const legendaire = SHOP.find((a) => a.fresh && a.tier === 'l')
    expect(legendaire.price / 5400).toBeGreaterThan(2.5)
    expect(legendaire.price / 5400).toBeLessThan(3.2)
  })
})

describe('plafonds de jeu', () => {
  it('reprend les valeurs de la spec', () => {
    expect(CREDIT_PER_WORKING_DAY).toBe(1)
    expect(CREDIT_CAP).toBe(5)
    expect(PAIR_WEEKLY_CAP).toBe(2)
    expect(CHALLENGE_EXPIRY_HOURS).toBe(24)
    expect(SEASON_PODIUM).toEqual([2500, 1250, 600])
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run shared/arena-economy.test.js`
Expected: FAIL — `Failed to resolve import "./arena-economy.js"`

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `shared/arena-economy.js` :

```js
export const TIER_ORDER = ['c', 'u', 'r', 'l']

/**
 * L'« enjeu du duel » : on ne gagne pas plus que ce que l'adversaire a engagé, comme au
 * poker. C'est la règle qui supprime d'un seul mouvement les deux stratégies dégénérées —
 * écraser un Roucool avec un légendaire, et venir en Roucool pour tenter l'exploit.
 */
export const coveredTier = (a, b) =>
  TIER_ORDER[Math.min(TIER_ORDER.indexOf(a), TIER_ORDER.indexOf(b))]

export const REWARD = {
  c: { dollars: 50, points: 5 },
  u: { dollars: 100, points: 10 },
  r: { dollars: 250, points: 25 },
  l: { dollars: 600, points: 60 },
}

/**
 * La maison ne possède rien : elle ne peut ni détruire ni créer un exemplaire, seulement
 * payer. Au quart du tarif humain et non à la moitié — la simulation a montré qu'à
 * demi-tarif, farmer l'IA rapportait presque autant qu'une saison de duels réels, sans
 * jamais rien risquer.
 */
export const HOUSE_REWARD = { c: 12, u: 25, r: 62, l: 150 }

export const FRESH_MULTIPLIER = 2.5

const BASE_PRICES = [
  { gen: 1, tier: 'c', price: 500 },
  { gen: 1, tier: 'u', price: 1000 },
  { gen: 1, tier: 'r', price: 2500 },
  { gen: 2, tier: 'c', price: 1000 },
  { gen: 2, tier: 'u', price: 2000 },
  { gen: 2, tier: 'r', price: 5000 },
  { gen: 1, tier: 'l', price: 6000 },
]

/**
 * L'inédit garanti tire uniquement parmi les espèces non possédées. Il existe parce que
 * l'objectif de la boutique est de compléter : un pli rare tire parmi 46 espèces, donc
 * quand il en manque trois, on paye pour un doublon neuf fois sur dix.
 */
export const SHOP = BASE_PRICES.flatMap(({ gen, tier, price }) => [
  { slug: `gen${gen}-${tier}`, gen, tier, fresh: false, price },
  { slug: `gen${gen}-${tier}-inedit`, gen, tier, fresh: true, price: price * FRESH_MULTIPLIER },
])

export const SEASON_PODIUM = [2500, 1250, 600]

export const CREDIT_PER_WORKING_DAY = 1
export const CREDIT_CAP = 5
export const PAIR_WEEKLY_CAP = 2
export const CHALLENGE_EXPIRY_HOURS = 24
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run shared/arena-economy.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/arena-economy.js shared/arena-economy.test.js
git commit -m "feat: constantes économiques de l'arène — enjeu, gains, boutique, plafonds"
```

---

### Task 8: Simulation d'équilibrage

C'est la raison d'être du lot. La spec (§ 7) exige quatre acquis **démontrés, pas supposés**. Le script est importable pour que le test les assère, et exécutable à la main pour lire les distributions quand on veut régler une constante.

**Files:**
- Create: `scripts/simulate-arena.mjs`
- Test: `shared/arena-balance.test.js`
- Modify: `package.json` (ajout d'un script npm)

**Interfaces:**
- Consumes: `formOf`, `resolveDuel` depuis `shared/battle.js` ; `coveredTier`, `REWARD`, `HOUSE_REWARD` depuis `shared/arena-economy.js` ; `POOL`, `DEX` depuis `shared/species.js`.
- Produces: `simulateSeason({ policy, weeks, seed }) => { dollars, points, plis, lost, duels, winRate }` et `simulateLegendaryLife({ weeks, seed }) => Number` (nombre de semaines survécues), exportés depuis `scripts/simulate-arena.mjs`.
- `policy` est l'une des chaînes `'commun'`, `'peu-commun'`, `'rare'`, `'legendaire'`, `'maison'`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `shared/arena-balance.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { simulateSeason, simulateLegendaryLife } from '../scripts/simulate-arena.mjs'

// Une saison : deux mois, ~8,7 semaines, 5 crédits par semaine ouvrée.
const SAISON = 8.7
const RUNS = 40

/** Moyenne sur plusieurs saisons : une saison isolée varie trop pour un seuil stable. */
function moyenne(policy) {
  const runs = Array.from({ length: RUNS }, (_, i) =>
    simulateSeason({ policy, weeks: SAISON, seed: `eq-${i}` }))
  const moy = (f) => runs.reduce((a, r) => a + f(r), 0) / RUNS
  return {
    dollars: moy((r) => r.dollars), points: moy((r) => r.points),
    plis: moy((r) => r.plis), lost: moy((r) => r.lost),
    duels: moy((r) => r.duels), winRate: moy((r) => r.winRate),
  }
}

describe('équilibrage de l’arène', () => {
  // Acquis 1 de la spec : aucune stratégie de mise dominante. Engager petit doit perdre.
  // Mesuré : ~1 060 $ en commun contre ~5 400 $ en rare.
  it('rapporte bien moins en engageant toujours un commun qu’un rare', () => {
    const commun = moyenne('commun')
    const rare = moyenne('rare')
    expect(commun.dollars).toBeLessThan(rare.dollars / 2)
    expect(commun.points).toBeLessThan(rare.points / 2)
  })

  // Acquis 2 : le rare s'autofinance — on en perd un sur deux, on gagne un pli rare l'autre
  // fois. C'est ce qui en fait le point d'équilibre naturel plutôt qu'un pari.
  it('laisse le stock de rares stable pour qui n’engage que des rares', () => {
    const r = moyenne('rare')
    expect(Math.abs(r.plis - r.lost) / r.duels).toBeLessThan(0.10)
  })

  it('donne une victoire sur deux quand les deux camps engagent le même palier', () => {
    for (const policy of ['commun', 'peu-commun', 'rare', 'legendaire']) {
      expect(moyenne(policy).winRate).toBeGreaterThan(0.42)
      expect(moyenne(policy).winRate).toBeLessThan(0.58)
    }
  })

  // Le légendaire est la politique la plus RENTABLE (~13 000 $, deux fois et demie le rare),
  // et rien dans la table des gains ne l'en empêche. Ce qui l'interdit est le stock : il
  // coûte une vingtaine de légendaires par saison quand on en tire environ un.
  it('rend la politique légendaire rentable mais inabordable', () => {
    const l = moyenne('legendaire')
    expect(l.dollars).toBeGreaterThan(moyenne('rare').dollars)
    expect(l.lost).toBeGreaterThan(10)
  })

  // Acquis 3 : un légendaire descendu chaque semaine finit détruit. Le bornage à 90 % suffit
  // à le garantir — c'est ce qui empêche un rouleau compresseur immortel.
  it('détruit un légendaire engagé chaque semaine en quelques mois', () => {
    const vies = Array.from({ length: 200 }, (_, i) =>
      simulateLegendaryLife({ weeks: 52, seed: `vie-${i}` }))
    const survivants = vies.filter((v) => v >= 52).length
    expect(survivants / vies.length).toBeLessThan(0.10)
    const mediane = vies.slice().sort((a, b) => a - b)[Math.floor(vies.length / 2)]
    expect(mediane).toBeLessThan(30)
  })

  // Acquis 4 : la boutique reste hors de portée du seul farming contre la maison. Mesuré à
  // ~21 % du jeu humain avec le quart de tarif — c'était ~96 % au demi-tarif initial.
  it('rapporte moins de la moitié en n’affrontant que la maison', () => {
    const maison = moyenne('maison')
    const humain = moyenne('rare')
    expect(maison.dollars).toBeLessThan(humain.dollars / 2)
    expect(maison.points).toBe(0)
    expect(maison.plis).toBe(0)
    expect(maison.lost).toBe(0)
  })

  // Les prix de la boutique sont calés sur ce chiffre (spec § 4) : s'il dérive, ce sont les
  // prix qu'il faut reprendre, pas ce seuil.
  it('place une saison de jeu humain autour de 5 400 pokédollars', () => {
    expect(moyenne('rare').dollars).toBeGreaterThan(4500)
    expect(moyenne('rare').dollars).toBeLessThan(6500)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run shared/arena-balance.test.js`
Expected: FAIL — `Failed to resolve import "../scripts/simulate-arena.mjs"`

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `scripts/simulate-arena.mjs` :

```js
import { POOL, DEX } from '../shared/species.js'
import { fnv1a } from '../shared/draw.js'
import { formOf, resolveDuel } from '../shared/battle.js'
import { coveredTier, REWARD, HOUSE_REWARD } from '../shared/arena-economy.js'

const DUELS_PER_WEEK = 5
const POLICY_TIER = { commun: 'c', 'peu-commun': 'u', rare: 'r', legendaire: 'l' }

/** Espèce tirée dans le pool d'un palier, de façon reproductible depuis un seed. */
const pickSpecies = (tier, seed) => POOL[tier][fnv1a(seed) % POOL[tier].length]

/**
 * Le terrain adverse joue la MÊME politique que le joueur, et son champion monte en niveau
 * comme le sien. C'est la seule façon de mesurer un taux de victoire non biaisé : une
 * première version faisait jouer au joueur des exemplaires toujours neufs face à des
 * vétérans, ce qui écrasait tous les taux à 43 % et faisait conclure à tort que le rare ne
 * s'autofinançait pas.
 *
 * Chaque camp remplace son exemplaire détruit par un frais de niveau 1 — ce que fait un
 * vrai joueur, qui repart de sa réserve.
 */
export function simulateSeason({ policy, weeks, seed }) {
  const duels = Math.round(weeks * DUELS_PER_WEEK)
  const mien = POLICY_TIER[policy] ?? 'r'
  let dollars = 0
  let points = 0
  let plis = 0
  let lost = 0
  let wins = 0

  let moi = { species: pickSpecies(mien, `${seed}:m0`), level: 1 }
  let lui = { species: pickSpecies(mien, `${seed}:a0`), level: 1 }

  for (let i = 0; i < duels; i++) {
    const s = `${seed}:${i}`
    const gauche = { ...moi, form: formOf(`${s}:moi`, 'jour') }
    const droite = { ...lui, form: formOf(`${s}:adv`, 'jour') }

    if (policy === 'maison') {
      // Contre la maison, rien n'est détruit ni créé : seulement des pokédollars, au quart
      // du tarif humain et au palier de sa propre mise. Aucun point, donc une saison entière
      // en solo ne fait pas monter au classement — par construction.
      if (resolveDuel({ left: gauche, right: droite, seed: s }).winner === 'left') {
        dollars += HOUSE_REWARD[mien]
        wins++
      }
      lui = { species: pickSpecies(mien, `${s}:adv`), level: 1 + (fnv1a(`${s}:niveau`) % 4) }
      continue
    }

    const enjeu = coveredTier(DEX[moi.species].tier, DEX[lui.species].tier)
    const issue = resolveDuel({ left: gauche, right: droite, seed: s })

    if (issue.winner === 'left') {
      dollars += REWARD[enjeu].dollars
      points += REWARD[enjeu].points
      plis++
      wins++
      moi = { ...moi, level: issue.levelAfter }
      lui = { species: pickSpecies(mien, `${s}:adv`), level: 1 }
    } else {
      lost++
      moi = { species: pickSpecies(mien, `${s}:moi`), level: 1 }
      lui = { ...lui, level: issue.levelAfter }
    }
  }

  return { dollars, points, plis, lost, duels, winRate: wins / duels }
}

/**
 * Le terrain ordinaire vu par un légendaire qui descend dans l'arène : majoritairement du
 * peu commun et du rare, à des niveaux bas — la plupart des exemplaires sont frais, les
 * vétérans sont rares parce que les niveaux se gagnent lentement.
 */
const ORDINARY_FIELD = ['u', 'u', 'r', 'r', 'c']
const ordinaryTier = (seed) => ORDINARY_FIELD[fnv1a(`${seed}:terrain`) % ORDINARY_FIELD.length]
const ordinaryLevel = (seed) => 1 + (fnv1a(`${seed}:niveau`) % 3)

/**
 * Un légendaire descendu une fois par semaine face à ce terrain. Rend le nombre de semaines
 * survécues. Le bornage à 90 % garantit qu'il finit par tomber — et comme un légendaire
 * frais (725 de puissance) dépasse à peine un bon rare (690), il tombe même assez vite.
 */
export function simulateLegendaryLife({ weeks, seed }) {
  let level = 1
  for (let w = 0; w < weeks; w++) {
    const s = `${seed}:${w}`
    const moi = { species: pickSpecies('l', `${seed}:mon-legendaire`), level, form: formOf(s, 'jour') }
    const lui = {
      species: pickSpecies(ordinaryTier(s), `${s}:lui`),
      level: ordinaryLevel(s),
      form: formOf(`${s}:adv`, 'jour'),
    }
    const issue = resolveDuel({ left: moi, right: lui, seed: s })
    if (issue.winner === 'right') return w
    level = issue.levelAfter
  }
  return weeks
}

function main() {
  const SAISON = 8.7
  console.log('Une saison de deux mois, 5 duels par semaine ouvrée.\n')
  for (const policy of ['commun', 'peu-commun', 'rare', 'legendaire', 'maison']) {
    const r = simulateSeason({ policy, weeks: SAISON, seed: `cli-${policy}` })
    console.log(
      `${policy.padEnd(12)} ${String(r.dollars).padStart(6)} $  ${String(r.points).padStart(4)} pts  ` +
      `${r.plis} plis gagnés  ${r.lost} exemplaires perdus  ${(r.winRate * 100).toFixed(0)} % de victoires`,
    )
  }

  const vies = Array.from({ length: 200 }, (_, i) => simulateLegendaryLife({ weeks: 52, seed: `cli-vie-${i}` }))
  const mediane = vies.slice().sort((a, b) => a - b)[Math.floor(vies.length / 2)]
  console.log(`\nLégendaire engagé chaque semaine : ${mediane} semaines de survie médiane, ` +
    `${vies.filter((v) => v >= 52).length}/200 tiennent un an.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run shared/arena-balance.test.js`
Expected: PASS

**Si un test échoue, c'est le résultat attendu du lot, pas un bug à contourner.** Ne pas ajuster les seuils du test pour les faire passer : noter l'écart, et remonter la constante fautive pour arbitrage avant d'aller plus loin. C'est exactement ce que ce lot sert à découvrir.

- [ ] **Step 5: Ajouter le script npm**

Dans `package.json`, à la suite de `"gen:species-info"` :

```json
    "simulate:arena": "node scripts/simulate-arena.mjs"
```

- [ ] **Step 6: Lire les distributions**

Run: `npm run simulate:arena`
Expected: un tableau des cinq politiques et la survie médiane d'un légendaire. Consigner ces chiffres dans le compte rendu de fin de lot.

- [ ] **Step 7: Lancer toute la suite**

Run: `npm test`
Expected: PASS — aucun test existant cassé par l'ajout du champ `stats`.

- [ ] **Step 8: Commit**

```bash
git add scripts/simulate-arena.mjs shared/arena-balance.test.js package.json
git commit -m "feat: simulation d'équilibrage de l'arène et test des quatre acquis de la spec"
```

---

## À la fin du lot

Rendre un compte rendu portant :

1. **Les chiffres de `npm run simulate:arena`** — pokédollars, points, plis, pertes et taux de victoire pour les cinq politiques, plus la survie médiane d'un légendaire.
2. **Les acquis vérifiés, et ceux qui ont résisté.** Tout test d'équilibrage ayant demandé un arbitrage doit être signalé nommément, avec la constante en cause.
3. **Les écarts à la spec**, s'il y en a — la spec fait foi, donc un écart se corrige dans la spec par un commit dédié, jamais en silence.

Ce lot ne rend rien de visible dans l'application : il est mergeable tel quel, et le lot 2 (socle Supabase) ne commence qu'une fois ses chiffres arbitrés.
