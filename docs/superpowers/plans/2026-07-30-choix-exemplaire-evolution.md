# Choix de l'exemplaire à faire évoluer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Laisser le joueur choisir explicitement quel exemplaire faire évoluer, au lieu du choix automatique actuel (priorité au chromatique), tout en gardant le chromatique protégé par une pré-sélection par défaut.

**Architecture:** `useCollection.evolve` accepte désormais une `specimenKey` explicite au lieu de la choisir en interne. `SpeciesSheet.vue` gagne une étape de sélection (état local `pickingTarget`/`selectedKey`) entre le clic sur une cible d'évolution et l'émission de l'event `evolve`. `App.vue` relie la nouvelle prop `available` et adapte son handler.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vitest + `@vue/test-utils`.

## Global Constraints

- Commentaires en français, uniquement pour expliquer un POURQUOI non évident (constat déjà en place dans tout le repo) — ne pas commenter le QUOI.
- Suite de tests : `npm test` (= `vitest run`). Un fichier de test par composant/composable (`*.test.js` à côté du fichier testé).
- Ne pas introduire de nouvelle dépendance.
- Respecter le style existant : pas de TypeScript, pas de store externe, logique dérivée dans `useDex.js` (lecture seule), effets de bord dans `useCollection.js`.

---

### Task 1: `evolve` accepte une clé d'exemplaire explicite

**Files:**
- Modify: `src/composables/useCollection.js:125-182`
- Test: `src/composables/useCollection.test.js:220-403` (describe `évolution` + describe `erreur périmée`)

**Interfaces:**
- Consumes: `entryKey` (`shared/entry.js`), `DEX`/`familyOf`/`CANDY_PER_CATCH` (`shared/species.js`) — inchangés.
- Produces: `evolve(fromId, toId, specimenKey, date)` — nouvelle signature (3ᵉ paramètre `specimenKey` inséré avant `date`). Consommée par Task 2 (via `App.vue`, lui-même modifié en Task 3).

- [ ] **Step 1: Écrire les tests qui décrivent la nouvelle signature (ils doivent échouer)**

Remplacer entièrement le contenu du describe `'évolution'` dans
`src/composables/useCollection.test.js` (lignes 220-387) par :

```js
describe('évolution', () => {
  const threeBulbizarre = Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1))
  const claimedThree = { claimed: keysOf(threeBulbizarre), spent: {}, evolutions: [] }

  it('dépense les bonbons et enregistre l’évolution avec la clé choisie', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s0'), '2026-07-20')
    expect(c.state.value.spent[1]).toBe(8)
    expect(c.state.value.evolutions).toEqual([
      { species: 2, from: 1, fromKey: K('s0'), date: '2026-07-20' },
    ])
    expect(client.writeState).toHaveBeenCalledOnce()
  })

  it('consomme l’exemplaire choisi explicitement, y compris un chromatique', async () => {
    const catches = [catchOf('s0', 1), catchOf('s1', 1, { shiny: true }), catchOf('s2', 1)]
    const client = fakeClient({ catches, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s1'), '2026-07-20')
    expect(c.state.value.evolutions[0].fromKey).toBe(K('s1'))
  })

  it('consomme l’exemplaire choisi même non chromatique, alors qu’un chromatique existe', async () => {
    // Le choix appartient au joueur : la couche données ne force plus la priorité au shiny,
    // elle valide seulement que la clé demandée correspond à un exemplaire disponible.
    const catches = [catchOf('s0', 1), catchOf('s1', 1, { shiny: true }), catchOf('s2', 1)]
    const client = fakeClient({ catches, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s2'), '2026-07-20')
    expect(c.state.value.evolutions[0].fromKey).toBe(K('s2'))
  })

  it('refuse une clé d’exemplaire qui n’est plus disponible', async () => {
    const catches = [catchOf('s0', 1), catchOf('s1', 1, { shiny: true }), catchOf('s2', 1)]
    const client = fakeClient({ catches, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('inconnue'), '2026-07-20')
    expect(c.state.value.evolutions).toEqual([])
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('consomme l’exemplaire évolué : plus disponible pour une évolution suivante, mais l’espèce reste acquise', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s0'), '2026-07-20')
    expect(c.dex.copyCount(1)).toBe(2)
    expect(c.dex.bySpecies.value[1]).toHaveLength(3) // toujours dans le journal / la grille
  })

  it('compte les bonbons de toutes les sources confondues', async () => {
    // Deux captures GitHub et une capture d'une autre source dans la même famille : le coût
    // est atteint et l'évolution passe. Le jeu ne trie pas ses bonbons par pôle.
    const catches = [catchOf('s0', 1), catchOf('s1', 2), catchOf('x', 3, { source: 'crm' })]
    const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s0'), '2026-07-20')
    expect(c.state.value.spent[1]).toBe(8)
  })

  it('refuse d’évoluer sans exemplaire disponible, même avec assez de bonbons', async () => {
    // Une seule capture, mais suffisamment de doublons dans le reste de la famille pour
    // financer le coût — les bonbons ne sont pas liés à un exemplaire précis.
    const catches = [
      catchOf('only', 1),
      ...Array.from({ length: 5 }, (_, i) => catchOf('extra' + i, 2)),
    ]
    const client = fakeClient({
      catches,
      state: {
        claimed: keysOf(catches),
        spent: {},
        evolutions: [{ species: 2, from: 1, fromKey: K('only'), date: '2026-07-01' }],
      },
    })
    const c = useCollection()
    await c.load(client)
    expect(c.dex.copyCount(1)).toBe(0)
    await c.evolve(1, 2, K('only'), '2026-07-20')
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('refuse l’évolution sans bonbons suffisants et n’écrit rien', async () => {
    const client = fakeClient({ catches: [catchOf('a', 1)], state: { claimed: [K('a')], spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('a'), '2026-07-20')
    expect(c.state.value.evolutions).toEqual([])
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('refuse une cible qui n’est pas une évolution de la source', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 130, K('s0'), '2026-07-20')
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('refuse d’évoluer une espèce terminale', async () => {
    const catches = Array.from({ length: 3 }, (_, i) => catchOf('r' + i, 143))
    const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(143, 999, K('r0'), '2026-07-20')
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('accepte chacune des trois évolutions d’Évoli', async () => {
    for (const target of [134, 135, 136]) {
      const catches = Array.from({ length: 3 }, (_, i) => catchOf('e' + i, 133))
      const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
      const c = useCollection()
      await c.load(client)
      await c.evolve(133, target, K('e0'), '2026-07-20')
      expect(c.state.value.evolutions[0].species).toBe(target)
    }
  })

  it('restaure l’état si l’écriture échoue', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    client.writeState.mockRejectedValue(new SupabaseDataError('offline', 'pas de réseau'))
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s0'), '2026-07-20')
    expect(c.state.value.spent[1]).toBeUndefined()
    expect(c.state.value.evolutions).toEqual([])
    expect(c.error.value).toBe('offline')
  })

  it('abandonne le rejeu si l’autre appareil a déjà dépensé les mêmes bonbons', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    client.writeState.mockRejectedValueOnce(new SupabaseDataError('conflict', 'stale', 409))
    client.readState
      .mockResolvedValueOnce({ state: claimedThree, blobSha: 'blob1' })
      .mockResolvedValueOnce({
        state: {
          claimed: keysOf(threeBulbizarre),
          spent: { 1: 8 },
          evolutions: [{ species: 2, from: 1, fromKey: K('s1'), date: '2026-07-19' }],
        },
        blobSha: 'blob8',
      })

    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s0'), '2026-07-20')

    expect(c.state.value.spent[1]).toBe(8)
    expect(c.state.value.evolutions).toHaveLength(1)
    expect(c.dex.candies(1)).toBeGreaterThanOrEqual(0)
    expect(c.error.value).toBeNull()
    expect(client.writeState).toHaveBeenCalledOnce()
  })

  it('rejoue et écrit quand l’état frais permet toujours l’évolution', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    client.writeState
      .mockRejectedValueOnce(new SupabaseDataError('conflict', 'stale', 409))
      .mockResolvedValueOnce({ blobSha: 'blob9' })
    client.readState
      .mockResolvedValueOnce({ state: claimedThree, blobSha: 'blob1' })
      .mockResolvedValueOnce({ state: claimedThree, blobSha: 'blob8' })

    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, K('s0'), '2026-07-20')

    expect(c.state.value.spent[1]).toBe(8)
    expect(c.state.value.evolutions).toHaveLength(1)
    expect(c.error.value).toBeNull()
    expect(client.writeState).toHaveBeenCalledTimes(2)
  })

  it('facture 40 bonbons à Magicarpe', async () => {
    const catches = Array.from({ length: 14 }, (_, i) => catchOf('m' + i, 129))
    const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(129, 130, K('m0'), '2026-07-20')
    expect(c.state.value.spent[129]).toBe(40)
  })
})
```

Et, dans le describe `'erreur périmée'` (ligne ~400), remplacer
`await c.evolve(1, 2, '2026-07-20')` par `await c.evolve(1, 2, K('a'), '2026-07-20')`.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/composables/useCollection.test.js`
Expected: plusieurs échecs — les appels passent maintenant 4 arguments à une fonction qui
n'en attend que 3, et les tests "consomme l'exemplaire choisi... non chromatique" /
"refuse une clé... plus disponible" échouent car le code priorise encore le shiny en interne.

- [ ] **Step 3: Modifier `useCollection.js`**

Remplacer (lignes 125-148, fonction `pickAvailable`) :

```js
  /**
   * Exemplaire disponible de `fromId` sur un état `s` donné (pas nécessairement `state.value`
   * — `persist` rejoue ce calcul sur l'état frais après un conflit). Un exemplaire chromatique
   * est privilégié : perdre un shiny à l'évolution se lirait comme un bug. Réplique volontairement
   * la logique de `useDex` (clé, exemplaires consommés) sur un objet simple plutôt que sur des
   * refs, `s` n'étant qu'un clone en cours de mutation.
   */
  function pickAvailable(fromId, s) {
    const claimedSet = new Set(s.claimed)
    const claimedEntries = catches.value
      .map((c) => ({ ...c, key: entryKey(c.source, c.external_id) }))
      .filter((c) => claimedSet.has(c.key))
    const evolvedEntries = []
    s.evolutions.forEach((e, i) => {
      const pool = [...claimedEntries, ...evolvedEntries]
      const fromKey = e.fromKey ?? e.fromSha
      const src = fromKey ? pool.find((c) => c.key === fromKey) : pool.find((c) => c.species === e.from)
      evolvedEntries.push({ species: e.species, shiny: src?.shiny ?? false, key: `evo:${i}` })
    })
    const consumed = new Set(s.evolutions.map((e) => e.fromKey ?? e.fromSha).filter(Boolean))
    const available = [...claimedEntries, ...evolvedEntries]
      .filter((c) => c.species === fromId && !consumed.has(c.key))
    return available.find((c) => c.shiny) ?? available[0]
  }
```

par :

```js
  /**
   * Exemplaires disponibles de `fromId` sur un état `s` donné (pas nécessairement `state.value`
   * — `persist` rejoue ce calcul sur l'état frais après un conflit). Réplique volontairement la
   * logique de `useDex` (clé, exemplaires consommés) sur un objet simple plutôt que sur des refs,
   * `s` n'étant qu'un clone en cours de mutation. Le choix de l'exemplaire précis revient au
   * joueur (`specimenKey` dans `evolve`) : cette fonction énumère, elle ne priorise rien.
   */
  function availableFor(fromId, s) {
    const claimedSet = new Set(s.claimed)
    const claimedEntries = catches.value
      .map((c) => ({ ...c, key: entryKey(c.source, c.external_id) }))
      .filter((c) => claimedSet.has(c.key))
    const evolvedEntries = []
    s.evolutions.forEach((e, i) => {
      const pool = [...claimedEntries, ...evolvedEntries]
      const fromKey = e.fromKey ?? e.fromSha
      const src = fromKey ? pool.find((c) => c.key === fromKey) : pool.find((c) => c.species === e.from)
      evolvedEntries.push({ species: e.species, shiny: src?.shiny ?? false, key: `evo:${i}` })
    })
    const consumed = new Set(s.evolutions.map((e) => e.fromKey ?? e.fromSha).filter(Boolean))
    return [...claimedEntries, ...evolvedEntries]
      .filter((c) => c.species === fromId && !consumed.has(c.key))
  }
```

Puis remplacer la fonction `evolve` (lignes 150-182) :

```js
  async function evolve(fromId, toId, date) {
    error.value = null
    const source = DEX[fromId]
    if (!source?.to) return
    const targets = Array.isArray(source.to) ? source.to : [source.to]
    if (!targets.includes(toId)) return
    if (!dex.canEvolve(fromId)) return

    const fam = familyOf(fromId)
    await persist(
      (s) => {
        // Revalidation sur l'état reçu, et non sur l'état d'avant l'appel : `persist` rejoue
        // ce mutateur sur l'état frais après un conflit. Sans ce recalcul, deux appareils
        // dépensent les mêmes bonbons, ou évoluent le même dernier exemplaire, et l'un des
        // deux devrait échouer plutôt que de passer en double.
        const claimedKeys = new Set(s.claimed)
        const earned = catches.value.filter(
          (c) => claimedKeys.has(entryKey(c.source, c.external_id)) && familyOf(c.species) === fam,
        ).length * CANDY_PER_CATCH
        if (earned - (s.spent[fam] ?? 0) < source.cost) return null

        const picked = pickAvailable(fromId, s)
        if (!picked) return null

        return {
          ...s,
          spent: { ...s.spent, [fam]: (s.spent[fam] ?? 0) + source.cost },
          evolutions: [...s.evolutions, { species: toId, from: fromId, fromKey: picked.key, date }],
        }
      },
      `evolve ${source.name} → ${DEX[toId].name}`,
    )
  }
```

par :

```js
  async function evolve(fromId, toId, specimenKey, date) {
    error.value = null
    const source = DEX[fromId]
    if (!source?.to) return
    const targets = Array.isArray(source.to) ? source.to : [source.to]
    if (!targets.includes(toId)) return
    if (!dex.canEvolve(fromId)) return

    const fam = familyOf(fromId)
    await persist(
      (s) => {
        // Revalidation sur l'état reçu, et non sur l'état d'avant l'appel : `persist` rejoue
        // ce mutateur sur l'état frais après un conflit. Sans ce recalcul, deux appareils
        // dépensent les mêmes bonbons, ou évoluent le même dernier exemplaire, et l'un des
        // deux devrait échouer plutôt que de passer en double. Si la clé demandée n'est plus
        // disponible sur l'état frais (déjà consommée par l'autre appareil), le mutateur
        // devient sans objet — même traitement que des bonbons insuffisants, sans repli
        // automatique sur un autre exemplaire.
        const claimedKeys = new Set(s.claimed)
        const earned = catches.value.filter(
          (c) => claimedKeys.has(entryKey(c.source, c.external_id)) && familyOf(c.species) === fam,
        ).length * CANDY_PER_CATCH
        if (earned - (s.spent[fam] ?? 0) < source.cost) return null

        const picked = availableFor(fromId, s).find((c) => c.key === specimenKey)
        if (!picked) return null

        return {
          ...s,
          spent: { ...s.spent, [fam]: (s.spent[fam] ?? 0) + source.cost },
          evolutions: [...s.evolutions, { species: toId, from: fromId, fromKey: picked.key, date }],
        }
      },
      `evolve ${source.name} → ${DEX[toId].name}`,
    )
  }
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/composables/useCollection.test.js`
Expected: PASS (tous les tests du fichier).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useCollection.js src/composables/useCollection.test.js
git commit -m "feat: evolve() prend en clé d'exemplaire explicite au lieu de la choisir en interne"
```

---

### Task 2: Sélecteur d'exemplaire dans `SpeciesSheet.vue`

**Files:**
- Modify: `src/components/SpeciesSheet.vue`
- Modify: `src/styles.css:218-222` (nouvelles règles pour le sélecteur)
- Test: `src/components/SpeciesSheet.test.js`

**Interfaces:**
- Consumes: rien de nouveau côté composables — reçoit `available` en prop (fournie par
  `dex.availableEntries(id)`, chaque entrée avec `key: string` et `shiny: boolean`, déjà
  produites par `useDex.js:64-66`, existant, non modifié dans cette tâche).
- Produces: event `evolve` avec payload `{ from: number, to: number, key: string }` (au lieu de
  `{ from, to }`) — consommé par Task 3 (`App.vue`).

- [ ] **Step 1: Écrire/adapter les tests du composant (ils doivent échouer)**

Dans `src/components/SpeciesSheet.test.js`, changer la ligne 15-18 (`mountSheet`) pour inclure
la nouvelle prop par défaut :

```js
const mountSheet = (props) =>
  mount(SpeciesSheet, {
    props: { id: 1, entries: null, available: [], candies: 0, canEvolve: false, isDeadEnd: false, ...props },
  })
```

Remplacer entièrement le describe `'bonbons et évolution'` (lignes 107-149) par :

```js
describe('bonbons et évolution', () => {
  it('affiche la jauge avec le coût de l’espèce', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], candies: 3 })
    expect(w.find('.candy-nums').text()).toContain('3')
    expect(w.find('.candy-nums').text()).toContain('8')
  })

  it('désactive le bouton quand les bonbons manquent', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], candies: 3, canEvolve: false })
    expect(w.find('.evo-btn').attributes('disabled')).toBeDefined()
  })

  it('affiche le sélecteur d’exemplaire au clic sur le bouton d’évolution', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn').trigger('click')
    expect(w.find('.picker-row').exists()).toBe(true)
    expect(w.find('.evo-choices').exists()).toBe(false)
  })

  it('émet l’évolution avec l’exemplaire choisi après confirmation', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn').trigger('click')
    await w.find('.evo-btn').trigger('click') // le même bouton sert de « Confirmer » à l'étape 2
    expect(w.emitted('evolve')[0]).toEqual([{ from: 1, to: 2, key: 'github:a' }])
  })

  it('propose les trois évolutions d’Évoli', () => {
    const w = mountSheet({ id: 133, entries: [capture('a', 133)], candies: 9, canEvolve: true })
    const choices = w.findAll('.evo-choice')
    expect(choices).toHaveLength(3)
    expect(w.text()).toContain('Aquali')
    expect(w.text()).toContain('Voltali')
    expect(w.text()).toContain('Pyroli')
  })

  it('émet le choix d’évolution d’Évoli après confirmation', async () => {
    const w = mountSheet({
      id: 133, entries: [capture('a', 133)], available: [capture('a', 133)], candies: 9, canEvolve: true,
    })
    await w.findAll('.evo-choice')[1].trigger('click')
    await w.find('.evo-btn').trigger('click')
    expect(w.emitted('evolve')[0]).toEqual([{ from: 133, to: 135, key: 'github:a' }])
  })

  it('n’affiche aucune jauge pour une espèce terminale', () => {
    const w = mountSheet({ id: 143, entries: [capture('a', 143)], isDeadEnd: true })
    expect(w.find('.candy').exists()).toBe(false)
  })

  it('borne la jauge à 100 % au-delà du coût', () => {
    const w = mountSheet({ id: 1, entries: [capture('a', 1)], candies: 40, canEvolve: true })
    expect(w.find('.cbar-fill').attributes('style')).toContain('width: 100%')
  })
})

describe('sélection de l’exemplaire à évoluer', () => {
  const shinyAndNot = [capture('a', 1), capture('b', 1, { shiny: true })]

  it('pré-coche le chromatique par défaut', async () => {
    const w = mountSheet({
      id: 1, entries: shinyAndNot, available: shinyAndNot, candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn').trigger('click')
    const checked = w.findAll('input[type=radio]').find((i) => i.element.checked)
    expect(checked.element.value).toBe('github:b')
  })

  it('permet de choisir un autre exemplaire que celui pré-coché', async () => {
    const w = mountSheet({
      id: 1, entries: shinyAndNot, available: shinyAndNot, candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn').trigger('click')
    const radios = w.findAll('input[type=radio]')
    await radios.find((i) => i.element.value === 'github:a').setValue()
    await w.find('.evo-btn').trigger('click')
    expect(w.emitted('evolve')[0]).toEqual([{ from: 1, to: 2, key: 'github:a' }])
  })

  it('affiche le sélecteur même avec un seul exemplaire disponible', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn').trigger('click')
    expect(w.findAll('.picker-row')).toHaveLength(1)
  })

  it('annule la sélection sans émettre d’évolution', async () => {
    const w = mountSheet({
      id: 1, entries: [capture('a', 1)], available: [capture('a', 1)], candies: 9, canEvolve: true,
    })
    await w.find('.evo-btn').trigger('click')
    await w.find('.cancel-btn').trigger('click')
    expect(w.find('.picker-row').exists()).toBe(false)
    expect(w.emitted('evolve')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/components/SpeciesSheet.test.js`
Expected: échecs — `available` n'existe pas encore en prop, les boutons émettent encore
`{ from, to }` directement sans passer par un sélecteur, `.picker-row`/`.cancel-btn` n'existent pas.

- [ ] **Step 3: Modifier le script de `SpeciesSheet.vue`**

Remplacer (lignes 1-16) :

```js
<script setup>
import { computed, ref } from 'vue'
import { DEX, PARENT, TIER_LABEL, TIER_VAR, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  id: { type: Number, required: true },
  entries: { type: Array, default: null },
  // Exemplaires disponibles maintenant (une évolution passée a pu en consommer) — distinct
  // de `entries.length`, qui reste le journal complet, y compris les exemplaires déjà évolués.
  copies: { type: Number, default: null },
  candies: { type: Number, required: true },
  canEvolve: { type: Boolean, required: true },
  isDeadEnd: { type: Boolean, required: true },
})
defineEmits(['close', 'evolve'])
```

par :

```js
<script setup>
import { computed, ref } from 'vue'
import { DEX, PARENT, TIER_LABEL, TIER_VAR, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  id: { type: Number, required: true },
  entries: { type: Array, default: null },
  // Exemplaires disponibles maintenant (une évolution passée a pu en consommer) — distinct
  // de `entries.length`, qui reste le journal complet, y compris les exemplaires déjà évolués.
  copies: { type: Number, default: null },
  candies: { type: Number, required: true },
  canEvolve: { type: Boolean, required: true },
  isDeadEnd: { type: Boolean, required: true },
  // Exemplaires consommables par une évolution, chacun avec sa `key` et son statut `shiny` —
  // sert au sélecteur, distinct de `entries` qui garde tout le journal (y compris consommé).
  available: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'evolve'])

// Cible d'évolution en cours de sélection (id de l'espèce), ou `null` hors sélection.
const pickingTarget = ref(null)
const selectedKey = ref(null)

function startPicking(target) {
  pickingTarget.value = target
  // Le chromatique reste protégé par défaut : pré-coché s'il y en a un, modifiable ensuite.
  selectedKey.value = props.available.find((e) => e.shiny)?.key ?? props.available[0]?.key ?? null
}

function cancelPicking() {
  pickingTarget.value = null
  selectedKey.value = null
}

function confirmEvolve() {
  if (!selectedKey.value) return
  const to = pickingTarget.value
  const key = selectedKey.value
  cancelPicking()
  emit('evolve', { from: props.id, to, key })
}
```

- [ ] **Step 4: Modifier le template de `SpeciesSheet.vue`**

Remplacer (bloc `<div v-if="caught && targets.length" class="sect">`, lignes 84-111) :

```html
      <div v-if="caught && targets.length" class="sect">
        <div class="eyebrow sect-h"><span>Bonbons {{ DEX[familyOf(id)].name }}</span></div>
        <div class="candy">
          <div class="candy-meter">
            <div class="candy-nums"><b>{{ candies }}</b><i> / {{ species.cost }}</i></div>
            <div class="cbar">
              <div class="cbar-fill" :style="{ width: Math.min(100, candies / species.cost * 100) + '%' }"></div>
            </div>
          </div>
          <button
            v-if="targets.length === 1" class="evo-btn" :disabled="!canEvolve"
            @click="$emit('evolve', { from: id, to: targets[0] })"
          >
            Faire évoluer en {{ DEX[targets[0]].name }}
          </button>
        </div>
        <div v-if="targets.length > 1" class="evo-choices">
          <button
            v-for="t in targets" :key="t" class="evo-choice" :disabled="!canEvolve"
            @click="$emit('evolve', { from: id, to: t })"
          >
            <img :src="spriteUrl(t)" :alt="DEX[t].name">{{ DEX[t].name }}
          </button>
        </div>
        <p class="muted" style="margin-top:12px">
          {{ CANDY_PER_CATCH }} bonbons par capture dans la famille. Les doublons servent à ça.
        </p>
      </div>
```

par :

```html
      <div v-if="caught && targets.length" class="sect">
        <div class="eyebrow sect-h"><span>Bonbons {{ DEX[familyOf(id)].name }}</span></div>

        <template v-if="!pickingTarget">
          <div class="candy">
            <div class="candy-meter">
              <div class="candy-nums"><b>{{ candies }}</b><i> / {{ species.cost }}</i></div>
              <div class="cbar">
                <div class="cbar-fill" :style="{ width: Math.min(100, candies / species.cost * 100) + '%' }"></div>
              </div>
            </div>
            <button
              v-if="targets.length === 1" class="evo-btn" :disabled="!canEvolve"
              @click="startPicking(targets[0])"
            >
              Faire évoluer en {{ DEX[targets[0]].name }}
            </button>
          </div>
          <div v-if="targets.length > 1" class="evo-choices">
            <button
              v-for="t in targets" :key="t" class="evo-choice" :disabled="!canEvolve"
              @click="startPicking(t)"
            >
              <img :src="spriteUrl(t)" :alt="DEX[t].name">{{ DEX[t].name }}
            </button>
          </div>
          <p class="muted" style="margin-top:12px">
            {{ CANDY_PER_CATCH }} bonbons par capture dans la famille. Les doublons servent à ça.
          </p>
        </template>

        <template v-else>
          <p class="muted" style="margin-bottom:12px">
            Choisis l'exemplaire à faire évoluer en <b>{{ DEX[pickingTarget].name }}</b>.
          </p>
          <div class="log">
            <label v-for="e in available" :key="e.key" class="log-row picker-row">
              <input type="radio" name="specimen" :value="e.key" v-model="selectedKey">
              <span v-if="e.via === 'catch'" class="log-sha">{{ e.source }}</span>
              <span v-else class="log-evo">↑ évo</span>
              <span class="log-title">
                {{ e.via === 'catch' ? e.label : 'Évolué depuis ' + DEX[e.from].name }}
                <span v-if="e.shiny" class="chip shiny-chip" style="margin-left:6px">✦</span>
              </span>
              <span class="log-date">{{ e.date }}</span>
            </label>
          </div>
          <div class="picker-actions">
            <button class="evo-btn" :disabled="!selectedKey" @click="confirmEvolve">Confirmer</button>
            <button class="cancel-btn" @click="cancelPicking">Annuler</button>
          </div>
        </template>
      </div>
```

- [ ] **Step 5: Ajouter les styles du sélecteur**

Dans `src/styles.css`, après la ligne `.evo-choice img{width:46px;height:46px}` (ligne 222),
ajouter :

```css
  .picker-row{cursor:pointer}
  .picker-row input{margin:0}
  .picker-actions{display:flex;gap:9px;margin-top:13px}
  .cancel-btn{border:1.5px solid var(--rule-hi);background:transparent;color:var(--ink-2);font-family:var(--f-label);font-weight:600;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:10px 16px;cursor:pointer}
  .cancel-btn:hover{border-color:var(--ink-3);color:var(--ink)}
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/components/SpeciesSheet.test.js`
Expected: PASS (tous les tests du fichier, y compris le gros test de non-régression sur les
151 espèces — inchangé, il ne clique jamais sur les boutons).

- [ ] **Step 7: Commit**

```bash
git add src/components/SpeciesSheet.vue src/components/SpeciesSheet.test.js src/styles.css
git commit -m "feat: sélecteur d'exemplaire avant confirmation d'une évolution"
```

---

### Task 3: Brancher `App.vue`

**Files:**
- Modify: `src/App.vue:107-114,147-155`

**Interfaces:**
- Consumes: `collection.dex.availableEntries(id)` (existant, `useDex.js:64-66`),
  `collection.evolve(fromId, toId, specimenKey, date)` (Task 1), event `evolve` avec
  `{ from, to, key }` émis par `SpeciesSheet` (Task 2).
- Produces: rien de consommé ailleurs — c'est le point d'intégration final.

Pas de fichier de test dédié à `App.vue` dans ce repo : la couverture vient des tests de
Task 1 et Task 2, qui verrouillent déjà chaque bout séparément. Cette tâche se vérifie par la
suite complète + une vérification manuelle en navigateur (`npm run dev`, `?demo` pour les
fixtures de démo).

- [ ] **Step 1: Modifier le handler `onEvolve`**

Remplacer (lignes 107-114) :

```js
async function onEvolve({ from, to }) {
  const shiny = collection.dex.bySpecies.value[from]?.some((e) => e.shiny) ?? false
  selected.value = null
  await collection.evolve(from, to, new Date().toISOString().slice(0, 10))
  // L'écriture a échoué : pas de cérémonie pour une évolution qui n'a pas eu lieu.
  if (collection.error.value) return
  evoAnim.value = { from, to, shiny }
}
```

par :

```js
async function onEvolve({ from, to, key }) {
  const shiny = collection.dex.availableEntries(from).find((e) => e.key === key)?.shiny ?? false
  selected.value = null
  await collection.evolve(from, to, key, new Date().toISOString().slice(0, 10))
  // L'écriture a échoué : pas de cérémonie pour une évolution qui n'a pas eu lieu.
  if (collection.error.value) return
  evoAnim.value = { from, to, shiny }
}
```

- [ ] **Step 2: Passer la prop `available` à `SpeciesSheet`**

Remplacer (lignes 147-155) :

```html
      <SpeciesSheet
        v-if="selected" :id="selected"
        :entries="collection.dex.bySpecies.value[selected] ?? null"
        :copies="collection.dex.copyCount(selected)"
        :candies="collection.dex.candies(selected)"
        :can-evolve="collection.dex.canEvolve(selected)"
        :is-dead-end="collection.dex.isDeadEnd(selected)"
        @close="selected = null" @evolve="onEvolve"
      />
```

par :

```html
      <SpeciesSheet
        v-if="selected" :id="selected"
        :entries="collection.dex.bySpecies.value[selected] ?? null"
        :available="collection.dex.availableEntries(selected)"
        :copies="collection.dex.copyCount(selected)"
        :candies="collection.dex.candies(selected)"
        :can-evolve="collection.dex.canEvolve(selected)"
        :is-dead-end="collection.dex.isDeadEnd(selected)"
        @close="selected = null" @evolve="onEvolve"
      />
```

- [ ] **Step 3: Lancer toute la suite de tests**

Run: `npm test`
Expected: PASS (aucune régression sur l'ensemble du repo).

- [ ] **Step 4: Vérification manuelle en navigateur**

Run: `npm run dev`, ouvrir `http://localhost:5173/?demo` (fixtures de démo, pas besoin de
session GitHub réelle — voir `onMounted` dans `App.vue:64-71`).

- Ouvrir une espèce avec au moins 2 exemplaires dont un chromatique et assez de bonbons.
- Cliquer sur le bouton d'évolution : le sélecteur doit apparaître, avec le chromatique
  pré-coché.
- Choisir explicitement l'autre exemplaire, confirmer : l'animation d'évolution ne doit
  **pas** se déclencher en mode chromatique (puisque l'exemplaire consommé est le non-shiny).
- Rouvrir l'espèce : l'exemplaire chromatique doit toujours être présent (non consommé).
- Vérifier aussi le cas Évoli (plusieurs cibles) : cible d'abord, puis sélecteur.

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: relie le sélecteur d'exemplaire à l'évolution dans App.vue"
```

---

## Self-Review Notes

- **Couverture du spec** : les 6 sections du spec (comportement attendu, couche données, UI,
  App.vue, tests, hors périmètre) ont chacune une tâche ou un test correspondant. Le cas
  "sélecteur toujours affiché même à 1 exemplaire" est couvert par le test
  `'affiche le sélecteur même avec un seul exemplaire disponible'` (Task 2). Le cas d'échec
  concurrent est couvert par `'refuse une clé d'exemplaire qui n'est plus disponible'` (Task 1).
- **Cohérence des types** : `evolve(fromId, toId, specimenKey, date)` — même ordre et mêmes
  noms dans Task 1 (définition) et Task 3 (appel). Event `evolve` — même forme
  `{ from, to, key }` dans Task 2 (émission) et Task 3 (réception).
- **Pas de placeholder** : chaque step contient le code exact à écrire, aucun "TODO".
