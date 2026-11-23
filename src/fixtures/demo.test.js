import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { demoCatches, loadDemoClient } from './demo.js'
import { entryKey } from '../../shared/entry.js'
import { evaluate } from '../lib/achievements.js'

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

// La démo doit laisser voir les trois moments : le récap au premier passage sur l'onglet, un
// toast au premier retournement, deux toasts empilés au dernier.
describe('succès de la démo', () => {
  // Les coéquipiers fictifs de la démo sont datés depuis aujourd'hui : certains jours, l'un
  // d'eux croise un tirage du joueur et « Jumeaux » s'ajoute aux succès attendus.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())
  const unlockedAfter = async (client, claimed) => {
    const catches = await client.readCatches()
    const { state } = await client.readState()
    const others = (await client.readLeaderboard()).filter((r) => !r.is_me).flatMap((r) => r.catches)
    return Object.keys(evaluate({ catches, claimed, evolutions: state.evolutions, others }).unlocked)
  }

  it('quatre des cinq cartes en attente débloquent un succès', async () => {
    const client = loadDemoClient()
    const catches = await client.readCatches()
    let { state: { claimed } } = await client.readState()
    const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    const pending = catches.map((c) => entryKey(c.source, c.external_id)).filter((k) => !claimed.includes(k))
      .map((k) => catches.find((c) => entryKey(c.source, c.external_id) === k)).sort(byDate)
      .map((c) => entryKey(c.source, c.external_id))
    const gained = []
    let before = await unlockedAfter(client, claimed)
    expect(before).toHaveLength(11)
    for (const key of pending) {
      claimed = [...claimed, key]
      const after = await unlockedAfter(client, claimed)
      gained.push(after.filter((c) => !before.includes(c)).sort())
      before = after
    }
    // Avec l'arène, la démo tient Électhor et Sulfura et un Nidoran chromatique de plus : le
    // retournement d'Artikodin complète le trio d'oiseaux, et le 5e chromatique tombe plus tôt.
    expect(gained).toEqual([['on-top'], ['birds'], ['shiny-species-5'], [], ['shiny-booster']])
  })

  it('garde les succès insérés, sans doublon, et leur annonce', async () => {
    const client = loadDemoClient()
    expect(await client.readAchievements()).toEqual([])
    const row = { code: 'deja-vu', unlocked_at: '2026-07-01', trigger_key: 'github:x', announced: false }
    expect(await client.insertAchievements([row])).toEqual([{ code: 'deja-vu' }])
    expect(await client.insertAchievements([{ ...row, unlocked_at: '2026-08-01' }])).toEqual([])
    expect(await client.readAchievements()).toEqual([row])
    await client.markAnnounced(['deja-vu'])
    expect((await client.readAchievements())[0].announced).toBe(true)
  })

  it('compte les succès des joueurs fictifs, puis ceux du joueur courant', async () => {
    const client = loadDemoClient()
    const before = Object.fromEntries((await client.readAchievementCounts()).map((c) => [c.code, c.players]))
    expect(Object.values(before).every((n) => n >= 1 && n <= 4)).toBe(true)
    await client.insertAchievements([{ code: 'gyarados', unlocked_at: '2026-07-01', trigger_key: null, announced: true }])
    const after = Object.fromEntries((await client.readAchievementCounts()).map((c) => [c.code, c.players]))
    expect(after.gyarados).toBe((before.gyarados ?? 0) + 1)
  })
})
