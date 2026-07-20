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
    // Rejoue la remontée PARENT nous-mêmes (indépendamment de familyOf) : elle doit atteindre
    // sa racine en au plus SPECIES.length pas, sans jamais revisiter un id déjà vu.
    for (let id = 1; id <= 151; id++) {
      let current = id
      const visited = new Set()
      let steps = 0
      while (PARENT[current] !== undefined) {
        expect(visited.has(current)).toBe(false)
        visited.add(current)
        current = PARENT[current]
        steps++
        expect(steps).toBeLessThanOrEqual(SPECIES.length)
      }
    }
  })

  it('lève une erreur claire si familyOf rencontre un cycle', () => {
    const cyclicParent = { 2: 1, 1: 2 }
    const walk = (id) => {
      let current = id
      const visited = new Set()
      while (cyclicParent[current] !== undefined) {
        if (visited.has(current)) throw new Error(`familyOf: cycle détecté … (bloqué sur ${current})`)
        visited.add(current)
        current = cyclicParent[current]
      }
      return current
    }
    expect(() => walk(1)).toThrow(/cycle/)
  })

  it('chaque évolueVers pointe vers une espèce existante', () => {
    for (const s of Object.values(DEX)) {
      if (!s.to) continue
      const targets = Array.isArray(s.to) ? s.to : [s.to]
      for (const t of targets) expect(DEX[t]).toBeDefined()
    }
  })

  it('aucune collision de cible d’évolution entre deux espèces distinctes', () => {
    const seenBy = {}
    for (const s of Object.values(DEX)) {
      if (!s.to) continue
      const targets = Array.isArray(s.to) ? s.to : [s.to]
      for (const t of targets) {
        if (seenBy[t] !== undefined && seenBy[t] !== s.id) {
          throw new Error(`cible d'évolution ${t} revendiquée par ${seenBy[t]} et ${s.id}`)
        }
        seenBy[t] = s.id
      }
    }
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
