import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useDex } from './useDex.js'
import { entryKey } from '../../shared/entry.js'

/** Clé d'exemplaire telle que `useDex` la dérive — ce que `state.claimed` référence. */
const K = (id) => entryKey('github', id)

const catchOf = (id, species, extra = {}) => ({
  source: 'github', external_id: id, species, shiny: false,
  label: 't', ref: 'moi/atlas#1', url: 'https://github.com/moi/atlas/pull/1',
  date: '2026-02-03', ...extra,
})

const setup = (catches, state) =>
  useDex(ref(catches), ref({ claimed: [], spent: {}, evolutions: [], ...state }))

describe('file d’attente', () => {
  it('sépare les captures ouvertes de celles qui attendent', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 1)], { claimed: [K('a')] })
    expect(d.pending.value.map((e) => e.external_id)).toEqual(['b'])
    expect(d.claimed.value.map((e) => e.external_id)).toEqual(['a'])
  })

  it('présente la file dans l’ordre chronologique', () => {
    const d = setup([
      catchOf('b', 1, { date: '2026-03-01' }),
      catchOf('a', 25, { date: '2026-02-01' }),
    ], {})
    expect(d.pending.value.map((e) => e.external_id)).toEqual(['a', 'b'])
  })

  it('donne sa clé d’exemplaire à une capture encore en attente', () => {
    const d = setup([catchOf('a', 25)], {})
    expect(d.pending.value[0].key).toBe(K('a'))
  })
})

describe('clé d’exemplaire', () => {
  it('préfixe la clé par la source, pour que deux sources ne se confondent pas', () => {
    const d = setup([
      catchOf('42', 25),
      catchOf('42', 1, { source: 'crm' }),
    ], { claimed: [K('42')] })
    expect(d.claimed.value).toHaveLength(1)
    expect(d.claimed.value[0].species).toBe(25)
    expect(d.pending.value[0].source).toBe('crm')
  })
})

describe('collection', () => {
  it('n’expose que les espèces ouvertes', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 1)], { claimed: [K('a')] })
    expect(d.bySpecies.value[25]).toHaveLength(1)
    expect(d.bySpecies.value[1]).toBeUndefined()
    expect(d.caughtCount.value).toBe(1)
  })

  it('empile les doublons sous la même espèce', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 25)], { claimed: [K('a'), K('b')] })
    expect(d.bySpecies.value[25]).toHaveLength(2)
    expect(d.caughtCount.value).toBe(1)
  })

  it('intègre les évolutions comme des entrées de la collection', () => {
    const d = setup([catchOf('a', 129)], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130]).toHaveLength(1)
    expect(d.bySpecies.value[130][0].via).toBe('evo')
    expect(d.caughtCount.value).toBe(2)
  })

  it('hérite le chromatique de la source lors d’une évolution', () => {
    const d = setup([catchOf('a', 129, { shiny: true })], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(true)
  })

  it('hérite le chromatique de la capture précise désignée par fromKey, même si une capture plus ancienne et non chromatique de la même espèce existe', () => {
    const d = setup([
      catchOf('old', 129, { shiny: false, date: '2026-01-01' }),
      catchOf('new', 129, { shiny: true, date: '2026-02-01' }),
    ], {
      claimed: [K('old'), K('new')],
      evolutions: [{ species: 130, from: 129, fromKey: K('new'), date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(true)
  })

  it('reste non chromatique quand fromKey désigne une capture non chromatique malgré un doublon chromatique', () => {
    const d = setup([
      catchOf('old', 129, { shiny: false, date: '2026-01-01' }),
      catchOf('new', 129, { shiny: true, date: '2026-02-01' }),
    ], {
      claimed: [K('old'), K('new')],
      evolutions: [{ species: 130, from: 129, fromKey: K('old'), date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(false)
  })

  it('lit encore fromSha, écrit par une version antérieure à fromKey', () => {
    const d = setup([
      catchOf('old', 129, { shiny: false, date: '2026-01-01' }),
      catchOf('new', 129, { shiny: true, date: '2026-02-01' }),
    ], {
      claimed: [K('old'), K('new')],
      evolutions: [{ species: 130, from: 129, fromSha: K('new'), date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(true)
  })

  it('résout via l’espèce source quand aucune clé n’est enregistrée (chemin legacy)', () => {
    const d = setup([catchOf('a', 129, { shiny: true })], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(true)
  })

  it('ne lève pas et retombe à non chromatique quand fromKey ne correspond à rien', () => {
    const d = setup([catchOf('a', 129, { shiny: true })], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, fromKey: 'fantome', date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(false)
  })

  it('ignore une clé réclamée mais absente des captures', () => {
    const d = setup([catchOf('a', 25)], { claimed: [K('a'), K('fantome')] })
    expect(d.claimed.value).toHaveLength(1)
  })

  it('marque les captures avec via:"catch", quelle que soit leur source', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 1, { source: 'crm' })], {
      claimed: [K('a'), entryKey('crm', 'b')],
    })
    expect(d.claimed.value.map((e) => e.via)).toEqual(['catch', 'catch'])
  })
})

describe('bonbons', () => {
  it('crédite trois bonbons par capture à la famille', () => {
    const d = setup([catchOf('a', 2), catchOf('b', 3)], { claimed: [K('a'), K('b')] })
    expect(d.candies(1)).toBe(6)
  })

  it('ne crédite rien pour une capture non encore ouverte', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 1)], { claimed: [K('a')] })
    expect(d.candies(1)).toBe(3)
  })

  it('ne crédite aucun bonbon pour une évolution', () => {
    const d = setup([catchOf('a', 129)], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, date: '2026-07-14' }],
    })
    expect(d.candies(129)).toBe(3)
  })

  it('déduit les bonbons dépensés', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 1), catchOf('c', 1)], {
      claimed: [K('a'), K('b'), K('c')],
      spent: { 1: 8 },
    })
    expect(d.candies(1)).toBe(1)
  })

  it('partage le compteur entre toutes les espèces d’une famille', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 2), catchOf('c', 3)], {
      claimed: [K('a'), K('b'), K('c')],
    })
    expect(d.candies(1)).toBe(9)
    expect(d.candies(2)).toBe(9)
    expect(d.candies(3)).toBe(9)
  })

  it('crédite pareil quelle que soit la source de la capture', () => {
    const d = setup([
      catchOf('a', 2),
      catchOf('b', 3, { source: 'crm' }),
    ], { claimed: [K('a'), entryKey('crm', 'b')] })
    expect(d.candies(1)).toBe(6)
  })
})

describe('évolution possible', () => {
  it('autorise l’évolution quand les bonbons suffisent', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)),
      { claimed: [K('s0'), K('s1'), K('s2')] },
    )
    expect(d.canEvolve(1)).toBe(true)
  })

  it('refuse l’évolution en dessous du coût', () => {
    const d = setup([catchOf('a', 1)], { claimed: [K('a')] })
    expect(d.canEvolve(1)).toBe(false)
  })

  it('refuse d’évoluer une espèce absente de la collection', () => {
    const d = setup([catchOf('a', 4)], { claimed: [K('a')] })
    expect(d.canEvolve(1)).toBe(false)
  })

  it('refuse d’évoluer une espèce terminale', () => {
    const d = setup([catchOf('a', 143)], { claimed: [K('a')] })
    expect(d.canEvolve(143)).toBe(false)
  })

  it('autorise Évoli dès que le coût est atteint, quel que soit le choix', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('e' + i, 133)),
      { claimed: [K('e0'), K('e1'), K('e2')] },
    )
    expect(d.canEvolve(133)).toBe(true)
  })
})

describe('évolutions disponibles (mise en avant grille)', () => {
  it('inclut une espèce capturée dont les bonbons suffisent', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)),
      { claimed: [K('s0'), K('s1'), K('s2')] },
    )
    expect(d.evolvableIds.value.has(1)).toBe(true)
  })

  it('exclut une espèce capturée sans assez de bonbons', () => {
    const d = setup([catchOf('a', 1)], { claimed: [K('a')] })
    expect(d.evolvableIds.value.has(1)).toBe(false)
  })

  it('exclut une espèce terminale même gorgée de doublons', () => {
    const d = setup(
      Array.from({ length: 5 }, (_, i) => catchOf('r' + i, 143)),
      { claimed: Array.from({ length: 5 }, (_, i) => K('r' + i)) },
    )
    expect(d.evolvableIds.value.has(143)).toBe(false)
  })

  it('exclut une espèce non capturée', () => {
    const d = setup([], {})
    expect(d.evolvableIds.value.has(1)).toBe(false)
  })

  it('recalcule quand des bonbons sont dépensés', () => {
    const catches = ref(Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)))
    const state = ref({ claimed: [K('s0'), K('s1'), K('s2')], spent: {}, evolutions: [] })
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
      {
        claimed: [K('s0'), K('s1'), K('s2')],
        evolutions: [{ species: 2, from: 1, fromKey: K('s0'), date: '2026-07-14' }],
      },
    )
    expect(d.copyCount(1)).toBe(2)
  })

  it('n’en retire pas l’espèce du dex, même sans stock restant', () => {
    const d = setup([catchOf('a', 1)], {
      claimed: [K('a')],
      evolutions: [{ species: 2, from: 1, fromKey: K('a'), date: '2026-07-14' }],
    })
    expect(d.copyCount(1)).toBe(0)
    expect(d.bySpecies.value[1]).toHaveLength(1) // toujours acquise, juste plus d'exemplaire dispo
    expect(d.caughtCount.value).toBe(2) // l'espèce source ET la cible comptent comme vues
  })

  it('refuse une nouvelle évolution sans exemplaire disponible même avec assez de bonbons', () => {
    const d = setup(
      Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)),
      {
        claimed: [K('s0'), K('s1'), K('s2')],
        evolutions: [
          { species: 2, from: 1, fromKey: K('s0'), date: '2026-07-01' },
          { species: 2, from: 1, fromKey: K('s1'), date: '2026-07-02' },
          { species: 2, from: 1, fromKey: K('s2'), date: '2026-07-03' },
        ],
      },
    )
    expect(d.candies(1)).toBeGreaterThanOrEqual(0)
    expect(d.copyCount(1)).toBe(0)
    expect(d.canEvolve(1)).toBe(false)
  })

  it('reconnaît un exemplaire source produit par une évolution précédente (chaîne)', () => {
    // Bulbizarre → Herbizarre → Florizarre : la source de la seconde évolution est
    // l'exemplaire d'Herbizarre produit par la première, pas une capture.
    const d = setup(
      Array.from({ length: 6 }, (_, i) => catchOf('s' + i, 1)),
      {
        claimed: Array.from({ length: 6 }, (_, i) => K('s' + i)),
        evolutions: [{ species: 2, from: 1, fromKey: K('s0'), date: '2026-07-14' }],
      },
    )
    expect(d.copyCount(2)).toBe(1)
  })
})

describe('espèce jamais rencontrée', () => {
  it('tient pour nouvelle une espèce absente de la collection', () => {
    const d = setup([catchOf('a', 25)], { claimed: [K('a')] })
    expect(d.isNewSpecies(1)).toBe(true)
  })

  it('ne tient pas pour nouvelle une espèce déjà ouverte', () => {
    const d = setup([catchOf('a', 25)], { claimed: [K('a')] })
    expect(d.isNewSpecies(25)).toBe(false)
  })

  it('tient pour nouvelle une espèce dont la seule capture attend encore d’être ouverte', () => {
    const d = setup([catchOf('a', 25)], {})
    expect(d.isNewSpecies(25)).toBe(true)
  })

  it('ne tient pas pour nouvelle une espèce obtenue par évolution seule', () => {
    const d = setup([catchOf('a', 129)], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, fromKey: K('a'), date: '2026-07-14' }],
    })
    expect(d.isNewSpecies(130)).toBe(false)
  })

  it('ne tient pas pour nouvelle une espèce dont le dernier exemplaire a été consommé', () => {
    const d = setup([catchOf('a', 129)], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, fromKey: K('a'), date: '2026-07-14' }],
    })
    expect(d.copyCount(129)).toBe(0)
    expect(d.isNewSpecies(129)).toBe(false)
  })

  it('s’aligne sur caughtCount — une espèce nouvelle est une espèce non comptée', () => {
    const d = setup([catchOf('a', 25), catchOf('b', 1)], { claimed: [K('a')] })
    const news = [25, 1, 4].filter((id) => d.isNewSpecies(id))
    expect(news).toEqual([1, 4])
    expect(d.caughtCount.value).toBe(1)
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
    state.value = { ...state.value, claimed: [K('a')] }
    expect(d.caughtCount.value).toBe(1)
    expect(d.pending.value).toHaveLength(0)
  })

  it('les accesseurs reflètent un changement d’état sans être des computed', () => {
    const catches = ref([catchOf('a', 1)])
    const state = ref({ claimed: [], spent: {}, evolutions: [] })
    const d = useDex(catches, state)
    expect(d.candies(1)).toBe(0)
    state.value = { ...state.value, claimed: [K('a')] }
    expect(d.candies(1)).toBe(3)
  })
})
