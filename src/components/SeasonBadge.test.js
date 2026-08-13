import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SeasonBadge from './SeasonBadge.vue'
import { BADGES, badgeOf } from '../lib/badges.js'

const badge = (props) => mount(SeasonBadge, { props: { season: '2026-S4', ...props } })

/**
 * Les badges étaient dessinés par le programme — une étoile dérivée du nom de la saison. C'était
 * une solution au manque de médailles ; il n'y a plus de manque, et un vrai badge d'arène vaut
 * mieux qu'une forme tirée d'un hachage.
 */
describe('la roue des badges', () => {
  it('en tient huit, tous distincts', () => {
    expect(BADGES).toHaveLength(8)
    expect(new Set(BADGES.map((b) => b.body)).size).toBe(8)
  })

  it('donne un badge différent à deux saisons qui se suivent', () => {
    expect(badgeOf('2026-S4')).not.toBe(badgeOf('2026-S5'))
  })

  // Six saisons par an, huit badges : sans un index absolu, l'année suivante recevrait la même
  // suite de médailles et deux saisons voisines finiraient par se ressembler.
  it('ne recommence qu’au bout de huit saisons', () => {
    const suite = ['2026-S1', '2026-S2', '2026-S3', '2026-S4', '2026-S5', '2026-S6', '2027-S1', '2027-S2']
    expect(new Set(suite.map(badgeOf)).size).toBe(8)
    expect(badgeOf('2027-S3')).toBe(badgeOf('2026-S1'))
  })

  it('donne toujours le même à une même saison', () => {
    expect(badgeOf('2027-S1')).toBe(badgeOf('2027-S1'))
  })

  // Une saison mal formée viendrait d'une donnée abîmée : mieux vaut un badge que rien.
  it('ne rend jamais rien, même sur un nom illisible', () => {
    expect(badgeOf('nawak')).toBe(BADGES[0])
  })
})

describe('SeasonBadge', () => {
  it('dessine le badge de sa saison', () => {
    const svg = badge({ season: '2026-S4' }).find('svg')
    expect(svg.attributes('viewBox')).toBe(badgeOf('2026-S4').viewBox)
  })

  /**
   * Le rang est une pastille posée à côté, pas une teinte appliquée au dessin : les huit
   * médailles ont leurs couleurs propres, et les repeindre en or, argent et bronze ferait de
   * huit dessins distincts trois nuances de la même.
   */
  it('porte le rang à côté du badge, sans toucher à ses couleurs', () => {
    const un = badge({ rank: 1 })
    const trois = badge({ rank: 3 })
    expect(un.find('.sbadge-rang').text()).toBe('1er')
    expect(trois.find('.sbadge-rang').text()).toBe('3e')
    expect(un.find('svg').html()).toBe(trois.find('svg').html())
  })

  it('distingue les trois marches par la couleur de la pastille', () => {
    const couleurs = [1, 2, 3].map((rank) => badge({ rank }).attributes('style'))
    expect(new Set(couleurs).size).toBe(3)
  })

  it('se décrit aux lecteurs d’écran', () => {
    const etiquette = badge({ rank: 3 }).attributes('aria-label')
    expect(etiquette).toContain('saison 2026-S4')
    expect(etiquette).toContain('rang 3')
  })

  // Les huit badges partagent les noms de classes de la planche d'origine : sans préfixe, deux
  // badges affichés côte à côte se repeindraient l'un l'autre.
  it('isole les styles d’un badge à l’autre', () => {
    const classes = BADGES.map((b) => new Set(b.css.match(/\.b\d+-st\d+/g) ?? []))
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        expect([...classes[i]].some((c) => classes[j].has(c))).toBe(false)
      }
    }
  })
})
