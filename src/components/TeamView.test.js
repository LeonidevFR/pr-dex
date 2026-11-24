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
    expect(w.find('[data-total="opened"]').text()).toContain('Cartes retournées')
    expect(w.find('[data-total="shiny"]').text()).toContain('1')
  })

  it('affiche dans la colonne Shiny les espèces shiny, évolutions comprises', async () => {
    const w = mountView(vi.fn().mockResolvedValue([
      { login: 'moi', avatar_url: null, is_me: true, catches: [c('a', 10, true)], evolutions: [{ species: 11, from: 10, date: '2026-09-02', fromKey: 'github:a' }] },
    ]))
    await flushPromises()
    const shinyCol = w.findAll('thead th').findIndex((th) => th.text() === 'Shiny')
    expect(w.findAll('tbody tr')[0].findAll('td')[shinyCol].text()).toBe('2')
    expect(w.find('[data-total="shiny"]').text()).toContain('2')
  })

  it('affiche le nombre de succès de chaque joueur, « — » avant la migration', async () => {
    const w = mountView(vi.fn().mockResolvedValue([{ ...ROWS[0], achievements: 12 }, ROWS[1]]))
    await flushPromises()
    const col = w.findAll('thead th').findIndex((th) => th.text() === 'Succès')
    expect(col).toBeGreaterThan(-1)
    expect(w.findAll('tbody tr').map((r) => r.findAll('td')[col].text())).toEqual(['12', '—'])
  })

  it('liste les espèces qui manquent à l’équipe', async () => {
    const w = mountView(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    const missing = w.find('[data-section="missing"]')
    expect(missing.text()).toContain('148')
    expect(missing.findAll('.missing-item')).toHaveLength(148)
    expect(missing.findAll('.missing-item')[0].text()).toContain('002')
    expect(missing.text()).not.toContain('Bulbizarre')
  })

  it('dit quand l’équipe a vu les 151', async () => {
    const all = Array.from({ length: 151 }, (_, i) => c(`x${i}`, i + 1))
    const w = mountView(vi.fn().mockResolvedValue([{ login: 'moi', avatar_url: null, is_me: true, catches: all, evolutions: [] }]))
    await flushPromises()
    expect(w.findAll('.missing-item')).toHaveLength(0)
    expect(w.find('[data-section="missing"]').text()).toContain('151')
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

  describe('tri et espèce', () => {
    const SPECIES_ROWS = [
      { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1), c('b', 4), c('c', 7)], evolutions: [] },
      { login: 'max', avatar_url: null, is_me: false, catches: [c('d', 133), c('e', 133), c('f', 133)], evolutions: [{ species: 134, from: 133, date: '2026-09-02', fromKey: 'github:d' }] },
      { login: 'moi', avatar_url: null, is_me: true, catches: [c('g', 133)], evolutions: [] },
    ]
    const logins = (w) => w.findAll('tbody tr:not(.board-detail):not(.board-none)').map((r) => r.find('.board-login').text())
    const ranks = (w) => w.findAll('tbody tr:not(.board-detail):not(.board-none)').map((r) => r.find('.board-rank').text())
    const pick = async (w, text) => {
      const input = w.find('.species-picker input')
      await input.setValue(text)
      await input.trigger('keydown', { key: 'Enter' })
    }

    it('trie au clic sur un en-tête, puis inverse au second clic', async () => {
      const w = mountView(vi.fn().mockResolvedValue(SPECIES_ROWS))
      await flushPromises()
      expect(logins(w)).toEqual(['lea', 'max', 'moi'])
      const cards = w.findAll('thead th').find((th) => th.text() === 'Cartes')
      await cards.find('button').trigger('click')
      expect(logins(w)).toEqual(['lea', 'max', 'moi']) // 3, 3, 1 : égalité départagée par le rang
      expect(cards.attributes('aria-sort')).toBe('descending')
      await cards.find('button').trigger('click')
      expect(logins(w)).toEqual(['moi', 'lea', 'max'])
      expect(ranks(w)).toEqual(['3', '1', '2'])
    })

    it('choisir une espèce ajoute sa colonne d’exemplaires en main et trie dessus', async () => {
      const w = mountView(vi.fn().mockResolvedValue(SPECIES_ROWS))
      await flushPromises()
      await pick(w, 'evoli')
      expect(w.find('th[data-col="pick"]').text()).toContain('Évoli')
      expect(logins(w)).toEqual(['max', 'moi', 'lea'])
      // max a 3 Évoli, dont un a évolué : 2 en main.
      expect(w.findAll('td[data-col="pick"]').map((td) => td.text())).toEqual(['2', '1', '0'])
      expect(ranks(w)).toEqual(['2', '3', '1'])
    })

    it('trouve une espèce par son numéro', async () => {
      const w = mountView(vi.fn().mockResolvedValue(SPECIES_ROWS))
      await flushPromises()
      await pick(w, '#133')
      expect(w.find('th[data-col="pick"]').text()).toContain('Évoli')
    })

    it('« Seulement ceux qui en ont » masque les joueurs à zéro', async () => {
      const w = mountView(vi.fn().mockResolvedValue(SPECIES_ROWS))
      await flushPromises()
      await pick(w, 'evoli')
      await w.find('.board-owners input').setValue(true)
      expect(logins(w)).toEqual(['max', 'moi'])
      await pick(w, 'mewtwo')
      expect(w.find('.board-none').text()).toContain('Personne n’a de Mewtwo en main.'.replace('’', "'"))
    })

    it('propose d’abord les noms qui commencent par la saisie', async () => {
      const w = mountView(vi.fn().mockResolvedValue(SPECIES_ROWS))
      await flushPromises()
      await w.find('.species-picker input').setValue('ev')
      expect(w.findAll('.species-picker-item')[0].text()).toContain('Évoli')
    })

    it('une espèce choisie fait passer Shiny dans le détail déplié', async () => {
      const w = mountView(vi.fn().mockResolvedValue(SPECIES_ROWS))
      await flushPromises()
      const shinyTh = () => w.findAll('thead th').find((th) => th.text() === 'Shiny')
      expect(shinyTh().classes()).not.toContain('secondary')
      await pick(w, 'evoli')
      expect(shinyTh().classes()).toContain('secondary')
      await w.findAll('tbody tr')[0].trigger('click')
      expect(w.find('.board-detail').text()).toContain('Shiny')
    })

    it('retirer l’espèce rend le classement et ses colonnes', async () => {
      const w = mountView(vi.fn().mockResolvedValue(SPECIES_ROWS))
      await flushPromises()
      await pick(w, 'evoli')
      await w.find('.board-pick-x').trigger('click')
      expect(w.find('[data-col="pick"]').exists()).toBe(false)
      expect(logins(w)).toEqual(['lea', 'max', 'moi'])
      expect(w.find('.board-owners').exists()).toBe(false)
    })
  })
})
