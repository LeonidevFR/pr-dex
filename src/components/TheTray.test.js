import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TheTray from './TheTray.vue'

const entry = (id, species, extra = {}) => ({
  source: 'github', external_id: id, key: `github:${id}`, species, shiny: false, via: 'catch',
  label: 't', ref: 'moi/atlas#1', url: 'https://github.com/moi/atlas/pull/1',
  date: '2026-02-03', ...extra,
})

const mountTray = (bySpecies, evolvable) => mount(TheTray, { props: { bySpecies, evolvable } })
const mountFiltered = (props) => mount(TheTray, { props: { bySpecies: {}, filtersOpen: true, ...props } })

describe('TheTray', () => {
  it('affiche les 151 cases', () => {
    expect(mountTray({}).findAll('.cell')).toHaveLength(151)
  })

  it('rend une case non capturée en silhouette et la désactive', () => {
    const cell = mountTray({}).findAll('.cell')[0]
    expect(cell.classes()).toContain('ghost')
    expect(cell.attributes('disabled')).toBeDefined()
  })

  it('rend une case capturée cliquable', () => {
    const cell = mountTray({ 25: [entry('a3f8c21e9b', 25)] }).findAll('.cell')[24]
    expect(cell.classes()).toContain('has')
    expect(cell.attributes('disabled')).toBeUndefined()
  })

  it('émet l’espèce sélectionnée au clic', async () => {
    const w = mountTray({ 25: [entry('a3f8c21e9b', 25)] })
    await w.findAll('.cell')[24].trigger('click')
    expect(w.emitted('select')[0]).toEqual([25])
  })

  it('montre la source d’une capture', () => {
    const w = mountTray({ 25: [entry('a3f8c21e9b4d', 25, { source: 'crm' })] })
    expect(w.findAll('.cell')[24].find('.cell-origin').text()).toBe('crm')
  })

  it('affiche « évolué » plutôt qu’une source pour une entrée d’évolution', () => {
    const w = mountTray({ 130: [{ species: 130, from: 129, via: 'evo', date: '2026-07-14', shiny: false }] })
    expect(w.findAll('.cell')[129].find('.cell-origin').text()).toBe('évolué')
  })

  it('compte les doublons', () => {
    const w = mountTray({ 25: [entry('a', 25), entry('b', 25)] })
    expect(w.findAll('.cell')[24].find('.cell-dupes').text()).toBe('×2')
  })

  it('n’affiche pas de compteur pour une capture unique', () => {
    const w = mountTray({ 25: [entry('a', 25)] })
    expect(w.findAll('.cell')[24].find('.cell-dupes').exists()).toBe(false)
  })

  it('affiche le stock disponible (prop copies) plutôt que le total brut quand fourni', () => {
    const w = mount(TheTray, {
      props: { bySpecies: { 1: [entry('a', 1), entry('b', 1)] }, copies: { 1: 1 } },
    })
    expect(w.findAll('.cell')[0].find('.cell-dupes').exists()).toBe(false) // 1 disponible : pas de badge
  })

  it('remonte à ×N avec la prop copies quand du stock reste', () => {
    const w = mount(TheTray, {
      props: { bySpecies: { 1: [entry('a', 1), entry('b', 1), entry('c', 1)] }, copies: { 1: 2 } },
    })
    expect(w.findAll('.cell')[0].find('.cell-dupes').text()).toBe('×2')
  })

  it('marque une espèce dont au moins une capture est chromatique', () => {
    const w = mountTray({ 25: [entry('a', 25), entry('b', 25, { shiny: true })] })
    expect(w.findAll('.cell')[24].classes()).toContain('shiny')
    expect(w.findAll('.cell')[24].find('img').attributes('src')).toContain('/shiny/')
  })

  it('marque un sprite cassé sans retirer la case', () => {
    const w = mountTray({ 25: [entry('a', 25)] })
    const img = w.findAll('.cell')[24].find('img')
    img.trigger('error')
    expect(w.findAll('.cell')).toHaveLength(151)
  })

  it('marque une case dont l’espèce peut évoluer maintenant', () => {
    const w = mountTray({ 1: [entry('a', 1)] }, new Set([1]))
    expect(w.findAll('.cell')[0].find('.cell-evo').exists()).toBe(true)
  })

  it('n’affiche pas le badge d’évolution pour une espèce qui n’en a pas les moyens', () => {
    const w = mountTray({ 1: [entry('a', 1)] }, new Set())
    expect(w.findAll('.cell')[0].find('.cell-evo').exists()).toBe(false)
  })

  it('n’affiche pas le badge d’évolution sans le prop (valeur par défaut)', () => {
    const w = mountTray({ 1: [entry('a', 1)] })
    expect(w.findAll('.cell')[0].find('.cell-evo').exists()).toBe(false)
  })

  it('marque une légendaire capturée pour le halo', () => {
    // 144 Artikodin est légendaire (DEX[144].tier === 'l')
    const w = mountTray({ 144: [entry('a', 144)] })
    expect(w.findAll('.cell')[143].classes()).toContain('legendary')
  })

  it('ne marque pas une non-légendaire', () => {
    const w = mountTray({ 25: [entry('a', 25)] })
    expect(w.findAll('.cell')[24].classes()).not.toContain('legendary')
  })

  it('ne marque pas une légendaire non capturée', () => {
    expect(mountTray({}).findAll('.cell')[143].classes()).not.toContain('legendary')
  })

  describe('filtres', () => {
    const chipByText = (w, text) => w.findAll('.filter-chip').find((c) => c.text() === text)

    it('ne rend pas le panneau quand filtersOpen est faux', () => {
      expect(mountTray({}).find('.filters').exists()).toBe(false)
    })

    it('rend le panneau quand filtersOpen est vrai', () => {
      expect(mountFiltered().find('.filters').exists()).toBe(true)
    })

    it('ne garde que les paliers listés dans activeTiers (5 légendaires)', () => {
      const w = mountFiltered({ activeTiers: new Set(['l']) })
      expect(w.findAll('.cell')).toHaveLength(5)
    })

    it('émet toggle-tier avec le palier cliqué, ne mute rien elle-même', async () => {
      const w = mountFiltered()
      await chipByText(w, 'Commun').trigger('click')
      expect(w.emitted('toggle-tier')[0]).toEqual(['c'])
      expect(w.findAll('.cell')).toHaveLength(151) // le parent décide, pas la case ici
    })

    it('filtre sur les captures via le prop caughtFilter', () => {
      const w = mountFiltered({ bySpecies: { 25: [entry('a', 25)] }, caughtFilter: 'caught' })
      expect(w.findAll('.cell')).toHaveLength(1)
      expect(w.findAll('.cell')[0].classes()).toContain('has')
    })

    it('filtre sur les non-capturées via le prop caughtFilter', () => {
      const w = mountFiltered({ bySpecies: { 25: [entry('a', 25)] }, caughtFilter: 'uncaught' })
      expect(w.findAll('.cell')).toHaveLength(150)
    })

    it('émet set-caught-filter au clic sur un chip de statut', async () => {
      const w = mountFiltered()
      await chipByText(w, 'Capturés').trigger('click')
      expect(w.emitted('set-caught-filter')[0]).toEqual(['caught'])
    })

    it('n’affiche le bouton réinitialiser que si un filtre est actif', () => {
      expect(mountFiltered().find('.filter-reset').exists()).toBe(false)
      expect(mountFiltered({ caughtFilter: 'caught' }).find('.filter-reset').exists()).toBe(true)
    })

    it('émet reset-filters au clic sur réinitialiser', async () => {
      const w = mountFiltered({ caughtFilter: 'caught' })
      await w.find('.filter-reset').trigger('click')
      expect(w.emitted('reset-filters')).toBeTruthy()
    })
  })
})
