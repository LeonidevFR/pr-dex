import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TeamBoard from './TeamBoard.vue'

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
})
