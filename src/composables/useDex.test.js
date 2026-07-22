import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useDex } from './useDex.js'

const catchOf = (sha, species, extra = {}) => ({
  sha, species, shiny: false, repo: 'moi/atlas', pr: 1, title: 't', date: '2026-02-03', ...extra,
})

const setup = (catches, state) =>
  useDex(ref(catches), ref({ claimed: [], spent: {}, evolutions: [], ...state }))

describe('file d’attente', () => {
  it('sépare les captures ouvertes de celles qui attendent', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 1)], { claimed: ['a'] })
    expect(d.pending.value.map((e) => e.sha)).toEqual(['b'])
    expect(d.claimed.value.map((e) => e.sha)).toEqual(['a'])
  })

  it('présente la file dans l’ordre chronologique', () => {
    const d = setup([
      catchOf('b', 1, { date: '2026-03-01' }),
      catchOf('a', 25, { date: '2026-02-01' }),
    ], {})
    expect(d.pending.value.map((e) => e.sha)).toEqual(['a', 'b'])
  })
})

describe('collection', () => {
  it('n’expose que les espèces ouvertes', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 1)], { claimed: ['a'] })
    expect(d.bySpecies.value[25]).toHaveLength(1)
    expect(d.bySpecies.value[1]).toBeUndefined()
    expect(d.caughtCount.value).toBe(1)
  })

  it('empile les doublons sous la même espèce', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 25)], { claimed: ['a', 'b'] })
    expect(d.bySpecies.value[25]).toHaveLength(2)
    expect(d.caughtCount.value).toBe(1)
  })

  it('intègre les évolutions comme des entrées de la collection', () => {
    const d = setup([catchOf('a', 129)], {
      claimed: ['a'],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130]).toHaveLength(1)
    expect(d.bySpecies.value[130][0].via).toBe('evo')
    expect(d.caughtCount.value).toBe(2)
  })

  it('hérite le chromatique de la source lors d’une évolution', () => {
    const d = setup([catchOf('a', 129, { shiny: true })], {
      claimed: ['a'],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(true)
  })

  it('hérite le chromatique de la capture précise désignée par fromSha, même si une capture plus ancienne et non chromatique de la même espèce existe', () => {
    const d = setup([
      catchOf('old', 129, { shiny: false, date: '2026-01-01' }),
      catchOf('new', 129, { shiny: true, date: '2026-02-01' }),
    ], {
      claimed: ['old', 'new'],
      evolutions: [{ species: 130, from: 129, fromSha: 'new', date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(true)
  })

  it('reste non chromatique quand fromSha désigne une capture non chromatique malgré un doublon chromatique', () => {
    const d = setup([
      catchOf('old', 129, { shiny: false, date: '2026-01-01' }),
      catchOf('new', 129, { shiny: true, date: '2026-02-01' }),
    ], {
      claimed: ['old', 'new'],
      evolutions: [{ species: 130, from: 129, fromSha: 'old', date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(false)
  })

  it('résout via l’espèce source quand fromSha est absent (chemin legacy)', () => {
    const d = setup([catchOf('a', 129, { shiny: true })], {
      claimed: ['a'],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(true)
  })

  it('ne lève pas et retombe à non chromatique quand fromSha ne correspond à rien', () => {
    const d = setup([catchOf('a', 129, { shiny: true })], {
      claimed: ['a'],
      evolutions: [{ species: 130, from: 129, fromSha: 'fantome', date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(false)
  })

  it('ignore une capture dont le sha est réclamé mais absent de catches.json', () => {
    const d = setup([catchOf('a', 25)], { claimed: ['a', 'fantome'] })
    expect(d.claimed.value).toHaveLength(1)
  })

  it('marque les captures de PR avec via:"pr"', () => {
    const d = setup([catchOf('a', 25)], { claimed: ['a'] })
    expect(d.claimed.value[0].via).toBe('pr')
  })
})

describe('bonbons', () => {
  it('crédite trois bonbons par capture à la famille', () => {
    const d = setup([catchOf('a', 2), catchOf('b', 3)], { claimed: ['a', 'b'] })
    expect(d.candies(1)).toBe(6)
  })

  it('ne crédite rien pour une capture non encore ouverte', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 1)], { claimed: ['a'] })
    expect(d.candies(1)).toBe(3)
  })

  it('ne crédite aucun bonbon pour une évolution', () => {
    const d = setup([catchOf('a', 129)], {
      claimed: ['a'],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.candies(129)).toBe(3)
  })

  it('déduit les bonbons dépensés', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 1), catchOf('c', 1)], {
      claimed: ['a', 'b', 'c'],
      spent: { 1: 8 },
    })
    expect(d.candies(1)).toBe(1)
  })

  it('partage le compteur entre toutes les espèces d’une famille', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 2), catchOf('c', 3)], { claimed: ['a', 'b', 'c'] })
    expect(d.candies(1)).toBe(9)
    expect(d.candies(2)).toBe(9)
    expect(d.candies(3)).toBe(9)
  })
})

describe('évolution possible', () => {
  it('autorise l’évolution quand les bonbons suffisent', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)),
      { claimed: ['s0', 's1', 's2'] },
    )
    expect(d.canEvolve(1)).toBe(true)
  })

  it('refuse l’évolution en dessous du coût', () => {
    const d = setup([catchOf('a', 1)], { claimed: ['a'] })
    expect(d.canEvolve(1)).toBe(false)
  })

  it('refuse d’évoluer une espèce absente de la collection', () => {
    const d = setup([catchOf('a', 4)], { claimed: ['a'] })
    expect(d.canEvolve(1)).toBe(false)
  })

  it('refuse d’évoluer une espèce terminale', () => {
    const d = setup([catchOf('a', 143)], { claimed: ['a'] })
    expect(d.canEvolve(143)).toBe(false)
  })

  it('autorise Évoli dès que le coût est atteint, quel que soit le choix', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('e' + i, 133)),
      { claimed: ['e0', 'e1', 'e2'] },
    )
    expect(d.canEvolve(133)).toBe(true)
  })
})

describe('évolutions disponibles (mise en avant grille)', () => {
  it('inclut une espèce capturée dont les bonbons suffisent', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)),
      { claimed: ['s0', 's1', 's2'] },
    )
    expect(d.evolvableIds.value.has(1)).toBe(true)
  })

  it('exclut une espèce capturée sans assez de bonbons', () => {
    const d = setup([catchOf('a', 1)], { claimed: ['a'] })
    expect(d.evolvableIds.value.has(1)).toBe(false)
  })

  it('exclut une espèce terminale même gorgée de doublons', () => {
    const d = setup(
      Array.from({ length: 5 }, (_, i) => catchOf('r' + i, 143)),
      { claimed: ['r0', 'r1', 'r2', 'r3', 'r4'] },
    )
    expect(d.evolvableIds.value.has(143)).toBe(false)
  })

  it('exclut une espèce non capturée', () => {
    const d = setup([], {})
    expect(d.evolvableIds.value.has(1)).toBe(false)
  })

  it('recalcule quand des bonbons sont dépensés', () => {
    const catches = ref(Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)))
    const state = ref({ claimed: ['s0', 's1', 's2'], spent: {}, evolutions: [] })
    const d = useDex(catches, state)
    expect(d.evolvableIds.value.has(1)).toBe(true)
    state.value = { ...state.value, spent: { 1: 8 } }
    expect(d.evolvableIds.value.has(1)).toBe(false)
  })
})

describe('exemplaires consommés par une évolution', () => {
  it('retire l’exemplaire choisi du stock disponible', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)),
      { claimed: ['s0', 's1', 's2'], evolutions: [{ species: 2, from: 1, fromKey: 's0', date: '2026-07-14' }] },
    )
    expect(d.copyCount(1)).toBe(2)
  })

  it('n’en retire pas l’espèce du dex, même sans stock restant', () => {
    const d = setup([catchOf('a', 1)], {
      claimed: ['a'],
      evolutions: [{ species: 2, from: 1, fromKey: 'a', date: '2026-07-14' }],
    })
    expect(d.copyCount(1)).toBe(0)
    expect(d.bySpecies.value[1]).toHaveLength(1) // toujours acquise, juste plus d'exemplaire dispo
    expect(d.caughtCount.value).toBe(2) // l'espèce source ET la cible comptent comme vues
  })

  it('refuse une nouvelle évolution sans exemplaire disponible même avec assez de bonbons', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)),
      {
        claimed: ['s0', 's1', 's2'],
        evolutions: [
          { species: 2, from: 1, fromKey: 's0', date: '2026-07-01' },
          { species: 2, from: 1, fromKey: 's1', date: '2026-07-02' },
          { species: 2, from: 1, fromKey: 's2', date: '2026-07-03' },
        ],
      },
    )
    expect(d.candies(1)).toBeGreaterThanOrEqual(0)
    expect(d.copyCount(1)).toBe(0)
    expect(d.canEvolve(1)).toBe(false)
  })

  it('reconnaît un exemplaire source produit par une évolution précédente (chaîne)', () => {
    // Bulbizarre → Herbizarre → Florizarre : la source de la seconde évolution est
    // l'exemplaire d'Herbizarre produit par la première, pas une capture de PR.
    const d = setup(
      Array.from({ length: 6 }, (_, i) => catchOf('s' + i, 1)),
      {
        claimed: ['s0', 's1', 's2', 's3', 's4', 's5'],
        evolutions: [{ species: 2, from: 1, fromKey: 's0', date: '2026-07-14' }],
      },
    )
    expect(d.copyCount(2)).toBe(1)
  })
})

describe('bonbons morts', () => {
  it('repère une espèce dont la famille n’évolue pas', () => {
    const d = setup([], {})
    expect(d.isDeadEnd(143)).toBe(true)
    expect(d.isDeadEnd(1)).toBe(false)
  })
})

describe('réactivité', () => {
  it('recalcule quand une capture est réclamée', () => {
    const catches = ref([catchOf('a', 25)])
    const state = ref({ claimed: [], spent: {}, evolutions: [] })
    const d = useDex(catches, state)
    expect(d.caughtCount.value).toBe(0)
    state.value = { ...state.value, claimed: ['a'] }
    expect(d.caughtCount.value).toBe(1)
    expect(d.pending.value).toHaveLength(0)
  })

  it('les accesseurs reflètent un changement d’état sans être des computed', () => {
    const catches = ref([catchOf('a', 1)])
    const state = ref({ claimed: [], spent: {}, evolutions: [] })
    const d = useDex(catches, state)
    expect(d.candies(1)).toBe(0)
    state.value = { ...state.value, claimed: ['a'] }
    expect(d.candies(1)).toBe(3)
  })
})
