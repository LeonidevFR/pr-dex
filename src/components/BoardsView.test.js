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
    expect(w.findAll('.sect-h').some((h) => h.text().startsWith('Collection'))).toBe(true)
    expect(w.findAll('.sect-h').some((h) => h.text().startsWith('Saison en cours'))).toBe(true)
  })

  /**
   * Avant le 1er décembre il n'y a qu'une mesure. La page ne fonctionne pas à vide pour autant :
   * le classement de la collection existe depuis juillet, et c'est lui qu'on vient voir.
   */
  it('n’en montre qu’un tant que l’arène est fermée', async () => {
    const w = monter({ arenaOpen: false })
    await flushPromises()
    expect(w.findAll('.board-table')).toHaveLength(1)
    expect(w.findAll('.sect-h').some((h) => h.text().startsWith('Collection'))).toBe(true)
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

  it('affiche dans la colonne Shiny les espèces shiny, évolutions comprises', async () => {
    const w = monter({}, vi.fn().mockResolvedValue([
      { login: 'moi', avatar_url: null, is_me: true, catches: [c('a', 10, true)], evolutions: [{ species: 11, from: 10, date: '2026-09-02', fromKey: 'github:a' }] },
    ]))
    await flushPromises()
    const shinyCol = w.findAll('thead th').findIndex((th) => th.text() === 'Shiny')
    expect(w.findAll('tbody tr')[0].findAll('td')[shinyCol].text()).toBe('2')
    expect(w.find('[data-total="shiny"]').text()).toContain('2')
  })

  it('liste les espèces de la planche qui manquent à l’équipe, sans la Gen 2', async () => {
    const w = monter()
    await flushPromises()
    const missing = w.find('[data-section="missing"]')
    expect(missing.text()).toContain('148')
    expect(missing.findAll('.missing-item')).toHaveLength(148)
    expect(missing.findAll('.missing-item')[0].text()).toContain('002')
    expect(missing.text()).not.toContain('Bulbizarre')
  })

  it('dit quand l’équipe a vu les 151, même sans aucune Gen 2', async () => {
    const all = Array.from({ length: 151 }, (_, i) => c(`x${i}`, i + 1))
    const w = monter({}, vi.fn().mockResolvedValue([{ login: 'moi', avatar_url: null, is_me: true, catches: all, evolutions: [] }]))
    await flushPromises()
    expect(w.findAll('.missing-item')).toHaveLength(0)
    expect(w.find('[data-section="missing"]').text()).toContain('151')
  })

  it('rappelle la saison close pendant une semaine', async () => {
    const lastSeason = {
      season: '2026-S3', podium: [{ user_id: 'u-b', rank: 2, prize: 500 }, { user_id: 'u-a', rank: 1, prize: 1000 }],
      board: [{ user_id: 'u-a', login: 'alice' }, { user_id: 'u-b', login: 'bob' }],
    }
    // 2026-S3 couvre juin et juillet : elle finit le 31 juillet.
    const w = monter({ lastSeason, today: '2026-08-03' })
    await flushPromises()
    expect(w.find('.season-banner').text()).toBe('2026-S3 terminée🥇 alice🥈 bob')
    const tard = monter({ lastSeason, today: '2026-08-12' })
    await flushPromises()
    expect(tard.find('.season-banner').exists()).toBe(false)
  })

  it('affiche le nombre de succès de chaque joueur, « — » si la base ne le donne pas', async () => {
    const w = monter({}, vi.fn().mockResolvedValue([{ ...ROWS[0], achievements: 12 }, ROWS[1]]))
    await flushPromises()
    const col = w.findAll('.board-table').at(0).findAll('thead th').findIndex((th) => th.text() === 'Succès')
    expect(col).toBeGreaterThan(-1)
    expect(w.findAll('.board-table').at(0).findAll('tbody tr').filter((r) => !r.classes('board-detail'))
      .map((r) => r.findAll('td')[col].text())).toEqual(['12', '—'])
  })
})

