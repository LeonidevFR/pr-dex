import { describe, it, expect } from 'vitest'
import { SPECIES, DEX, PARENT, POOL, familyOf, hasEvoInFamily } from './species.js'

describe('table des espèces', () => {
  it('contient exactement les 151 de la première génération', () => {
    expect(SPECIES).toHaveLength(151)
    expect(Object.keys(DEX)).toHaveLength(151)
    for (let id = 1; id <= 151; id++) expect(DEX[id]).toBeDefined()
  })

  it('répartit les espèces en quatre paliers conformes au brief', () => {
    expect(POOL.c).toHaveLength(22)
    expect(POOL.u).toHaveLength(78)
    expect(POOL.r).toHaveLength(46)
    expect(POOL.l).toHaveLength(5)
    expect(POOL.c.length + POOL.u.length + POOL.r.length + POOL.l.length).toBe(151)
  })

  it('déclare les cinq légendaires', () => {
    expect(POOL.l).toEqual([144, 145, 146, 150, 151])
  })

  it('remonte à la racine de la famille', () => {
    expect(familyOf(3)).toBe(1)
    expect(familyOf(1)).toBe(1)
    expect(familyOf(130)).toBe(129)
    expect(familyOf(134)).toBe(133)
    expect(familyOf(144)).toBe(144)
  })

  it('termine toujours — aucun cycle dans les chaînes d’évolution', () => {
    for (let id = 1; id <= 151; id++) expect(() => familyOf(id)).not.toThrow()
  })

  it('détecte les familles sans aucune évolution', () => {
    expect(hasEvoInFamily(143)).toBe(false)
    expect(hasEvoInFamily(132)).toBe(false)
    expect(hasEvoInFamily(150)).toBe(false)
    expect(hasEvoInFamily(1)).toBe(true)
    expect(hasEvoInFamily(3)).toBe(true)
  })

  it('donne à Évoli trois évolutions possibles', () => {
    expect(DEX[133].to).toEqual([134, 135, 136])
  })

  it('facture 40 bonbons à Magicarpe, exprès', () => {
    expect(DEX[129].cost).toBe(40)
  })

  it('applique 8 puis 16 bonbons aux paliers d’évolution', () => {
    expect(DEX[1].cost).toBe(8)
    expect(DEX[2].cost).toBe(16)
    expect(DEX[10].cost).toBe(8)
    expect(DEX[11].cost).toBe(16)
  })

  it('associe un coût à toute espèce qui évolue, et aucun aux autres', () => {
    for (const s of Object.values(DEX)) {
      if (s.to) expect(s.cost).toBeGreaterThan(0)
      else expect(s.cost).toBeNull()
    }
  })
})
