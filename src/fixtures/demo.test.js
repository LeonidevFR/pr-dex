import { describe, it, expect } from 'vitest'
import { demoCatches, loadDemoClient } from './demo.js'
import { entryKey } from '../../shared/entry.js'

describe('loadDemoClient.readLeaderboard', () => {
  it('renvoie quatre joueurs fictifs et exactement une ligne is_me', async () => {
    const rows = await loadDemoClient().readLeaderboard()
    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => r.is_me)).toHaveLength(1)
  })

  it('ne renvoie que des captures réduites, sans label ni url', async () => {
    const rows = await loadDemoClient().readLeaderboard()
    for (const c of rows.flatMap((r) => r.catches)) {
      expect(Object.keys(c).sort()).toEqual(['date', 'external_id', 'shiny', 'source', 'species'])
    }
  })

  it('la ligne is_me suit l’état courant : ouvrir un pli l’ajoute', async () => {
    const client = loadDemoClient()
    const before = (await client.readLeaderboard()).find((r) => r.is_me)
    const { state } = await client.readState()
    const all = await client.readCatches()
    const pending = all.find((c) => !state.claimed.includes(entryKey(c.source, c.external_id)))
    await client.writeState({ ...state, claimed: [...state.claimed, entryKey(pending.source, pending.external_id)] })
    const after = (await client.readLeaderboard()).find((r) => r.is_me)
    expect(after.catches).toHaveLength(before.catches.length + 1)
  })

  it('un joueur fictif porte au moins un shiny, un légendaire et deux évolutions', async () => {
    const rows = (await loadDemoClient().readLeaderboard()).filter((r) => !r.is_me)
    expect(rows.some((r) => r.catches.some((c) => c.shiny))).toBe(true)
    expect(rows.some((r) => r.catches.some((c) => c.species >= 144))).toBe(true)
    expect(rows.some((r) => r.evolutions.length >= 2)).toBe(true)
  })
})

// La démo montre les cartes de monkey-testing telles que le connecteur `slack` les produit :
// une au dos de la fiche d'espèce une fois ouverte, une autre au rituel, encore scellée.
describe('cartes de monkey-testing de la démo', () => {
  const slack = demoCatches().filter((c) => c.source === 'slack')

  it('existent, au format du connecteur slack', () => {
    expect(slack.length).toBeGreaterThanOrEqual(2)
    for (const c of slack) {
      expect(c.label).toMatch(/^Monkey-testing · /)
      expect(c.ref).toBe('monkey-testing')
      expect(c.url).toMatch(/^https:\/\/.+\.slack\.com\/archives\//)
    }
  })

  it('comptent une carte ouverte et une encore scellée', async () => {
    const { state: { claimed } } = await loadDemoClient().readState()
    const keys = slack.map((c) => entryKey(c.source, c.external_id))
    expect(keys.some((k) => claimed.includes(k))).toBe(true)
    expect(keys.some((k) => !claimed.includes(k))).toBe(true)
  })
})
