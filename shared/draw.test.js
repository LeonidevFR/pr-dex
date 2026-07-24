import { describe, it, expect } from 'vitest'
import { fnv1a, drawFrom, WEIGHTS, SHINY_ODDS } from './draw.js'
import { entryKey } from './entry.js'
import { DEX, POOL } from './species.js'
import golden from './draw.golden.json' with { type: 'json' }

// Cinq hachages 32 bits rendus en hexadécimal — on utilise tous les bits de sortie.
// Un `% 16` sur FNV-1a ne dépendrait que des quartets bas de l'entrée et s'effondrerait
// sur une poignée de valeurs distinctes.
const shaAt = (i) =>
  Array.from({ length: 5 }, (_, k) => fnv1a(`sha${i}/${k}`).toString(16).padStart(8, '0')).join('')

/** Distribution des paliers et des chromatiques sur N seeds produits par `seedAt`. */
function measure(seedAt, n) {
  const counts = { c: 0, u: 0, r: 0, l: 0 }
  const species = new Set()
  let shiny = 0
  for (let i = 0; i < n; i++) {
    const drawn = drawFrom(seedAt(i))
    counts[DEX[drawn.species].tier]++
    species.add(drawn.species)
    if (drawn.shiny) shiny++
  }
  return { counts, species, shiny }
}

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

describe('drawFrom', () => {
  it('est déterministe — même seed, même résultat', () => {
    const seed = 'github:a3f8c21e9b4d7f0c1e2a5b8d9f0c3e6a7b4d1f8c'
    expect(drawFrom(seed)).toEqual(drawFrom(seed))
  })

  it('ne tire que des espèces existantes du palier annoncé', () => {
    for (let i = 0; i < 500; i++) {
      const { species } = drawFrom(shaAt(i))
      expect(DEX[species]).toBeDefined()
      expect(POOL[DEX[species].tier]).toContain(species)
    }
  })

  it('respecte les poids des paliers à ±1 % sur 100 000 tirages', () => {
    const N = 100000
    const { counts } = measure(shaAt, N)
    for (const [tier, weight] of WEIGHTS) {
      expect(Math.abs(counts[tier] / N - weight)).toBeLessThan(0.01)
    }
  })

  it('tire un chromatique environ une fois sur 128', () => {
    const N = 100000
    const { shiny } = measure(shaAt, N)
    expect(shiny / N).toBeGreaterThan(1 / SHINY_ODDS * 0.7)
    expect(shiny / N).toBeLessThan(1 / SHINY_ODDS * 1.3)
  })

  it('reproduit les tirages figés — garde-fou contre une modification involontaire de l’algo', () => {
    for (const { seed, species, shiny } of golden) {
      expect(drawFrom(seed)).toEqual({ species, shiny })
    }
  })

  it('couvre les quatre paliers et le cas chromatique — sans quoi le golden ne garde rien', () => {
    const tiers = new Set(golden.map((g) => DEX[g.species].tier))
    expect([...tiers].sort()).toEqual(['c', 'l', 'r', 'u'])
    expect(golden.some((g) => g.shiny)).toBe(true)
  })

  /**
   * Un sha de merge est un seed à forte entropie ; l'identifiant d'un objet de CRM est un
   * entier séquentiel, où seuls quelques caractères varient d'un événement au suivant.
   * Ce projet a déjà vu une entrée à faible entropie effondrer une distribution sans qu'aucun
   * test ne le remarque (cf. NOTES.md) — celui-ci ferme le cas pour les sources non-git.
   *
   * Le tirage chromatique est le point sensible : `% SHINY_ODDS` est un modulo par une
   * puissance de deux, donc il ne dépend que des bits bas de FNV-1a.
   */
  it('ne s’effondre pas sur des identifiants séquentiels courts', () => {
    const N = 100000
    const { counts, species, shiny } = measure((i) => entryKey('crm', 1000000 + i), N)

    for (const [tier, weight] of WEIGHTS) {
      expect(Math.abs(counts[tier] / N - weight)).toBeLessThan(0.01)
    }
    expect(species.size).toBe(151)
    expect(shiny / N).toBeGreaterThan(1 / SHINY_ODDS * 0.7)
    expect(shiny / N).toBeLessThan(1 / SHINY_ODDS * 1.3)
  })

  it('sépare les espaces de tirage de deux sources qui numérotent pareil', () => {
    expect(drawFrom(entryKey('github', 42))).not.toEqual(drawFrom(entryKey('crm', 42)))
  })
})
