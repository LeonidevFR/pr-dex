import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useDex } from './useDex.js'
import { DEX } from '../../shared/species.js'
import { entryKey } from '../../shared/entry.js'

/** Clé d'exemplaire telle que `useDex` la dérive — ce que `state.claimed` référence. */
const K = (id) => entryKey('github', id)

const catchOf = (id, species, extra = {}) => ({
  source: 'github', external_id: id, species, shiny: false,
  label: 't', ref: 'moi/atlas#1', url: 'https://github.com/moi/atlas/pull/1',
  date: '2026-02-03', ...extra,
})

const setup = (catches, state) =>
  useDex(
    ref(catches),
    ref({ claimed: [], spent: {}, evolutions: [], ...state }),
    ref(new Set()),
    // Les évolutions viennent du serveur : `{ id, from_species, to_species, from_key }`. Les
    // cas ci-dessous les décrivent encore dans l'ancienne forme, plus lisible ; on convertit
    // ici plutôt que de les réécrire un par un.
    ref((state?.evolutions ?? []).map((e, i) => ({
      id: i, from_species: e.from, to_species: e.species,
      from_key: e.fromKey ?? e.fromSha ?? null, day: e.date,
    }))),
  )

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
      evolutions: [{ species: 130, from: 129, fromKey: K('a'), date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130]).toHaveLength(1)
    expect(d.bySpecies.value[130][0].via).toBe('evo')
    expect(d.caughtCount.value).toBe(2)
  })

  it('hérite le chromatique de la source lors d’une évolution', () => {
    const d = setup([catchOf('a', 129, { shiny: true })], {
      claimed: [K('a')],
      evolutions: [{ species: 130, from: 129, fromKey: K('a'), date: '2026-07-14' }],
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

  /**
   * Le chemin « sans clé » n'existe plus : `evolutions.from_key` est NOT NULL en base, et le
   * serveur refuse une évolution qui ne désigne pas un exemplaire précis. Ce que ce cas
   * vérifiait — retrouver la source par l'espèce — n'a plus de situation où s'appliquer.
   */
  it('rattache l’évolution à l’exemplaire que sa clé désigne, et à aucun autre', () => {
    const d = setup([
      catchOf('vieux', 129, { shiny: false, date: '2026-01-01' }),
      catchOf('neuf', 129, { shiny: true, date: '2026-02-01' }),
    ], {
      claimed: [K('vieux'), K('neuf')],
      evolutions: [{ species: 130, from: 129, fromKey: K('vieux'), date: '2026-07-14' }],
    })
    expect(d.bySpecies.value[130][0].shiny).toBe(false)
    // L'autre exemplaire n'a pas été consommé : il reste disponible.
    expect(d.availableEntries(129).map((e) => e.key)).toEqual([K('neuf')])
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

  /**
   * Une évolution consomme, elle ne crédite pas : le Pokémon obtenu n'ajoute aucun bonbon à la
   * famille. Son COÛT, lui, est déduit — c'est ce que `state.spent` matérialisait, et qui se
   * recalcule désormais depuis les évolutions elles-mêmes.
   */
  it('ne crédite aucun bonbon pour une évolution, et en déduit le coût', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 1), catchOf('c', 1)], {
      claimed: [K('a'), K('b'), K('c')],
      evolutions: [{ species: 2, from: 1, fromKey: K('a'), date: '2026-07-14' }],
    })
    // Trois captures font neuf bonbons ; l'évolution de Bulbizarre en coûte huit.
    expect(d.candies(1)).toBe(9 - DEX[1].cost)
    // Et Herbizarre, obtenu par évolution, n'en crédite aucun.
    expect(d.candies(2)).toBe(9 - DEX[1].cost)
  })

  // `state.spent` n'est plus lu : une somme stockée finit toujours par diverger de ses termes,
  // et ces termes sont désormais en base.
  it('ignore l’ancien compteur de dépenses, qui ne fait plus autorité', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 1), catchOf('c', 1)], {
      claimed: [K('a'), K('b'), K('c')],
      spent: { 1: 8 },
    })
    expect(d.candies(1)).toBe(9)
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

  // Les bonbons se déduisent des évolutions : en faire une retire son coût de la réserve, et
  // la mise en avant doit suivre sans qu'on ait à toucher un compteur séparé.
  it('recalcule quand une évolution vient de dépenser', () => {
    const catches = ref(Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1)))
    const state = ref({ claimed: [K('s0'), K('s1'), K('s2')], spent: {}, evolutions: [] })
    const evolutions = ref([])
    const d = useDex(catches, state, ref(new Set()), evolutions)
    expect(d.evolvableIds.value.has(1)).toBe(true)
    evolutions.value = [{ id: 1, from_species: 1, to_species: 2, from_key: K('s0'), day: '2026-07-01' }]
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
    // Trois évolutions à huit bonbons pour neuf gagnés : la réserve est à découvert, ce qui
    // n'arrive que sur un cas construit — le serveur refuserait la troisième. Ce qui se vérifie
    // ici est ailleurs : plus un seul exemplaire ne reste à évoluer.
    expect(d.copyCount(1)).toBe(0)
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

/**
 * Les exemplaires perdus à l'arène.
 *
 * Le trou n'était pas qu'un compteur faux : un exemplaire évolué reçoit une clé NEUVE
 * (`evo:0`), si bien qu'on pouvait perdre un duel, faire évoluer le mort, et ressortir avec un
 * Pokémon plus fort portant une clé que l'arène croit vierge. La perte était annulée, et
 * récompensée.
 */
describe('exemplaires détruits à l’arène', () => {
  const troisPikachu = [
    { source: 'github', external_id: 'a', species: 25, shiny: false, date: '2026-08-01' },
    { source: 'github', external_id: 'b', species: 25, shiny: false, date: '2026-08-02' },
    { source: 'github', external_id: 'c', species: 25, shiny: false, date: '2026-08-03' },
  ]
  const etat = { claimed: ['github:a', 'github:b', 'github:c'], spent: {}, evolutions: [] }

  const dex = (perdus = []) => useDex(
    ref(troisPikachu), ref(etat), ref(new Set(perdus)),
  )

  it('ne compte plus un exemplaire détruit dans le stock', () => {
    expect(dex().copyCount(25)).toBe(3)
    expect(dex(['github:b']).copyCount(25)).toBe(2)
  })

  it('le retire des exemplaires qu’on peut choisir', () => {
    const cles = dex(['github:b']).availableEntries(25).map((e) => e.key)
    expect(cles).toEqual(['github:a', 'github:c'])
  })

  /**
   * Le cœur du défaut : sans ce filtre, le dernier exemplaire détruit restait évoluable, et
   * l'évolution lui rendait une clé neuve — la destruction s'annulait.
   */
  it('empêche de faire évoluer un exemplaire détruit', () => {
    const tous = ['github:a', 'github:b', 'github:c']
    expect(dex(tous).availableEntries(25)).toHaveLength(0)
    expect(dex(tous).canEvolve(25)).toBe(false)
  })

  /**
   * L'espèce reste acquise et les bonbons conservés : c'est la règle du mode — on perd ce
   * qu'on avait en main, pas ce qu'on a rencontré.
   */
  it('garde l’espèce au dex et les bonbons, comme le veut la règle', () => {
    const d = dex(['github:a', 'github:b', 'github:c'])
    expect(d.caughtCount.value).toBe(1)
    expect(d.isNewSpecies(25)).toBe(false)
    expect(d.candies(25)).toBe(dex().candies(25))
  })
})

/**
 * Ce qui peut descendre dans l'arène. Les Pokémon obtenus par évolution en étaient exclus tant
 * que le serveur cherchait l'espèce dans `catches` — une exclusion que personne n'avait décidée,
 * et qui écartait justement les plus belles bêtes.
 */
describe('ce qui peut être engagé', () => {
  it('comprend les captures ouvertes et les formes évoluées', () => {
    const d = setup([catchOf('a', 1), catchOf('b', 1)], {
      claimed: [K('a'), K('b')],
      evolutions: [{ species: 2, from: 1, fromKey: K('a'), date: '2026-07-14' }],
    })
    const cles = d.engageables.value.map((e) => e.key)
    expect(cles).toContain(K('b'))
    expect(cles).toContain('evo:0')
  })

  // La capture consommée y figure encore : c'est le serveur qui la refuse, et l'arène l'écarte
  // de son côté. Ce qui se vérifie ici est que la liste ne perde pas les évolutions.
  it('ne perd pas les évolutions au profit des seules captures', () => {
    const d = setup([catchOf('a', 1)], {
      claimed: [K('a')],
      evolutions: [{ species: 2, from: 1, fromKey: K('a'), date: '2026-07-14' }],
    })
    expect(d.engageables.value.some((e) => e.species === 2)).toBe(true)
  })
})
