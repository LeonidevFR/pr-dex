import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Un faux constructeur de requêtes PostgREST : il note chaque appel de filtre et rend, au
 * `await`, la réponse prévue pour la table interrogée.
 */
const appels = []
const reponses = {}
const builder = (table) => {
  const b = {}
  for (const m of ['select', 'neq', 'eq', 'or', 'order', 'range', 'in']) {
    b[m] = (...args) => { appels.push([table, m, ...args]); return b }
  }
  b.then = (ok, ko) => Promise.resolve({ data: reponses[table], error: null }).then(ok, ko)
  return b
}
vi.mock('./supabaseClient.js', () => ({ supabase: { from: (t) => builder(t) } }))

const { createSupabaseClient } = await import('./supabaseData.js')
const MOI = '11111111-1111-1111-1111-111111111111'
const BOB = '22222222-2222-2222-2222-222222222222'
const filtres = (table) => appels.filter(([t, m]) => t === table && !['select', 'order'].includes(m)).map(([, ...r]) => r)

beforeEach(() => { appels.length = 0 })

describe('readDuelHistory', () => {
  it('lit une ligne de plus que la page pour savoir s’il en reste', async () => {
    reponses.arena_duels = Array.from({ length: 3 }, (_, i) => ({ id: 3 - i, challenger_id: MOI, opponent_id: null, status: 'computer' }))
    const out = await createSupabaseClient(MOI).readDuelHistory({ userId: MOI, offset: 4, limit: 2 })
    expect(filtres('arena_duels')).toEqual([['neq', 'status', 'open'], ['range', 4, 6]])
    expect(out.duels.map((d) => d.id)).toEqual([3, 2])
    expect(out.plus).toBe(true)
  })

  it('filtre côté base, une défaite comptant aussi le duel gagné par l’ordinateur', async () => {
    reponses.arena_duels = []
    const c = createSupabaseClient(MOI)
    await c.readDuelHistory({ userId: MOI, issue: 'perdus', adversaire: 'ordinateur' })
    expect(filtres('arena_duels')).toContainEqual(['or', `winner_id.is.null,winner_id.neq.${MOI}`])
    expect(filtres('arena_duels')).toContainEqual(['eq', 'status', 'computer'])
    appels.length = 0
    await c.readDuelHistory({ userId: MOI, issue: 'gagnes', adversaire: 'joueur' })
    expect(filtres('arena_duels')).toContainEqual(['eq', 'winner_id', MOI])
    expect(filtres('arena_duels')).toContainEqual(['eq', 'status', 'resolved'])
  })

  it('nomme l’adversaire, quel que soit le camp que j’occupais', async () => {
    reponses.arena_duels = [
      { id: 2, challenger_id: MOI, opponent_id: BOB, status: 'resolved' },
      { id: 1, challenger_id: BOB, opponent_id: MOI, status: 'resolved' },
      { id: 0, challenger_id: MOI, opponent_id: null, status: 'computer' },
    ]
    reponses.arena_identities = [{ user_id: BOB, login: 'bob-dev' }]
    const out = await createSupabaseClient(MOI).readDuelHistory({ userId: MOI })
    expect(filtres('arena_identities')).toEqual([['in', 'user_id', [BOB]]])
    expect(out.duels.map((d) => d.adversaire_login)).toEqual(['bob-dev', 'bob-dev', null])
  })

  it('ne lit aucune identité quand la page ne compte que l’ordinateur', async () => {
    reponses.arena_duels = [{ id: 1, challenger_id: MOI, opponent_id: null, status: 'computer' }]
    await createSupabaseClient(MOI).readDuelHistory({ userId: MOI })
    expect(appels.some(([t]) => t === 'arena_identities')).toBe(false)
  })
})
