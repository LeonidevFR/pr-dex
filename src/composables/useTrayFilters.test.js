import { describe, it, expect } from 'vitest'
import { useTrayFilters, matchesQuery, normalize } from './useTrayFilters.js'

describe('useTrayFilters', () => {
  it('démarre avec tous les paliers actifs et aucun filtre de statut', () => {
    const f = useTrayFilters()
    expect(f.activeTiers.value).toEqual(new Set(['c', 'u', 'r', 'l']))
    expect(f.statusFilter.value).toBe('all')
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

  it('active devient vrai dès qu’un filtre de statut autre que "all" est posé', () => {
    const f = useTrayFilters()
    f.setStatusFilter('caught')
    expect(f.active.value).toBe(true)
  })

  it('reset remet les paliers et le filtre de statut à leur état initial', () => {
    const f = useTrayFilters()
    f.toggleTier('c')
    f.setStatusFilter('uncaught')
    f.reset()
    expect(f.activeTiers.value).toEqual(new Set(['c', 'u', 'r', 'l']))
    expect(f.statusFilter.value).toBe('all')
    expect(f.active.value).toBe(false)
  })

  it('accepte « evolvable » comme filtre de statut', () => {
    const f = useTrayFilters()
    f.setStatusFilter('evolvable')
    expect(f.statusFilter.value).toBe('evolvable')
    expect(f.active.value).toBe(true)
  })

  it('reset efface aussi le filtre « evolvable »', () => {
    const f = useTrayFilters()
    f.setStatusFilter('evolvable')
    f.reset()
    expect(f.statusFilter.value).toBe('all')
  })
})

describe('matchesQuery', () => {
  it('accepte tout quand la recherche est vide ou blanche', () => {
    expect(matchesQuery(25, '')).toBe(true)
    expect(matchesQuery(25, '   ')).toBe(true)
  })

  it('trouve par nom sans tenir compte de la casse ni des accents', () => {
    expect(matchesQuery(133, 'evoli')).toBe(true)
    expect(matchesQuery(133, 'ÉVOLI')).toBe(true)
    expect(matchesQuery(133, 'pika')).toBe(false)
  })

  it('trouve par morceau de nom', () => {
    expect(matchesQuery(25, 'chu')).toBe(true)
  })

  it('ignore la ponctuation et les symboles du nom', () => {
    expect(matchesQuery(122, 'mmime')).toBe(true) // M. Mime
    expect(matchesQuery(29, 'nidoran')).toBe(true) // Nidoran ♀
  })

  it('trouve par numéro, avec ou sans zéros ni dièse', () => {
    expect(matchesQuery(25, '25')).toBe(true)
    expect(matchesQuery(25, '025')).toBe(true)
    expect(matchesQuery(25, '#25')).toBe(true)
    expect(matchesQuery(99, '25')).toBe(false)
  })

  it('ne confond pas un numéro avec un morceau d’un autre numéro', () => {
    expect(matchesQuery(125, '25')).toBe(false)
  })
})

describe('normalize', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalize('Évoli')).toBe('evoli')
    expect(normalize('M. Mime')).toBe('mmime')
    expect(normalize('Nidoran ♀')).toBe('nidoran')
  })
})

describe('useTrayFilters — recherche', () => {
  it('part d’une recherche vide, inactive', () => {
    const f = useTrayFilters()
    expect(f.query.value).toBe('')
    expect(f.active.value).toBe(false)
  })

  it('se dit actif dès qu’une recherche est saisie', () => {
    const f = useTrayFilters()
    f.setQuery('pika')
    expect(f.active.value).toBe(true)
  })

  it('reset vide aussi la recherche', () => {
    const f = useTrayFilters()
    f.setQuery('pika')
    f.reset()
    expect(f.query.value).toBe('')
  })

  it('n’expose plus de panneau repliable', () => {
    expect(useTrayFilters().open).toBeUndefined()
  })
})
