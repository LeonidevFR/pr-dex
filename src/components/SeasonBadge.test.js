import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SeasonBadge from './SeasonBadge.vue'

const badge = (props) => mount(SeasonBadge, { props: { season: '2026-S4', ...props } })

/**
 * Un badge dessiné plutôt qu'une image : les badges officiels s'épuisent au bout de six ans de
 * saisons, une forme dérivée du nom n'épuise rien et donne à la saison 12 un badge aussi
 * distinct qu'à la première.
 */
describe('SeasonBadge', () => {
  it('donne une forme différente à deux saisons différentes', () => {
    const a = badge({ season: '2026-S4' }).find('polygon').attributes('points')
    const b = badge({ season: '2026-S5' }).find('polygon').attributes('points')
    expect(a).not.toBe(b)
  })

  it('donne toujours la même à une même saison', () => {
    expect(badge({ season: '2027-S1' }).html()).toBe(badge({ season: '2027-S1' }).html())
  })

  // Ni médaille en deçà, ni soleil au-delà.
  it('reste entre cinq et huit branches, quelle que soit la saison', () => {
    for (let annee = 2026; annee < 2046; annee++) {
      for (let s = 1; s <= 6; s++) {
        const sommets = badge({ season: `${annee}-S${s}` }).find('polygon')
          .attributes('points').split(' ').length
        expect(sommets / 2).toBeGreaterThanOrEqual(5)
        expect(sommets / 2).toBeLessThanOrEqual(8)
      }
    }
  })

  it('distingue les trois marches par la couleur', () => {
    const couleurs = [1, 2, 3].map((rank) => badge({ rank }).find('polygon').attributes('fill'))
    expect(new Set(couleurs).size).toBe(3)
  })

  it('porte le rang en clair, pour ne pas dépendre de la couleur seule', () => {
    expect(badge({ rank: 2 }).find('text').text()).toBe('2')
  })

  it('se décrit aux lecteurs d’écran', () => {
    expect(badge({ rank: 3 }).attributes('aria-label')).toContain('saison 2026-S4')
    expect(badge({ rank: 3 }).attributes('aria-label')).toContain('rang 3')
  })
})
