import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MeView from './MeView.vue'
import { SupabaseDataError } from '../lib/supabaseData.js'

const TODAY = '2026-09-30'
const c = (id, species, shiny = false) => ({ source: 'github', external_id: id, species, shiny, date: '2026-09-01' })
const ROWS = [
  { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1)], evolutions: [] },
  { login: 'moi', avatar_url: null, is_me: true, catches: [c('e', 1, true), c('f', 4)], evolutions: [] },
]
const MOI = 'u-moi'
const PRIVE = { copies: 58, pokedollars: 14000, credits: 5, destroyed: 2, sold: 3, soldTotal: 120 }
const FICHE = { user_id: MOI, login: 'leonard', species: 44, wins: 7, losses: 2 }
const SAISONS = [{ season: '2026-S3', first_id: 'u-marion', second_id: MOI, third_id: null }]

const monter = (props = {}, read = vi.fn().mockResolvedValue(ROWS)) => mount(MeView, {
  props: {
    client: { readLeaderboard: read }, today: TODAY, userId: MOI,
    prive: PRIVE, fiche: FICHE, seasons: SAISONS, points: 95, rank: 2,
    season: '2026-S6', arenaOpen: true, ...props,
  },
})

/**
 * Tout ce qui parle de soi, sur un écran. Il y en avait deux — « Statistiques » pour la
 * collection, « Fiche » pour l'arène — chacune montrant une moitié de la même personne, dans
 * deux quartiers différents. L'étagère y était même dessinée deux fois.
 */
describe('MeView', () => {
  it('montre les statistiques de collection du joueur courant seulement', async () => {
    const w = monter()
    await flushPromises()
    expect(w.find('[data-stat="opened"]').text()).toContain('2')
    expect(w.find('[data-stat="shiny"]').text()).toContain('1 carte')
  })

  // Chez soi, rien n'est caviardé : c'est toute la différence avec la fiche d'un collègue.
  it('montre son arène sans rien barrer', async () => {
    const w = monter()
    await flushPromises()
    const cases = w.findAll('.prof-case')
    expect(cases.some((d) => d.text().includes('14000 ₽'))).toBe(true)
    expect(cases.some((d) => d.text().includes('Revendus · 120 ₽'))).toBe(true)
    expect(w.findAll('.prof-case.secret')).toHaveLength(0)
    expect(w.text()).not.toContain('—')
  })

  it('porte ses points et son rang en tête', async () => {
    const w = monter()
    await flushPromises()
    expect(w.find('.view-totals').text()).toContain('95')
    expect(w.find('.view-totals').text()).toContain('2')
  })

  it('dresse l’étagère une seule fois', async () => {
    const w = monter()
    await flushPromises()
    expect(w.findAll('.saison-etagere')).toHaveLength(1)
  })

  /**
   * Avant le 1er décembre il n'y a ni caisse, ni crédits, ni duels : la page se réduit à sa
   * moitié collection plutôt que d'aligner des zéros qu'on ne peut pas faire bouger.
   */
  it('se réduit à la collection tant que l’arène est fermée', async () => {
    const w = monter({ arenaOpen: false })
    await flushPromises()
    expect(w.find('[data-stat="species"]').exists()).toBe(true)
    expect(w.findAll('.prof-case')).toHaveLength(0)
    expect(w.find('.saison-prix').exists()).toBe(false)
    expect(w.find('.view-totals').exists()).toBe(false)
  })

  it('invite à retourner une carte quand le joueur n’a aucune ligne', async () => {
    const w = monter({ arenaOpen: false }, vi.fn().mockResolvedValue([ROWS[0]]))
    await flushPromises()
    expect(w.find('.board-empty').text()).toContain('Retourne une carte')
  })

  it('affiche l’erreur et réessaie', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new SupabaseDataError('offline', 'Pas de connexion réseau.'))
      .mockResolvedValueOnce(ROWS)
    const w = monter({ arenaOpen: false }, read)
    await flushPromises()
    expect(w.find('.board-error').text()).toContain('Pas de connexion réseau.')
    await w.find('.board-error button').trigger('click')
    await flushPromises()
    expect(w.find('.board-error').exists()).toBe(false)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
