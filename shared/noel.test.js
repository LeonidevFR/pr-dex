import { describe, it, expect } from 'vitest'
import { noelSeasonOf, christmasGift, teamBonus, pickMember, noelStarted, TEAM_ODDS } from './noel.js'

describe('noelSeasonOf', () => {
  it('rattache décembre et le début de janvier à la même saison', () => {
    expect(noelSeasonOf('2026-12-15')).toBe(2026)
    expect(noelSeasonOf('2026-12-31')).toBe(2026)
    expect(noelSeasonOf('2027-01-06')).toBe(2026)
  })

  it('exclut la veille et le lendemain de la saison', () => {
    expect(noelSeasonOf('2026-12-14')).toBeNull()
    expect(noelSeasonOf('2027-01-07')).toBeNull()
    expect(noelSeasonOf('2026-07-01')).toBeNull()
  })
})

describe('noelStarted', () => {
  it('reste fermé avant le 15 décembre 2026, puis ouvert pour de bon', () => {
    expect(noelStarted('2026-12-14')).toBe(false)
    expect(noelStarted('2026-12-15')).toBe(true)
    expect(noelStarted('2027-03-01')).toBe(true)
  })
})

describe('christmasGift', () => {
  it('s’offre à partir du 25 décembre, daté du 25, une fois par saison', () => {
    expect(christmasGift('2026-12-24')).toBeNull()
    expect(christmasGift('2026-12-25')).toEqual({ key: 'noel:2026', date: '2026-12-25' })
    expect(christmasGift('2027-01-06')).toEqual({ key: 'noel:2026', date: '2026-12-25' })
  })

  it('ne s’offre plus après la saison', () => {
    expect(christmasGift('2027-01-07')).toBeNull()
  })
})

describe('teamBonus', () => {
  it('ne donne rien hors saison, quel que soit le seed', () => {
    for (let i = 0; i < 200; i++) expect(teamBonus(`github:${i}`, '2026-07-01')).toBe(false)
  })

  it('tombe environ une fois sur TEAM_ODDS en saison', () => {
    const n = 30000
    let hits = 0
    for (let i = 0; i < n; i++) if (teamBonus(`github:sha${i}`, '2026-12-20')) hits++
    expect(hits / n).toBeGreaterThan(0.8 / TEAM_ODDS)
    expect(hits / n).toBeLessThan(1.2 / TEAM_ODDS)
  })
})

describe('pickMember', () => {
  const members = [{ id: 'zoe' }, { id: 'alex' }, { id: 'max' }]

  it('rend toujours le même membre pour le même seed, quel que soit l’ordre de lecture', () => {
    const a = pickMember('noel:2026:u1', members)
    expect(pickMember('noel:2026:u1', [...members].reverse())).toBe(a)
  })

  it('rend null sans aucun membre', () => {
    expect(pickMember('x', [])).toBeNull()
  })

  it('atteint chaque membre', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => pickMember(`s${i}`, members)))
    expect(seen).toEqual(new Set(['zoe', 'alex', 'max']))
  })
})
