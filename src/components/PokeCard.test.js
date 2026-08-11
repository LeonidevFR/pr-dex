import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PokeCard from './PokeCard.vue'

const mountCard = (props = {}) =>
  mount(PokeCard, { props: { speciesId: 25, tier: 'u', ...props } })

describe('face avant', () => {
  it('porte le numéro de planche, le nom et le palier de l’espèce', () => {
    const w = mountCard({ speciesId: 6, tier: 'r' })
    expect(w.find('.pkc-no').text()).toContain('006')
    expect(w.find('.pkc-name').text()).toBe('Dracaufeu')
    expect(w.find('.pkc-tier').text()).toBe('Rare')
  })

  // Le palier se lit dans la matière du carton : c'est un attribut, pas une classe utilitaire,
  // pour que le CSS dérive fond, filet et balayage d'un seul sélecteur par palier.
  it('expose son palier au CSS', () => {
    for (const tier of ['c', 'u', 'r', 'l']) {
      expect(mountCard({ tier }).find('.pkc').attributes('data-tier')).toBe(tier)
    }
  })

  it('marque le chromatique, et lui seul', () => {
    expect(mountCard({ shiny: true }).find('.pkc').classes()).toContain('is-shiny')
    expect(mountCard({ shiny: false }).find('.pkc').classes()).not.toContain('is-shiny')
  })

  it('tire le sprite chromatique quand l’exemplaire l’est', () => {
    const normal = mountCard({ speciesId: 25, shiny: false }).find('.pkc-art img').attributes('src')
    const chromatique = mountCard({ speciesId: 25, shiny: true }).find('.pkc-art img').attributes('src')
    expect(normal).not.toContain('/shiny/')
    expect(chromatique).toContain('/shiny/')
  })

  // La scène est l'éclairage, pas la matière : c'est la même carte au tirage et au tiroir.
  it('porte la scène demandée, et le tiroir par défaut', () => {
    expect(mountCard().find('.pkc').classes()).toContain('scene-day')
    expect(mountCard({ scene: 'night' }).find('.pkc').classes()).toContain('scene-night')
  })

  // Le cachet de cire est un signe de rareté, pas un ornement systématique.
  it('ne scelle de cire que les paliers qui la méritent', () => {
    expect(mountCard({ tier: 'c' }).find('.pkc-wax').exists()).toBe(false)
    expect(mountCard({ tier: 'u' }).find('.pkc-wax').exists()).toBe(false)
    expect(mountCard({ tier: 'r' }).find('.pkc-wax').exists()).toBe(true)
    expect(mountCard({ tier: 'l' }).find('.pkc-wax').exists()).toBe(true)
  })
})

const provenance = {
  ref: 'moi/atlas#142 · a3f8c21',
  label: 'fix: race condition sur la file de synchronisation',
  date: '2026-02-03',
}

describe('dos', () => {
  it('porte la provenance de l’exemplaire', () => {
    const w = mountCard({ provenance })
    expect(w.find('.pkc-lab-ref').text()).toBe('moi/atlas#142 · a3f8c21')
    expect(w.find('.pkc-lab-title').text()).toBe('fix: race condition sur la file de synchronisation')
    expect(w.find('.pkc-lab-date').text()).toBe('2026-02-03')
  })

  // Une source peut n'avoir aucune référence courte à donner — le pli scellé gère déjà ce cas,
  // et le dos ne doit pas afficher une ligne vide à sa place.
  it('se passe de la ligne de référence quand la source n’en fournit pas', () => {
    const w = mountCard({ provenance: { ...provenance, ref: null } })
    expect(w.find('.pkc-lab-ref').exists()).toBe(false)
    expect(w.find('.pkc-lab-title').exists()).toBe(true)
  })

  // La fiche d'espèce montre une espèce, pas un exemplaire daté : elle n'a pas de dos.
  it('n’a pas de dos quand aucune provenance n’est donnée', () => {
    expect(mountCard().find('.pkc-back').exists()).toBe(false)
  })
})
