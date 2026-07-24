import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RitualOverlay from './RitualOverlay.vue'
import { useCollection } from '../composables/useCollection.js'
import { loadDemoClient } from '../fixtures/demo.js'
import { entryKey } from '../../shared/entry.js'

// `key` est dérivée plutôt que codée en dur : surcharger `external_id` doit suffire à obtenir
// un exemplaire distinct, sans avoir à penser à mettre la clé à jour avec.
const entryOf = (over = {}) => {
  const entry = {
    source: 'github', external_id: 'a3f8c21e9b4d',
    label: 'fix: race condition', ref: 'moi/atlas#142 · a3f8c21',
    url: 'https://github.com/moi/atlas/pull/142',
    date: '2026-02-03', species: 25, shiny: false, via: 'catch', ...over,
  }
  return { key: entryKey(entry.source, entry.external_id), ...entry }
}

const catchOf = (id, species, over = {}) => entryOf({ external_id: id, species, ...over })

const fakeClient = (catches, claimed) => {
  let state = { claimed, spent: {}, evolutions: [] }
  return {
    readCatches: async () => catches,
    readState: async () => ({ state: JSON.parse(JSON.stringify(state)), blobSha: 'blob' }),
    writeState: async (next) => { state = JSON.parse(JSON.stringify(next)); return { blobSha: 'blob' } },
  }
}

const mountRitual = (props = {}) =>
  mount(RitualOverlay, { props: { entry: entryOf(), remaining: 1, ...props } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => vi.useRealTimers())

describe('pli scellé', () => {
  it('porte le libellé de la capture et la référence donnée par sa source', () => {
    const w = mountRitual()
    expect(w.find('.pkt-title').text()).toBe('fix: race condition')
    expect(w.find('.pkt-pr').text()).toContain('moi/atlas#142 · a3f8c21')
  })

  // Une source peut n'avoir aucune référence courte à donner : le pli doit rester lisible.
  it('se passe de la ligne de référence quand la source n’en fournit pas', () => {
    const w = mountRitual({ entry: entryOf({ source: 'crm', ref: null }) })
    expect(w.find('.pkt-pr').exists()).toBe(false)
    expect(w.find('.pkt-title').text()).toBe('fix: race condition')
  })

  it('ne révèle rien avant d’être ouvert', () => {
    const w = mountRitual()
    expect(w.find('.reveal').exists()).toBe(false)
    expect(w.text()).not.toContain('Pikachu')
  })

  it('annonce le dernier pli', () => {
    expect(mountRitual({ remaining: 1 }).find('.queue-note').text()).toBe('dernier pli')
  })

  it('annonce la file restante', () => {
    expect(mountRitual({ remaining: 3 }).find('.queue-note').text()).toBe('3 plis en attente')
  })

  it('empile des plis fantômes selon la file', () => {
    expect(mountRitual({ remaining: 1 }).findAll('.ghost-pkt')).toHaveLength(0)
    expect(mountRitual({ remaining: 2 }).findAll('.ghost-pkt')).toHaveLength(1)
    expect(mountRitual({ remaining: 3 }).findAll('.ghost-pkt')).toHaveLength(2)
  })
})

describe('ouverture', () => {
  it('réclame la capture dès que le sceau est brisé', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    expect(w.emitted('claim')[0]).toEqual(['github:a3f8c21e9b4d'])
  })

  it('passe par la silhouette avant la révélation', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    expect(w.find('.reveal').classes()).toContain('silhouette')
    expect(w.find('img').classes()).toContain('silh')
    expect(w.find('.reveal-name').exists()).toBe(false)
  })

  it('révèle après le délai', async () => {
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    expect(w.find('.reveal').classes()).toContain('revealed')
    expect(w.find('.reveal-name').text()).toBe('Pikachu')
  })
})

describe('échelle d’intensité', () => {
  it('n’affiche pas de rayons pour un commun', async () => {
    const w = mountRitual({ entry: entryOf({ species: 19 }) }) // Rattata, commun
    await w.find('.packet').trigger('click')
    expect(w.find('.rays').exists()).toBe(false)
  })

  it('affiche des rayons dès le palier peu commun', async () => {
    const w = mountRitual({ entry: entryOf({ species: 20 }) }) // Rattatac, peu commun
    await w.find('.packet').trigger('click')
    expect(w.find('.rays').exists()).toBe(true)
  })

  it('monte le halo avec le palier', async () => {
    const glow = async (species) => {
      const w = mountRitual({ entry: entryOf({ species }) })
      await w.find('.packet').trigger('click')
      return w.find('.ritual').attributes('style')
    }
    expect(await glow(19)).toContain('--glow: 8px')    // commun
    expect(await glow(20)).toContain('--glow: 16px')   // peu commun
    expect(await glow(1)).toContain('--glow: 30px')    // rare
    expect(await glow(144)).toContain('--glow: 52px')  // légendaire
  })

  it('marque la scène légendaire', async () => {
    const w = mountRitual({ entry: entryOf({ species: 144 }) })
    await w.find('.packet').trigger('click')
    expect(w.find('.ritual').classes()).toContain('leg')
    vi.advanceTimersByTime(2800)
    await w.vm.$nextTick()
    expect(w.find('.reveal-banner').text()).toContain('Légendaire')
  })

  it('garde une durée proche entre paliers — l’écart passe par l’intensité', async () => {
    const w = mountRitual({ entry: entryOf({ species: 19 }) })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    expect(w.find('.reveal').classes()).toContain('revealed')

    const l = mountRitual({ entry: entryOf({ species: 144 }) })
    await l.find('.packet').trigger('click')
    vi.advanceTimersByTime(2800)
    await l.vm.$nextTick()
    expect(l.find('.reveal').classes()).toContain('revealed')
  })
})

describe('chromatique', () => {
  it('teinte l’attente et fait scintiller la révélation', async () => {
    const w = mountRitual({ entry: entryOf({ shiny: true }) })
    await w.find('.packet').trigger('click')
    expect(w.find('.dev-note').text()).toContain('scintille')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
    expect(w.findAll('.spark')).toHaveLength(16)
    expect(w.find('img').attributes('src')).toContain('/shiny/')
  })

  it('prime le chromatique sur le légendaire dans le bandeau', async () => {
    const w = mountRitual({ entry: entryOf({ species: 144, shiny: true }) })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2800)
    await w.vm.$nextTick()
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
  })
})

describe('espèce jamais rencontrée', () => {
  const reveal = async (props) => {
    const w = mountRitual(props)
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2800) // couvre aussi la tenue plus longue du légendaire
    await w.vm.$nextTick()
    return w
  }

  it('marque la révélation d’une espèce nouvelle', async () => {
    const w = await reveal({ isNew: true })
    expect(w.find('.new-chip').text()).toBe('Nouveau')
    expect(w.find('.reveal-note').text()).toContain('Première entrée à la planche')
  })

  it('ne marque rien pour une espèce déjà à la planche', async () => {
    const w = await reveal({ isNew: false })
    expect(w.find('.new-chip').exists()).toBe(false)
    expect(w.find('.reveal-note').text()).toContain('Déjà à la planche')
  })

  it('ne suppose rien quand la propriété est absente', async () => {
    const w = await reveal()
    expect(w.find('.new-chip').exists()).toBe(false)
  })

  it('ne divulgue rien avant la révélation — le pli scellé et la silhouette restent muets', async () => {
    const w = mountRitual({ isNew: true })
    expect(w.text()).not.toContain('Nouveau')
    await w.find('.packet').trigger('click')
    expect(w.find('.reveal').classes()).toContain('silhouette')
    expect(w.text()).not.toContain('Nouveau')
  })

  it('cohabite avec le palier et le chromatique sans les remplacer', async () => {
    const w = await reveal({ entry: entryOf({ species: 144, shiny: true }), isNew: true })
    expect(w.find('.new-chip').exists()).toBe(true)
    expect(w.find('.shiny-chip').exists()).toBe(true)
    expect(w.findAll('.chip')).toHaveLength(3)
  })
})

describe('suite de la file', () => {
  it('propose le retour quand c’est le dernier', async () => {
    const w = mountRitual({ remaining: 1 })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    expect(w.find('.next-btn').text()).toBe('Retour à la planche')
    expect(w.findAll('button.queue-note')).toHaveLength(0)
  })

  it('décompte les plis restants après celui-ci', async () => {
    const w = mountRitual({ remaining: 3 })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    expect(w.find('.next-btn').text()).toContain('2 restants')
  })

  it('accorde le singulier à un seul pli restant', async () => {
    const w = mountRitual({ remaining: 2 })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    expect(w.find('.next-btn').text()).toContain('1 restant')
    expect(w.find('.next-btn').text()).not.toContain('restants')
  })

  it('émet next et skip-all', async () => {
    const w = mountRitual({ remaining: 3 })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    await w.find('.next-btn').trigger('click')
    expect(w.emitted('next')).toBeTruthy()
    await w.find('button.queue-note').trigger('click')
    expect(w.emitted('skip-all')).toBeTruthy()
  })
})

describe('fermeture anticipée', () => {
  it('permet de revenir à la planche depuis le pli scellé, plis restants ou non', () => {
    const w = mountRitual({ remaining: 3 })
    expect(w.find('.ritual-close').exists()).toBe(true)
  })

  it('permet de revenir à la planche pendant la révélation, sans avoir tout ouvert', async () => {
    const w = mountRitual({ remaining: 3 })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()
    await w.find('.ritual-close').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('n’émet pas skip-all ni next en fermant', async () => {
    const w = mountRitual({ remaining: 3 })
    await w.find('.ritual-close').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
    expect(w.emitted('skip-all')).toBeFalsy()
    expect(w.emitted('next')).toBeFalsy()
  })
})

describe('intégration — file réelle (App.vue ne doit pas décompter sous le composant)', () => {
  it('annonce le bon nombre de plis restants une fois le sceau brisé', async () => {
    const col = useCollection()
    await col.load(loadDemoClient())
    const entry = col.dex.pending.value[0]
    const remaining = ref(col.dex.pending.value.length) // figé comme dans App.vue

    const w = mount({
      components: { RitualOverlay },
      setup: () => ({ col, entry, remaining }),
      template: `<RitualOverlay :entry="entry" :remaining="remaining" @claim="col.claim" />`,
    })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()

    // 3 en attente au départ : celui-ci + 2 → le libellé doit annoncer 2
    expect(w.find('.next-btn').text()).toContain('2 restants')
    expect(col.dex.pending.value).toHaveLength(2)
  })

  // `claim` inscrit l'espèce au dex dès le sceau brisé : lue trop tard, la question
  // « jamais rencontrée ? » répond toujours non et le marqueur ne s'allume jamais.
  it('marque la nouveauté lue avant le claim, pas après', async () => {
    const col = useCollection()
    await col.load(fakeClient([catchOf('a', 25)], []))
    const entry = col.dex.pending.value[0]
    const isNew = ref(col.dex.isNewSpecies(entry.species)) // figé comme dans App.vue

    const w = mount({
      components: { RitualOverlay },
      setup: () => ({ col, entry, isNew }),
      template: `<RitualOverlay :entry="entry" :remaining="1" :is-new="isNew" @claim="col.claim" />`,
    })
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(2200)
    await w.vm.$nextTick()

    expect(col.dex.isNewSpecies(25)).toBe(false) // le claim l'a déjà inscrite
    expect(w.find('.new-chip').exists()).toBe(true)
  })

  it('ne marque pas le second pli d’une espèce ouverte au pli précédent', async () => {
    const col = useCollection()
    await col.load(fakeClient([catchOf('a', 25), catchOf('b', 25, { date: '2026-02-04' })], []))

    const first = col.dex.pending.value[0]
    expect(col.dex.isNewSpecies(first.species)).toBe(true)
    await col.claim(first.key)

    const second = col.dex.pending.value[0]
    expect(second.external_id).toBe('b')
    expect(col.dex.isNewSpecies(second.species)).toBe(false)
  })
})

describe('accessibilité', () => {
  it('révèle presque immédiatement si l’utilisateur refuse les animations', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const w = mountRitual()
    await w.find('.packet').trigger('click')
    vi.advanceTimersByTime(150)
    await w.vm.$nextTick()
    expect(w.find('.reveal').classes()).toContain('revealed')
  })
})
