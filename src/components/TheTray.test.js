import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TheTray from './TheTray.vue'

const entry = (sha, species, extra = {}) => ({
  sha, species, shiny: false, via: 'pr', repo: 'moi/atlas', pr: 1, title: 't', date: '2026-02-03', ...extra,
})

const mountTray = (bySpecies) => mount(TheTray, { props: { bySpecies } })

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
})
