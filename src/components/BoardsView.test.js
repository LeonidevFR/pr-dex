import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BoardsView from './BoardsView.vue'
import { SupabaseDataError } from '../lib/supabaseData.js'

const TODAY = '2026-09-30'
const c = (id, species, shiny = false) => ({ source: 'github', external_id: id, species, shiny, date: '2026-09-01' })
const ROWS = [
  { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1), c('b', 4), c('d', 7)], evolutions: [] },
  { login: 'moi', avatar_url: 'me.png', is_me: true, catches: [c('e', 1, true)], evolutions: [] },
]

const MOI = 'u-moi'
const POINTS = [
  { user_id: 'u-marion', slug: 'marion-g', login: 'marion-g', points: 310, rank: 1 },
  { user_id: MOI, slug: 'leonard', login: 'leonard', points: 95, rank: 2 },
]

const monter = (props = {}, readLeaderboard = vi.fn().mockResolvedValue(ROWS)) => mount(BoardsView, {
  props: { client: { readLeaderboard }, today: TODAY, userId: MOI, ...props },
})

/**
 * Les deux classements sur un écran. Ils vivaient dans deux onglets — l'équipe d'un côté, la
 * saison de l'autre, celle-ci au second niveau sous « Arène » — alors qu'ils classent les MÊMES
 * personnes sur deux mesures : ce qu'on a collectionné, et ce qu'on a gagné en duel.
 */
describe('BoardsView', () => {
  it('montre les deux classements quand l’arène est ouverte', async () => {
    const w = monter({ leaderboard: POINTS, season: '2026-S6', arenaOpen: true })
    await flushPromises()
    expect(w.findAll('.board-table')).toHaveLength(2)
    expect(w.text()).toContain('La collection')
    expect(w.text()).toContain('Les points de la saison')
  })

  /**
   * Avant le 1er décembre il n'y a qu'une mesure. La page ne fonctionne pas à vide pour autant :
   * le classement de la collection existe depuis juillet, et c'est lui qu'on vient voir.
   */
  it('n’en montre qu’un tant que l’arène est fermée', async () => {
    const w = monter({ arenaOpen: false })
    await flushPromises()
    expect(w.findAll('.board-table')).toHaveLength(1)
    expect(w.text()).toContain('La collection')
    expect(w.text()).not.toContain('Les points de la saison')
  })

  it('affiche en tête les trois chiffres d’équipe', async () => {
    const w = monter()
    await flushPromises()
    expect(w.find('[data-total="collective"]').text()).toContain('3')
    expect(w.find('[data-total="opened"]').text()).toContain('4')
    expect(w.find('[data-total="opened"]').text()).toContain('Cartes retournées')
    expect(w.find('[data-total="shiny"]').text()).toContain('1')
  })

  // Une seule lecture pour les deux usages : les totaux de l'en-tête sortent des mêmes lignes
  // que le tableau, et deux blocs qui liraient chacun pour soi feraient deux requêtes.
  it('ne lit le classement qu’une fois pour l’en-tête et le tableau', async () => {
    const read = vi.fn().mockResolvedValue(ROWS)
    monter({}, read)
    await flushPromises()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('emmène à la fiche du joueur cliqué dans le classement de saison', async () => {
    const w = monter({ leaderboard: POINTS, season: '2026-S6', arenaOpen: true })
    await flushPromises()
    await w.findAll('.saison-voir')[0].trigger('click')
    expect(w.emitted('profile')[0]).toEqual(['marion-g'])
  })

  it('affiche l’erreur et réessaie au clic', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new SupabaseDataError('offline', 'Pas de connexion réseau.'))
      .mockResolvedValueOnce(ROWS)
    const w = monter({}, read)
    await flushPromises()
    expect(w.find('.board-error').text()).toContain('Pas de connexion réseau.')
    await w.find('.board-error button').trigger('click')
    await flushPromises()
    expect(w.find('.board-error').exists()).toBe(false)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
