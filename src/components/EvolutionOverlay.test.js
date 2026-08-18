import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EvolutionOverlay from './EvolutionOverlay.vue'
import { useCollection } from '../composables/useCollection.js'
import { entryKey } from '../../shared/entry.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const catchOf = (id, species) => {
  const entry = {
    source: 'github', external_id: id, species, shiny: false, via: 'catch',
    label: 'fix: race condition', ref: 'moi/atlas#142 · a3f8c21',
    url: 'https://github.com/moi/atlas/pull/142', date: '2026-02-03',
  }
  return { key: entryKey(entry.source, entry.external_id), ...entry }
}

/**
 * L'évolution appartient au serveur : ce client l'imite en tenant sa propre table, comme le
 * ferait la base. Le blob d'état ne porte plus les évolutions.
 */
const fakeClient = (catches, claimed) => {
  let state = { claimed, spent: {}, evolutions: [] }
  const evolutions = []
  return {
    readCatches: async () => catches,
    readState: async () => ({ state: JSON.parse(JSON.stringify(state)), blobSha: 'blob' }),
    writeState: async (next) => { state = JSON.parse(JSON.stringify(next)); return { blobSha: 'blob' } },
    readEvolutions: async () => evolutions.map((e) => ({ ...e })),
    evolve: async (fromKey, to, day) => {
      const id = evolutions.length + 1
      evolutions.push({ id, from_species: 1, to_species: to, from_key: fromKey, day })
      return id
    },
  }
}

const mountEvo = (props) =>
  mount(EvolutionOverlay, { props: { from: 1, to: 2, shiny: false, candies: 0, ...props } })

describe('EvolutionOverlay', () => {
  it('nomme les deux formes', () => {
    expect(mountEvo({}).find('.reveal-name').text()).toBe('Bulbizarre → Herbizarre')
  })

  it('montre les deux sprites', () => {
    const imgs = mountEvo({}).findAll('.evo-frame img')
    expect(imgs).toHaveLength(2)
    expect(imgs[0].attributes('src')).toContain('/1.png')
    expect(imgs[1].attributes('src')).toContain('/2.png')
  })

  it('propage le chromatique aux deux formes', () => {
    const imgs = mountEvo({ shiny: true }).findAll('.evo-frame img')
    expect(imgs[0].attributes('src')).toContain('/shiny/')
    expect(imgs[1].attributes('src')).toContain('/shiny/')
  })

  it('prend la couleur du palier de la forme obtenue', () => {
    // Magicarpe (commun) → Léviator (rare) : la scène doit porter le palier d'arrivée
    expect(mountEvo({ from: 129, to: 130 }).find('.evostage').attributes('style')).toContain('--t-r')
  })

  it('émet done', async () => {
    const w = mountEvo({})
    await w.find('.next-btn').trigger('click')
    expect(w.emitted('done')).toBeTruthy()
  })

  it('rend chacune des trois évolutions d’Évoli', () => {
    for (const [to, name] of [[134, 'Aquali'], [135, 'Voltali'], [136, 'Pyroli']]) {
      expect(mountEvo({ from: 133, to }).find('.reveal-name').text()).toBe(`Évoli → ${name}`)
    }
  })
})

describe('bloc d’informations', () => {
  it('marque une espèce cible jamais rencontrée', () => {
    const w = mountEvo({ isNew: true })
    expect(w.find('.new-chip').text()).toBe('Nouveau')
    expect(w.find('.reveal-note').text()).toContain('Première entrée à la planche')
  })

  it('ne marque rien pour une espèce déjà à la planche', () => {
    const w = mountEvo({ isNew: false })
    expect(w.find('.new-chip').exists()).toBe(false)
    expect(w.find('.reveal-note').text()).toContain('Déjà à la planche')
  })

  it('ne suppose rien quand la propriété est absente', () => {
    expect(mountEvo({}).find('.new-chip').exists()).toBe(false)
  })

  // Le palier affiché est celui de ce qu'on obtient, pas de ce qu'on avait :
  // Magicarpe (commun) → Léviator (rare).
  it('affiche le palier de la forme obtenue', () => {
    expect(mountEvo({ from: 129, to: 130 }).find('.reveal-tags').text()).toContain('Rare')
    expect(mountEvo({ from: 129, to: 130 }).find('.reveal-tags').text()).not.toContain('Commun')
  })

  it('affiche le solde de bonbons restant et la famille qui les porte', () => {
    // Herbizarre → Florizarre : la famille est celle de la racine, Bulbizarre.
    const w = mountEvo({ from: 2, to: 3, candies: 12 })
    expect(w.find('.reveal-note').text()).toContain('il reste 12 bonbons')
    expect(w.find('.reveal-note').text()).toContain('Bulbizarre')
  })

  it('annonce le chromatique dans le bandeau et dans les puces', () => {
    const w = mountEvo({ shiny: true })
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
    expect(w.find('.shiny-chip').exists()).toBe(true)
  })

  it('prime le chromatique sur le légendaire dans le bandeau', () => {
    // Aucune évolution ne mène à un légendaire dans le dex ; on force la cible pour
    // vérifier la règle de priorité elle-même, qui doit rester alignée sur le rituel.
    const w = mountEvo({ from: 1, to: 144, shiny: true })
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
  })

  it('garde le bandeau « Évolution » dans le cas ordinaire', () => {
    expect(mountEvo({}).find('.reveal-banner').text()).toBe('Évolution')
  })

  it('cumule les trois puces sans qu’aucune n’en remplace une autre', () => {
    const w = mountEvo({ isNew: true, shiny: true })
    expect(w.findAll('.chip')).toHaveLength(3)
  })
})

describe('intégration — App.vue ne doit pas lire la nouveauté après l’écriture', () => {
  // Trois captures de Bulbizarre = 9 bonbons, au-dessus des 8 que coûte Herbizarre.
  const loadedCollection = async () => {
    const col = useCollection()
    const catches = [catchOf('a', 1), catchOf('b', 1), catchOf('c', 1)]
    await col.load(fakeClient(catches, catches.map((c) => c.key)))
    return col
  }

  it('marque la nouveauté lue avant l’évolution, pas après', async () => {
    const col = await loadedCollection()
    const isNew = col.dex.isNewSpecies(2) // figé comme dans App.vue, AVANT l'écriture
    expect(isNew).toBe(true)

    await col.evolve(1, 2, col.dex.availableEntries(1)[0].key, '2026-08-07')
    expect(col.error.value).toBe(null)
    expect(col.dex.isNewSpecies(2)).toBe(false) // l'écriture l'a déjà inscrite

    const w = mountEvo({ from: 1, to: 2, isNew, candies: col.dex.candies(2) })
    expect(w.find('.new-chip').exists()).toBe(true)
  })

  it('affiche le solde de bonbons d’après la dépense', async () => {
    const col = await loadedCollection()
    expect(col.dex.candies(1)).toBe(9)
    await col.evolve(1, 2, col.dex.availableEntries(1)[0].key, '2026-08-07')

    const w = mountEvo({ from: 1, to: 2, candies: col.dex.candies(2) })
    expect(col.dex.candies(2)).toBe(1) // 9 gagnés − 8 dépensés
    expect(w.find('.reveal-note').text()).toContain('il reste 1 bonbon')
    expect(w.find('.reveal-note').text()).not.toContain('1 bonbons')
  })
})

describe('focus clavier', () => {
  const mountAttached = (props = {}) =>
    mount(EvolutionOverlay, {
      props: { from: 1, to: 2, shiny: false, candies: 0, ...props },
      attachTo: document.body,
    })

  // La cérémonie dure ~2,4 s : focaliser tout de suite permettrait de l'escamoter
  // d'un Espace pressé trop tôt.
  it('ne focalise rien pendant la cérémonie', () => {
    mountAttached()
    expect(document.activeElement).toBe(document.body)
  })

  it('pose le focus sur le bouton une fois la cérémonie finie', async () => {
    const w = mountAttached()
    vi.advanceTimersByTime(2400)
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('.next-btn').element)
  })

  // Des postes forcent prefers-reduced-motion sans que l'utilisateur l'ait demandé, et la
  // cérémonie joue quand même depuis ac68ba4 : raccourcir le focus sur ce signal rendrait le
  // bouton activable pendant une animation bien visible.
  it('attend la cérémonie même quand le système demande de réduire les animations', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const w = mountAttached()
    vi.advanceTimersByTime(0)
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(document.body)

    vi.advanceTimersByTime(2400)
    await w.vm.$nextTick()
    expect(document.activeElement).toBe(w.find('.next-btn').element)
  })
})
