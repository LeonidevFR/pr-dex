import { describe, it, expect } from 'vitest'
import { SPECIES } from './species.js'
import INFO from './species-info.json'

// Vite (et donc Vitest) résout nativement l'import d'un JSON, sans assertion d'import.
const TYPE_SLUGS = new Set([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
])

describe('species-info.json', () => {
  // Une régénération partielle viderait silencieusement des fiches : c'est la CI qui doit
  // le voir, pas un utilisateur devant une notice blanche.
  it('couvre exactement les 151 espèces de la planche', () => {
    expect(Object.keys(INFO).map(Number).sort((a, b) => a - b)).toEqual(SPECIES.map(([id]) => id))
  })

  it('donne à chaque espèce au moins un type, au plus deux', () => {
    for (const [id] of SPECIES) {
      expect(INFO[id].types.length).toBeGreaterThanOrEqual(1)
      expect(INFO[id].types.length).toBeLessThanOrEqual(2)
    }
  })

  it('n’utilise que des identifiants de type connus, avec un nom français non vide', () => {
    for (const [id] of SPECIES) {
      for (const t of INFO[id].types) {
        expect(TYPE_SLUGS).toContain(t.slug)
        expect(t.name.length).toBeGreaterThan(0)
      }
    }
  })

  it('donne à chaque espèce une notice non vide et déjà nettoyée', () => {
    for (const [id] of SPECIES) {
      expect(INFO[id].text.length).toBeGreaterThan(10)
      expect(INFO[id].text).not.toMatch(/[\n\f\r]/)
    }
  })
})
