import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StatsView from './StatsView.vue'

const TODAY = '2026-09-30'
const c = (id, species, shiny = false) => ({ source: 'github', external_id: id, species, shiny, date: '2026-09-01' })
const ROWS = [
  { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1), c('b', 4), c('d', 7)], evolutions: [] },
  { login: 'moi', avatar_url: 'me.png', is_me: true, catches: [c('e', 1, true)], evolutions: [] },
]
const mountView = (readLeaderboard) => mount(StatsView, { props: { client: { readLeaderboard }, today: TODAY } })

describe('StatsView', () => {
  it('montre les stats du joueur courant seulement', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    expect(w.find('[data-stat="opened"] .stat-value').text()).toBe('1')
    expect(w.find('[data-stat="shiny"] .stat-value').text()).toContain('1 sur 1')
    expect(w.find('[data-stat="species"] .stat-value').text()).toBe('1 / 151')
    expect(w.text()).not.toContain('Théorie')
  })

  it('invite à retourner une carte quand le joueur n’a aucune ligne', async () => {
    const w = mountView(vi.fn().mockResolvedValue([ROWS[0]]))
    await flushPromises()
    expect(w.find('.board-empty').text()).toContain('Retourne une carte')
    expect(w.find('[data-stat="opened"]').exists()).toBe(false)
  })

  it('affiche l’erreur et réessaie', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(ROWS)
    const w = mountView(read)
    await flushPromises()
    expect(w.find('.board-error').text()).toContain('boom')
    await w.find('.board-error button').trigger('click')
    await flushPromises()
    expect(w.find('[data-stat="opened"]').exists()).toBe(true)
  })
})
