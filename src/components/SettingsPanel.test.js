import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsPanel from './SettingsPanel.vue'

const GH = { provider: 'github', name: 'LeonidevFR' }
const SL = { provider: 'slack_oidc', name: 'Léonard Ploton' }
const mountPanel = (props = {}) =>
  mount(SettingsPanel, { props: { accountName: 'LeonidevFR', identities: [GH], manageable: true, ...props } })

describe('SettingsPanel', () => {
  /**
   * Cette phrase a menti deux fois. Elle disait d'abord les collections « isolées des autres
   * joueurs », avant que le classement n'existe. Elle a ensuite dit que les autres voyaient les
   * totaux « pas le détail de tes captures » — or `leaderboard_players` rend la liste complète
   * des captures ouvertes de chaque joueur : l'écran n'affiche que des totaux, la réponse du
   * serveur porte tout. Une promesse de confidentialité qu'un onglet réseau dément ne vaut rien.
   */
  it('dit ce que les autres joueurs voient de toi, sans rien promettre de faux', () => {
    const w = mountPanel()
    expect(w.text()).not.toContain('isolées des autres joueurs')
    expect(w.text()).not.toContain('pas le détail de tes captures')
    expect(w.text()).toContain('Considère ta collection comme visible de l’équipe.')
  })

  it('liste chaque compte lié avec son nom', () => {
    const rows = mountPanel({ identities: [GH, SL] }).findAll('.acct-row')
    expect(rows.map((r) => r.text())).toEqual([
      expect.stringContaining('LeonidevFR'),
      expect.stringContaining('Léonard Ploton'),
    ])
    expect(rows[0].text()).toContain('GitHub')
    expect(rows[1].text()).toContain('Slack')
  })

  it.each([
    [[GH], '.link-slack', 'slack_oidc'],
    [[SL], '.link-github', 'github'],
  ])('propose de lier le compte absent', async (identities, selector, provider) => {
    const w = mountPanel({ identities })
    await w.find(selector).trigger('click')
    expect(w.emitted('link')).toEqual([[provider]])
  })

  it('ne propose pas de délier le seul compte', () => {
    expect(mountPanel({ identities: [GH] }).find('.unlink').exists()).toBe(false)
  })

  it('demande une confirmation avant de délier', async () => {
    const w = mountPanel({ identities: [GH, SL] })
    const slackRow = w.findAll('.acct-row')[1]
    await slackRow.find('.unlink').trigger('click')
    expect(w.emitted('unlink')).toBeUndefined()
    expect(slackRow.find('.unlink').text()).toContain('Confirmer')
    await slackRow.find('.unlink').trigger('click')
    expect(w.emitted('unlink')).toEqual([['slack_oidc']])
  })

  it('ne propose ni liaison ni déliaison en démo', () => {
    const w = mountPanel({ accountName: 'démo', identities: [], manageable: false })
    expect(w.find('.link-slack').exists()).toBe(false)
    expect(w.find('.link-github').exists()).toBe(false)
    expect(w.text()).toContain('démo')
  })

  // Supabase renvoie le même code dans les deux cas ; seule la description les distingue.
  it('explique un compte Slack déjà relié à un autre profil', () => {
    const w = mountPanel({ accountError: { code: 'identity_already_exists', description: 'Identity is already linked to another user' } })
    expect(w.find('.banner.err').text()).toContain('déjà relié à un autre profil')
  })

  it('ne parle pas d’autre profil quand le compte est déjà relié à celui-ci', () => {
    const w = mountPanel({ accountError: { code: 'identity_already_exists', description: 'Identity is already linked' } })
    expect(w.text()).not.toContain('autre profil')
    expect(w.text()).toContain('déjà relié à ton compte')
  })

  it('affiche la cause brute pour toute autre erreur', () => {
    const w = mountPanel({ accountError: { code: 'access_denied', description: 'User cancelled' } })
    expect(w.find('.banner.err').text()).toContain('User cancelled')
  })
})
