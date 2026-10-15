import { describe, it, expect } from 'vitest'
import { fnv1a } from '../shared/draw.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

/**
 * Les entrées réelles du jeu : clés d'exemplaire, seeds de tirage, seeds de forme du jour.
 * Toutes sont en ASCII par construction — un identifiant de source, un sha, une date.
 */
const ENTREES = [
  '',
  'a',
  'github:a3f8c21e9b',
  'github:a3f8c21e9b:tier',
  'github:a3f8c21e9b:pick',
  'github:a3f8c21e9b:shiny',
  'github:a3f8c21e9b:forme:2026-08-11',
  'arene:1234:issue',
  'boutique:42',
  '0123456789abcdef'.repeat(8),
]

describe.skipIf(!disponible)('parité fnv1a entre JavaScript et SQL', () => {
  it('rend la même valeur sur les entrées réelles du jeu', async () => {
    const attendus = ENTREES.map((e) => String(fnv1a(e)))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select fnv1a(e) :: text as h from unnest($1 :: text[]) as e', [ENTREES],
      )
      return rows.map((r) => r.h)
    })
    expect(obtenus).toEqual(attendus)
  })

  // Le hachage sert de seed au tirage : une collision de bas de mot suffirait à effondrer la
  // distribution, comme c'est déjà arrivé une fois dans ce projet (cf. NOTES.md).
  it('reste identique sur mille clés consécutives', async () => {
    const cles = Array.from({ length: 1000 }, (_, i) => `github:sha${i}`)
    const attendus = cles.map((e) => String(fnv1a(e)))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select fnv1a(e) :: text as h from unnest($1 :: text[]) as e', [cles],
      )
      return rows.map((r) => r.h)
    })
    expect(obtenus).toEqual(attendus)
  })

  it('reste dans les bornes d’un entier non signé sur 32 bits', async () => {
    const { max } = await withDb(async (c) => {
      const { rows } = await c.query(
        "select max(fnv1a('x' || g)) :: text as max from generate_series(1, 500) g",
      )
      return rows[0]
    })
    expect(Number(max)).toBeLessThan(2 ** 32)
  })
})
