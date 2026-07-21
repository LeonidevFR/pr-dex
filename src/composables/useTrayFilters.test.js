import { describe, it, expect } from 'vitest'
import { useTrayFilters } from './useTrayFilters.js'

describe('useTrayFilters', () => {
  it('démarre avec tous les paliers actifs et aucun filtre de capture', () => {
    const f = useTrayFilters()
    expect(f.activeTiers.value).toEqual(new Set(['c', 'u', 'r', 'l']))
    expect(f.caughtFilter.value).toBe('all')
    expect(f.active.value).toBe(false)
  })

  it('désactive un palier au premier appel, le réactive au second', () => {
    const f = useTrayFilters()
    f.toggleTier('l')
    expect(f.activeTiers.value.has('l')).toBe(false)
    f.toggleTier('l')
    expect(f.activeTiers.value.has('l')).toBe(true)
  })

  it('refuse de désactiver le dernier palier restant', () => {
    const f = useTrayFilters()
    f.toggleTier('c')
    f.toggleTier('u')
    f.toggleTier('r')
    f.toggleTier('l') // seul restant : ignoré
    expect(f.activeTiers.value).toEqual(new Set(['l']))
  })

  it('active devient vrai dès qu’un palier est désactivé', () => {
    const f = useTrayFilters()
    f.toggleTier('c')
    expect(f.active.value).toBe(true)
  })

  it('active devient vrai dès qu’un filtre de capture autre que "all" est posé', () => {
    const f = useTrayFilters()
    f.setCaughtFilter('caught')
    expect(f.active.value).toBe(true)
  })

  it('reset remet les paliers et le filtre de capture à leur état initial', () => {
    const f = useTrayFilters()
    f.toggleTier('c')
    f.setCaughtFilter('uncaught')
    f.reset()
    expect(f.activeTiers.value).toEqual(new Set(['c', 'u', 'r', 'l']))
    expect(f.caughtFilter.value).toBe('all')
    expect(f.active.value).toBe(false)
  })
})
