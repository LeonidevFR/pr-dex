import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TeamBoard from './TeamBoard.vue'
import { rankPlayers } from '../lib/leaderboard.js'

const joueur = (rang, login, isMe = false) => ({
  rank: rang, login, avatarUrl: null, isMe,
  species: 3, shiny: 0, legendaries: 0, rares: 1, lineages: 0, copies: 3, recent: 3,
})
const JOUEURS = [joueur(1, 'lea'), joueur(2, 'moi', true)]

const monter = (props = {}) => mount(TeamBoard, { props: { players: JOUEURS, ...props } })

/**
 * Le tableau de la collection d'équipe, devenu un bloc : il occupait un écran entier avec son
 * titre et ses totaux, que la page des classements porte désormais.
 */
describe('TeamBoard', () => {
  it('classe les joueurs dans l’ordre reçu', () => {
    expect(monter().findAll('tbody tr').map((r) => r.find('.board-login').text())).toEqual(['lea', 'moi'])
  })

  it('marque la ligne du joueur courant', () => {
    const rows = monter().findAll('tbody tr')
    expect(rows[1].classes()).toContain('me')
    expect(rows[0].classes()).not.toContain('me')
  })

  it('attend pendant le chargement', () => {
    const w = monter({ players: [], loading: true })
    expect(w.find('.board-loading').exists()).toBe(true)
    expect(w.find('tbody').exists()).toBe(false)
  })

  // Le bloc ne lit rien lui-même : il demande à la page de réessayer.
  it('demande une nouvelle lecture au clic sur « Réessayer »', async () => {
    const w = monter({ players: [], error: 'Pas de connexion réseau.' })
    expect(w.find('.board-error').text()).toContain('Pas de connexion réseau.')
    await w.find('.board-error button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
  })

  it('dit quand personne n’a encore rien ouvert', () => {
    const w = monter({ players: [] })
    expect(w.find('.board-empty').exists()).toBe(true)
    expect(w.find('tbody').exists()).toBe(false)
  })

  it('déplie une ligne de détail avec libellés au clic, et la replie au second', async () => {
    const w = monter()
    expect(w.find('.board-detail').exists()).toBe(false)
    await w.findAll('tbody tr')[0].trigger('click')
    const detail = w.find('.board-detail')
    expect(detail.text()).toContain('Légendaires')
    expect(detail.text()).toContain('30 jours')
    await w.findAll('tbody tr')[0].trigger('click')
    expect(w.find('.board-detail').exists()).toBe(false)
  })

  // Repéré par le rang, pas par le login : deux comptes sans `user_name` s'appellent tous deux
  // « inconnu », et une clé en double dépliait les deux lignes à la fois.
  it('distingue deux joueurs au même login', async () => {
    const w = monter({ players: [joueur(1, 'inconnu'), joueur(2, 'inconnu')] })
    await w.findAll('tbody tr')[0].trigger('click')
    expect(w.findAll('.board-detail')).toHaveLength(1)
  })

  // Reporté de la #35 (tri du classement), écrite pour l'ancien TeamView.
  describe('tri et espèce', () => {
    const TODAY = '2026-09-30'
    const c = (id, species) => ({ source: 'github', external_id: id, species, shiny: false, date: '2026-09-01' })
    const LIGNES = [
      { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1), c('b', 4), c('c', 7)], evolutions: [] },
      { login: 'max', avatar_url: null, is_me: false, catches: [c('d', 133), c('e', 133), c('f', 133)], evolutions: [{ species: 134, from: 133, date: '2026-09-02', fromKey: 'github:d' }] },
      { login: 'moi', avatar_url: null, is_me: true, catches: [c('g', 133)], evolutions: [] },
    ]
    const monterClasse = () => mount(TeamBoard, { props: { players: rankPlayers(LIGNES, TODAY) } })
    const logins = (w) => w.findAll('tbody tr:not(.board-detail):not(.board-none)').map((r) => r.find('.board-login').text())
    const ranks = (w) => w.findAll('tbody tr:not(.board-detail):not(.board-none)').map((r) => r.find('.board-rank').text())
    const pick = async (w, text) => {
      const input = w.find('.species-picker input')
      await input.setValue(text)
      await input.trigger('keydown', { key: 'Enter' })
    }

    it('trie au clic sur un en-tête, puis inverse au second clic', async () => {
      const w = monterClasse()
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
      const w = monterClasse()
      await pick(w, 'evoli')
      expect(w.find('th[data-col="pick"]').text()).toContain('Évoli')
      expect(logins(w)).toEqual(['max', 'moi', 'lea'])
      // max a 3 Évoli, dont un a évolué : 2 en main.
      expect(w.findAll('td[data-col="pick"]').map((td) => td.text())).toEqual(['2', '1', '0'])
      expect(ranks(w)).toEqual(['2', '3', '1'])
    })

    it('trouve une espèce par son numéro', async () => {
      const w = monterClasse()
      await pick(w, '#133')
      expect(w.find('th[data-col="pick"]').text()).toContain('Évoli')
    })

    it('« Seulement ceux qui en ont » masque les joueurs à zéro', async () => {
      const w = monterClasse()
      await pick(w, 'evoli')
      await w.find('.board-owners input').setValue(true)
      expect(logins(w)).toEqual(['max', 'moi'])
      await pick(w, 'mewtwo')
      expect(w.find('.board-none').text()).toContain("Personne n'a de Mewtwo en main.")
    })

    it('propose d’abord les noms qui commencent par la saisie', async () => {
      const w = monterClasse()
      await w.find('.species-picker input').setValue('ev')
      expect(w.findAll('.species-picker-item')[0].text()).toContain('Évoli')
    })

    it('une espèce choisie fait passer Shiny dans le détail déplié', async () => {
      const w = monterClasse()
      const shinyTh = () => w.findAll('thead th').find((th) => th.text() === 'Shiny')
      expect(shinyTh().classes()).not.toContain('secondary')
      await pick(w, 'evoli')
      expect(shinyTh().classes()).toContain('secondary')
      await w.findAll('tbody tr')[0].trigger('click')
      expect(w.find('.board-detail').text()).toContain('Shiny')
    })

    it('retirer l’espèce rend le classement et ses colonnes', async () => {
      const w = monterClasse()
      await pick(w, 'evoli')
      await w.find('.board-pick-x').trigger('click')
      expect(w.find('[data-col="pick"]').exists()).toBe(false)
      expect(logins(w)).toEqual(['lea', 'max', 'moi'])
      expect(w.find('.board-owners').exists()).toBe(false)
    })
  })
})
