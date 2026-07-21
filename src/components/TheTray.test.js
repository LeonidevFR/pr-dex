import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TheTray from './TheTray.vue'

const entry = (sha, species, extra = {}) => ({
  sha, species, shiny: false, via: 'pr', repo: 'moi/atlas', pr: 1, title: 't', date: '2026-02-03', ...extra,
})

const mountTray = (bySpecies, evolvable) => mount(TheTray, { props: { bySpecies, evolvable } })

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

  it('montre le short sha d’une capture de PR', () => {
    const w = mountTray({ 25: [entry('a3f8c21e9b4d', 25)] })
    expect(w.findAll('.cell')[24].find('.cell-sha').text()).toBe('a3f8c21')
  })

  it('affiche « évolué » plutôt qu’un sha pour une entrée d’évolution', () => {
    const w = mountTray({ 130: [{ species: 130, from: 129, via: 'evo', date: '2026-07-14', shiny: false }] })
    expect(w.findAll('.cell')[129].find('.cell-sha').text()).toBe('évolué')
  })

  it('compte les doublons', () => {
    const w = mountTray({ 25: [entry('a', 25), entry('b', 25)] })
    expect(w.findAll('.cell')[24].find('.cell-dupes').text()).toBe('×2')
  })

  it('n’affiche pas de compteur pour une capture unique', () => {
    const w = mountTray({ 25: [entry('a', 25)] })
    expect(w.findAll('.cell')[24].find('.cell-dupes').exists()).toBe(false)
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
    const openFilters = (w) => w.find('.filter-toggle').trigger('click')
    const chipByText = (w, text) => w.findAll('.filter-chip').find((c) => c.text() === text)

    it('affiche les 151 cases par défaut, panneau fermé', () => {
      const w = mountTray({})
      expect(w.find('.filters').exists()).toBe(false)
      expect(w.findAll('.cell')).toHaveLength(151)
    })

    it('ouvre le panneau de filtres au clic sur le bouton', async () => {
      const w = mountTray({})
      await openFilters(w)
      expect(w.find('.filters').exists()).toBe(true)
    })

    it('filtre par palier : ne garde que les légendaires (5 espèces)', async () => {
      const w = mountTray({})
      await openFilters(w)
      await chipByText(w, 'Commun').trigger('click')
      await chipByText(w, 'Peu commun').trigger('click')
      await chipByText(w, 'Rare').trigger('click')
      expect(w.findAll('.cell')).toHaveLength(5)
    })

    it('refuse de désactiver le dernier palier actif', async () => {
      const w = mountTray({})
      await openFilters(w)
      await chipByText(w, 'Commun').trigger('click')
      await chipByText(w, 'Peu commun').trigger('click')
      await chipByText(w, 'Rare').trigger('click')
      await chipByText(w, 'Légendaire').trigger('click')
      expect(w.findAll('.cell')).toHaveLength(5)
    })

    it('filtre sur les captures seules', async () => {
      const w = mountTray({ 25: [entry('a', 25)] })
      await openFilters(w)
      await chipByText(w, 'Capturés').trigger('click')
      expect(w.findAll('.cell')).toHaveLength(1)
      expect(w.findAll('.cell')[0].classes()).toContain('has')
    })

    it('filtre sur les non-capturées seules', async () => {
      const w = mountTray({ 25: [entry('a', 25)] })
      await openFilters(w)
      await chipByText(w, 'Non capturés').trigger('click')
      expect(w.findAll('.cell')).toHaveLength(150)
    })

    it('le bouton réinitialiser n’apparaît que si un filtre est actif, et remet tout à zéro', async () => {
      const w = mountTray({})
      await openFilters(w)
      expect(w.find('.filter-reset').exists()).toBe(false)
      await chipByText(w, 'Capturés').trigger('click')
      expect(w.find('.filter-reset').exists()).toBe(true)
      await w.find('.filter-reset').trigger('click')
      expect(w.findAll('.cell')).toHaveLength(151)
      expect(w.find('.filter-reset').exists()).toBe(false)
    })
  })
})
