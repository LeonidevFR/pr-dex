import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import RitualOverlay from './RitualOverlay.vue'
import { useCollection } from '../composables/useCollection.js'
import { loadDemoClient } from '../fixtures/demo.js'

const entryOf = (over = {}) => ({
  sha: 'a3f8c21e9b4d', repo: 'moi/atlas', pr: 142, title: 'fix: race condition',
  date: '2026-02-03', species: 25, shiny: false, via: 'pr', ...over,
})

const mountRitual = (props = {}) =>
  mount(RitualOverlay, { props: { entry: entryOf(), remaining: 1, ...props } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => vi.useRealTimers())

describe('pli scellé', () => {
  it('porte le titre de la PR, son dépôt et son sha court', () => {
    const w = mountRitual()
    expect(w.find('.pkt-title').text()).toBe('fix: race condition')
    expect(w.find('.pkt-pr').text()).toContain('moi/atlas#142')
    expect(w.find('.pkt-pr').text()).toContain('a3f8c21')
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
    expect(w.emitted('claim')[0]).toEqual(['a3f8c21e9b4d'])
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
