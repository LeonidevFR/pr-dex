import { describe, it, expect, vi, beforeEach } from 'vitest'

// Faux client : la chaîne `from().select().eq().order().order().range()` se résout comme
// PostgREST, réponse tronquée à `max_rows` (1000 par défaut sur Supabase).
const db = vi.hoisted(() => ({ rows: [], maxRows: 1000, ranges: [] }))

vi.mock('./supabaseClient.js', () => {
  const builder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      range: (from, to) => {
        db.ranges.push([from, to])
        const end = Math.min(to + 1, from + db.maxRows)
        return Promise.resolve({ data: db.rows.slice(from, end), error: null })
      },
    }
    return b
  }
  return { supabase: { from: () => builder() } }
})

const { createSupabaseClient } = await import('./supabaseData.js')

describe('readCatches', () => {
  beforeEach(() => {
    db.ranges = []
    db.maxRows = 1000
  })

  it('rend toutes les captures au-delà du plafond de Supabase, dans l’ordre', async () => {
    db.rows = Array.from({ length: 1002 }, (_, i) => ({ external_id: `sha-${i}` }))

    const catches = await createSupabaseClient('u1').readCatches()

    expect(catches).toHaveLength(1002)
    expect(catches.at(-1).external_id).toBe('sha-1001')
    expect(db.ranges).toEqual([[0, 999], [1000, 1999], [1002, 2001]])
  })

  it('reste complet si le plafond est réglé plus bas que la taille de page', async () => {
    db.rows = Array.from({ length: 450 }, (_, i) => ({ external_id: `sha-${i}` }))
    db.maxRows = 200

    const catches = await createSupabaseClient('u1').readCatches()

    expect(catches).toHaveLength(450)
  })

  it('rend une liste vide pour un joueur sans capture', async () => {
    db.rows = []

    expect(await createSupabaseClient('u1').readCatches()).toEqual([])
  })
})
