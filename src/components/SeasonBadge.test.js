import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SeasonBadge from './SeasonBadge.vue'
import { BADGES, badgeOf, VIEWBOX } from '../lib/badges.js'

const badge = (props) => mount(SeasonBadge, { props: { season: '2026-S4', ...props } })

/**
 * Les badges ont eu trois vies. Une étoile dérivée du nom de la saison, d'abord — une forme
 * tirée d'un hachage, qui ne valait pas une médaille. Puis les badges de Kanto, découpés d'une
 * planche tierce : des couleurs bonbon qui ne tenaient dans aucun des deux thèmes, une
 * attribution à porter, et trente-cinq classes CSS identiques par badge. Ceux-ci sont dessinés
 * pour ce dex, et c'est la SILHOUETTE qui les distingue — on reconnaît le sien à sa découpe
 * avant sa couleur.
 */
describe('la roue des badges', () => {
  it('en tient huit, tous distincts', () => {
    expect(BADGES).toHaveLength(8)
    expect(new Set(BADGES.map((b) => b.body)).size).toBe(8)
  })

  // La découpe avant la couleur : deux médailles de même contour ne se distingueraient plus
  // une fois posées en vignette de 22 px dans l'étagère des podiums.
  it('donne à chacun sa propre silhouette et sa propre teinte', () => {
    expect(new Set(BADGES.map((b) => b.contour)).size).toBe(8)
    expect(new Set(BADGES.map((b) => b.plaque)).size).toBe(8)
  })

  // Chaque médaille porte une mécanique du jeu : une étagère pleine raconte la partie.
  it('nomme chaque badge et ce qu’il représente', () => {
    expect(BADGES.every((b) => b.nom && b.mecanique)).toBe(true)
    expect(new Set(BADGES.map((b) => b.nom)).size).toBe(8)
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
    expect(svg.attributes('viewBox')).toBe(VIEWBOX)
    expect(svg.html()).toContain(badgeOf('2026-S4').contour)
  })

  /**
   * Le rang ne touche jamais au dessin : les huit médailles ont leurs couleurs propres, et les
   * repeindre en or, argent et bronze ferait de huit dessins distincts trois nuances de la même.
   * Il est écrit sous la médaille, par l'étagère qui la pose.
   *
   * Il a été une pastille posée dessus. Elle est partie pour deux raisons mesurées : son texte
   * plafonnait à 2,32:1 — du crème sur l'or — là où du gras de 9 px demande plus que 4,5 ; et
   * même corrigée, elle mangeait la silhouette et débordait du conteneur à la taille d'une
   * étagère.
   */
  it('ne touche pas au dessin selon le rang', () => {
    expect(badge({ rank: 1 }).find('svg').html()).toBe(badge({ rank: 3 }).find('svg').html())
  })

  it('ne pose plus de pastille sur la médaille', () => {
    expect(badge({ rank: 1 }).find('.sbadge-rang').exists()).toBe(false)
  })

  // Le rang reste annoncé aux lecteurs d'écran : c'est la seule place où il voyage avec l'image.
  it('garde le rang dans son étiquette', () => {
    expect(badge({ rank: 2 }).attributes('aria-label')).toContain('rang 2')
  })

  it('se décrit aux lecteurs d’écran', () => {
    const etiquette = badge({ rank: 3 }).attributes('aria-label')
    expect(etiquette).toContain('saison 2026-S4')
    expect(etiquette).toContain('rang 3')
  })

  /**
   * Aucune couleur dans le dessin : le métal passe par des variables, que le composant pose sur
   * l'élément. C'est ce qui permet à deux badges de cohabiter sans se repeindre — la planche
   * d'origine réglait le même problème en préfixant trente-cinq classes à la main, par badge.
   */
  it('ne met aucune couleur dans le dessin', () => {
    for (const b of BADGES) {
      expect(b.body).not.toMatch(/#[0-9a-f]{3,6}/i)
      expect(b.body).not.toMatch(/fill="(?!none)[a-z]/i)
    }
  })

  it('pose le métal du badge sur l’élément', () => {
    const style = badge({ season: '2026-S4' }).attributes('style')
    const b = badgeOf('2026-S4')
    expect(style).toContain(b.plaque)
    expect(style).toContain(b.biseau)
  })

  // Le nom de la médaille se dit aux lecteurs d'écran : « badge Éclat » porte ce qu'on a gagné,
  // là où « badge de la saison 2026-S4 » ne nomme qu'une date.
  it('nomme la médaille aux lecteurs d’écran', () => {
    expect(badge({ season: '2026-S4' }).attributes('aria-label'))
      .toContain(badgeOf('2026-S4').nom)
  })
})
