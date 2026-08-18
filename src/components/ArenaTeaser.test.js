import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ArenaTeaser from './ArenaTeaser.vue'
import { FIRST_SEASON, arenaOpensAt } from '../../shared/arena-economy.js'

afterEach(() => vi.useRealTimers())

const teaser = () => mount(ArenaTeaser)

/**
 * Ce qu'on voit à la place de l'arène avant son ouverture. Il annonce plutôt qu'il n'excuse :
 * personne n'a envie de lire qu'une fonctionnalité n'est pas prête. L'attente sert à comprendre
 * le mode avant d'y entrer.
 */
describe('ArenaTeaser', () => {
  it('donne la date d’ouverture en toutes lettres', () => {
    expect(teaser().text()).toContain('1er septembre 2026')
  })

  it('compte les jours qui restent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 12))
    // Du 20 au 31 août : douze jours d'attente.
    expect(teaser().find('.arena-big').text()).toBe('12')
  })

  // La médaille de la première saison est le seul objet désirable qu'on puisse montrer d'avance.
  it('montre le badge de la première saison, sans lui coller de rang', () => {
    const w = teaser()
    expect(w.find('.teaser-badge .sbadge').attributes('aria-label')).toContain(FIRST_SEASON)
    expect(w.find('.sbadge-rang').exists()).toBe(false)
  })

  /**
   * Le crédit plafonne à cinq, donc le week-end n'en ajoute aucun : « chaque jour de la
   * semaine » était faux, et un joueur qui compte sur un crédit du dimanche serait déçu.
   */
  it('dit que les crédits tombent les jours ouvrés', () => {
    expect(teaser().text()).toContain('jour ouvré')
    expect(teaser().text()).not.toContain('jour de la semaine')
  })

  // Les règles qui surprennent le plus à l'usage sont celles qui doivent être connues d'avance.
  it('annonce les règles qui décident d’un duel', () => {
    const t = teaser().text()
    expect(t).toContain('5 %')
    expect(t).toContain('Écraser plus faible que soi ne fait pas progresser')
    expect(t).toContain('scellées')
  })

  // L'attente doit rester utile : ce qu'on accumule d'ici là servira.
  it('dit à quoi sert d’attendre', () => {
    expect(teaser().text()).toContain('Ceux que\n        tu accumules maintenant'.replace(/\s+/g, ' '))
  })

  it('se déduit de la première saison plutôt que d’une date écrite deux fois', () => {
    expect(arenaOpensAt().getMonth()).toBe(8)
    expect(arenaOpensAt().getDate()).toBe(1)
  })
})
