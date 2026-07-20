import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SpeciesSheet from './SpeciesSheet.vue'

const pr = (sha, species, extra = {}) => ({
  sha, species, shiny: false, via: 'pr', repo: 'moi/atlas', pr: 142,
  title: 'fix: race condition', date: '2026-02-03', ...extra,
})
const evo = (species, from, extra = {}) => ({
  species, from, fromSha: 'abc', via: 'evo', date: '2026-07-14', shiny: false, ...extra,
})

const mountSheet = (props) =>
  mount(SpeciesSheet, {
    props: { id: 1, entries: null, candies: 0, canEvolve: false, isDeadEnd: false, ...props },
  })

describe('espèce non capturée', () => {
  it('masque le nom et montre la planche vide', () => {
    const w = mountSheet({ id: 4 })
    expect(w.find('.panel-name').text()).toBe('—————')
    expect(w.find('.panel-art').classes()).toContain('ghost')
  })

  it('indique de quelle évolution elle peut sortir', () => {
    expect(mountSheet({ id: 2 }).text()).toContain('Bulbizarre')
  })

  it('n’affiche pas de journal', () => {
    expect(mountSheet({ id: 4 }).find('.log').exists()).toBe(false)
  })
})

describe('journal des captures', () => {
  it('lie chaque capture de PR à GitHub', () => {
    const w = mountSheet({ id: 25, entries: [pr('a3f8c21e9b', 25)] })
    const row = w.find('a.log-row')
    expect(row.attributes('href')).toBe('https://github.com/moi/atlas/pull/142')
    expect(row.attributes('target')).toBe('_blank')
    expect(row.attributes('rel')).toContain('noopener')
  })

  it('affiche titre, dépôt, numéro et date', () => {
    const w = mountSheet({ id: 25, entries: [pr('a3f8c21e9b', 25)] })
    expect(w.text()).toContain('fix: race condition')
    expect(w.text()).toContain('moi/atlas#142')
    expect(w.text()).toContain('2026-02-03')
  })

  it('rend une évolution sans lien GitHub', () => {
    const w = mountSheet({ id: 130, entries: [evo(130, 129)] })
    expect(w.find('a.log-row').exists()).toBe(false)
    expect(w.find('.log-evo').text()).toBe('↑ évo')
    expect(w.text()).toContain('Évolué depuis Magicarpe')
  })

  it('compte les entrées au pluriel', () => {
    const w = mountSheet({ id: 25, entries: [pr('a', 25), pr('b', 25)] })
    expect(w.text()).toContain('2 entrées')
  })

  it('compte une entrée au singulier', () => {
    expect(mountSheet({ id: 25, entries: [pr('a', 25)] }).text()).toContain('1 entrée')
  })
})

describe('bonbons et évolution', () => {
  it('affiche la jauge avec le coût de l’espèce', () => {
    const w = mountSheet({ id: 1, entries: [pr('a', 1)], candies: 3 })
    expect(w.find('.candy-nums').text()).toContain('3')
    expect(w.find('.candy-nums').text()).toContain('8')
  })

  it('désactive le bouton quand les bonbons manquent', () => {
    const w = mountSheet({ id: 1, entries: [pr('a', 1)], candies: 3, canEvolve: false })
    expect(w.find('.evo-btn').attributes('disabled')).toBeDefined()
  })

  it('émet l’évolution demandée', async () => {
    const w = mountSheet({ id: 1, entries: [pr('a', 1)], candies: 9, canEvolve: true })
    await w.find('.evo-btn').trigger('click')
    expect(w.emitted('evolve')[0]).toEqual([{ from: 1, to: 2 }])
  })

  it('propose les trois évolutions d’Évoli', () => {
    const w = mountSheet({ id: 133, entries: [pr('a', 133)], candies: 9, canEvolve: true })
    const choices = w.findAll('.evo-choice')
    expect(choices).toHaveLength(3)
    expect(w.text()).toContain('Aquali')
    expect(w.text()).toContain('Voltali')
    expect(w.text()).toContain('Pyroli')
  })

  it('émet le choix d’évolution d’Évoli', async () => {
    const w = mountSheet({ id: 133, entries: [pr('a', 133)], candies: 9, canEvolve: true })
    await w.findAll('.evo-choice')[1].trigger('click')
    expect(w.emitted('evolve')[0]).toEqual([{ from: 133, to: 135 }])
  })

  it('n’affiche aucune jauge pour une espèce terminale', () => {
    const w = mountSheet({ id: 143, entries: [pr('a', 143)], isDeadEnd: true })
    expect(w.find('.candy').exists()).toBe(false)
  })

  it('borne la jauge à 100 % au-delà du coût', () => {
    const w = mountSheet({ id: 1, entries: [pr('a', 1)], candies: 40, canEvolve: true })
    expect(w.find('.cbar-fill').attributes('style')).toContain('width: 100%')
  })
})

describe('la réserve', () => {
  it('présente les doublons d’une espèce sans évolution', () => {
    const w = mountSheet({ id: 143, entries: [pr('a', 143), pr('b', 143)], isDeadEnd: true })
    expect(w.find('.reserve').exists()).toBe(true)
    expect(w.find('.reserve-count').text()).toBe('2')
  })

  it('ne s’affiche pas pour une capture unique', () => {
    const w = mountSheet({ id: 143, entries: [pr('a', 143)], isDeadEnd: true })
    expect(w.find('.reserve').exists()).toBe(false)
  })

  it('plafonne la pile visuelle à douze', () => {
    const entries = Array.from({ length: 20 }, (_, i) => pr('s' + i, 143))
    const w = mountSheet({ id: 143, entries, isDeadEnd: true })
    expect(w.findAll('.press span')).toHaveLength(12)
    expect(w.find('.reserve-count').text()).toBe('20')
  })
})

describe('fermeture', () => {
  it('émet close au bouton', async () => {
    const w = mountSheet({ id: 1 })
    await w.find('.x').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('émet close au clic sur le fond', async () => {
    const w = mountSheet({ id: 1 })
    await w.find('.scrim').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})
