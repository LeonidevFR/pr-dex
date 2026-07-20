import { describe, it, expect } from 'vitest'
import { fnv1a, drawFromSha, WEIGHTS } from './draw.js'
import { DEX, POOL } from './species.js'
import golden from './draw.golden.json' with { type: 'json' }

// Cinq hachages 32 bits rendus en hexadécimal — on utilise tous les bits de sortie.
// Un `% 16` sur FNV-1a ne dépendrait que des quartets bas de l'entrée et s'effondrerait
// sur une poignée de valeurs distinctes.
const shaAt = (i) =>
  Array.from({ length: 5 }, (_, k) => fnv1a(`sha${i}/${k}`).toString(16).padStart(8, '0')).join('')

describe('fnv1a', () => {
  it('renvoie un entier non signé sur 32 bits', () => {
    const h = fnv1a('bonjour')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(2 ** 32)
  })

  it('est stable pour une même entrée', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
  })

  it('sépare des entrées voisines', () => {
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'))
  })
})

describe('drawFromSha', () => {
  it('est déterministe — même sha, même résultat', () => {
    const sha = 'a3f8c21e9b4d7f0c1e2a5b8d9f0c3e6a7b4d1f8c'
    expect(drawFromSha(sha)).toEqual(drawFromSha(sha))
  })

  it('ne tire que des espèces existantes du palier annoncé', () => {
    for (let i = 0; i < 500; i++) {
      const { species } = drawFromSha(shaAt(i))
      expect(DEX[species]).toBeDefined()
      expect(POOL[DEX[species].tier]).toContain(species)
    }
  })

  it('respecte les poids des paliers à ±1 % sur 100 000 tirages', () => {
    const N = 100000
    const counts = { c: 0, u: 0, r: 0, l: 0 }
    for (let i = 0; i < N; i++) counts[DEX[drawFromSha(shaAt(i)).species].tier]++
    for (const [tier, weight] of WEIGHTS) {
      expect(Math.abs(counts[tier] / N - weight)).toBeLessThan(0.01)
    }
  })

  it('tire un chromatique environ une fois sur 128', () => {
    const N = 100000
    let shiny = 0
    for (let i = 0; i < N; i++) if (drawFromSha(shaAt(i)).shiny) shiny++
    expect(shiny / N).toBeGreaterThan(1 / 128 * 0.7)
    expect(shiny / N).toBeLessThan(1 / 128 * 1.3)
  })

  it('reproduit les tirages figés — garde-fou contre une modification involontaire de l’algo', () => {
    for (const { sha, species, shiny } of golden) {
      expect(drawFromSha(sha)).toEqual({ species, shiny })
    }
  })

  it('couvre les quatre paliers et le cas chromatique — sans quoi le golden ne garde rien', () => {
    const tiers = new Set(golden.map((g) => DEX[g.species].tier))
    expect([...tiers].sort()).toEqual(['c', 'l', 'r', 'u'])
    expect(golden.some((g) => g.shiny)).toBe(true)
  })
})
