import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TeamView from './TeamView.vue'
import { SupabaseDataError } from '../lib/supabaseData.js'

const TODAY = '2026-09-30'
const c = (id, species, shiny = false) => ({ source: 'github', external_id: id, species, shiny, date: '2026-09-01' })
const ROWS = [
  { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1), c('b', 4), c('d', 7)], evolutions: [] },
  { login: 'moi', avatar_url: 'me.png', is_me: true, catches: [c('e', 1, true)], evolutions: [] },
]

const mountView = (readLeaderboard) =>
  mount(TeamView, { props: { client: { readLeaderboard }, today: TODAY } })

describe('TeamView', () => {
  it('affiche le chargement puis le classement', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    expect(w.find('.board-loading').exists()).toBe(true)
    await flushPromises()
    expect(w.find('.board-loading').exists()).toBe(false)
    expect(w.findAll('tbody tr').map((r) => r.find('.board-login').text())).toEqual(['lea', 'moi'])
  })

  it('affiche en tête les trois chiffres d’équipe', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    expect(w.find('[data-total="collective"]').text()).toContain('3')
    expect(w.find('[data-total="opened"]').text()).toContain('4')
    expect(w.find('[data-total="shiny"]').text()).toContain('1')
  })

  it('marque la ligne du joueur courant', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    const rows = w.findAll('tbody tr')
    expect(rows[1].classes()).toContain('me')
    expect(rows[0].classes()).not.toContain('me')
  })

  it('affiche l’erreur et réessaie au clic', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new SupabaseDataError('offline', 'Pas de connexion réseau.'))
      .mockResolvedValueOnce(ROWS)
    const w = mountView(read)
    await flushPromises()
    expect(w.find('.board-error').text()).toContain('Pas de connexion réseau.')
    await w.find('.board-error button').trigger('click')
    await flushPromises()
    expect(w.find('.board-error').exists()).toBe(false)
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('dit quand personne n’a encore rien ouvert', async () => {
    const w = mountView(vi.fn().mockResolvedValue([]))
    await flushPromises()
    expect(w.find('.board-empty').exists()).toBe(true)
    expect(w.find('tbody').exists()).toBe(false)
  })

  it('déplie une ligne de détail avec libellés au clic sur un joueur, et la replie au second clic', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    expect(w.find('.board-detail').exists()).toBe(false)
    await w.findAll('tbody tr')[0].trigger('click')
    const detail = w.find('.board-detail')
    expect(detail.text()).toContain('Légendaires')
    expect(detail.text()).toContain('30 jours')
    await w.findAll('tbody tr')[0].trigger('click')
    expect(w.find('.board-detail').exists()).toBe(false)
  })

  it('distingue deux joueurs au même login', async () => {
    const w = mountView(vi.fn().mockResolvedValue([
      { ...ROWS[0], login: 'inconnu' }, { ...ROWS[1], login: 'inconnu' },
    ]))
    await flushPromises()
    await w.findAll('tbody tr')[0].trigger('click')
    expect(w.findAll('.board-detail')).toHaveLength(1)
  })
})
