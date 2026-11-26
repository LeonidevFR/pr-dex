import { describe, it, expect } from 'vitest'
import { SPECIES } from './species.js'
import { STATS } from './species-stats.js'

describe('species-stats.js', () => {
  // Une régénération partielle laisserait des puissances à zéro, et tous les duels
  // s'effondreraient sur la borne basse sans erreur visible.
  it('couvre exactement les 151 espèces de la planche', () => {
    expect(Object.keys(STATS).map(Number).sort((a, b) => a - b)).toEqual(SPECIES.map(([id]) => id))
  })

  it('reste dans la plage de totaux connue de la gen 1', () => {
    for (const [id] of SPECIES) {
      expect(STATS[id]).toBeGreaterThanOrEqual(190)
      expect(STATS[id]).toBeLessThanOrEqual(690)
    }
  })

  // Ces trois valeurs servent de fixtures aux tests de combat des tâches suivantes :
  // si PokeAPI les change un jour, c'est ici qu'on doit le voir en premier.
  it('donne les valeurs de référence de Roucool, Dracaufeu et Électhor', () => {
    expect(STATS[16]).toBe(251)
    expect(STATS[6]).toBe(534)
    expect(STATS[145]).toBe(580)
  })
})
