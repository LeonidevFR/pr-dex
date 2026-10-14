import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsPanel from './SettingsPanel.vue'

const mountPanel = (props = {}) => mount(SettingsPanel, { props: { accountName: 'leo', ...props } })

describe('SettingsPanel', () => {
  // Depuis le classement, les autres joueurs voient tes totaux : le texte ne peut plus dire
  // que ta collection leur est invisible.
  it('dit ce que les autres joueurs voient de toi', () => {
    const w = mountPanel()
    expect(w.text()).not.toContain('isolées des autres joueurs')
    expect(w.text()).toContain('Les autres joueurs voient tes totaux dans le classement, pas le détail de tes PR.')
  })

  it.each([
    [['github'], 'Connecté avec GitHub'],
    [['slack_oidc'], 'Connecté avec Slack'],
    [['github', 'slack_oidc'], 'Connecté avec GitHub et Slack'],
  ])('nomme les comptes liés (%j)', (providers, expected) => {
    expect(mountPanel({ providers }).text()).toContain(expected)
  })

  it('propose de lier Slack quand c’est possible, et émet link-slack', async () => {
    const w = mountPanel({ providers: ['github'], canLinkSlack: true })
    await w.find('.link-slack').trigger('click')
    expect(w.emitted('link-slack')).toBeTruthy()
  })

  it('ne propose pas de lier Slack sinon', () => {
    expect(mountPanel({ providers: ['github'] }).find('.link-slack').exists()).toBe(false)
  })

  // Supabase renvoie le même code dans les deux cas ; seule la description les distingue.
  it('explique un compte Slack déjà relié à un autre profil', () => {
    const w = mountPanel({ linkError: { code: 'identity_already_exists', description: 'Identity is already linked to another user' } })
    expect(w.find('.banner.err').text()).toContain('déjà relié à un autre profil')
  })

  it('ne parle pas d’autre profil quand Slack est déjà relié à ce compte', () => {
    const w = mountPanel({ linkError: { code: 'identity_already_exists', description: 'Identity is already linked' } })
    expect(w.text()).not.toContain('autre profil')
    expect(w.text()).toContain('déjà relié à ton compte')
  })

  it('affiche la cause brute pour toute autre erreur de liaison', () => {
    const w = mountPanel({ linkError: { code: 'access_denied', description: 'User cancelled' } })
    expect(w.find('.banner.err').text()).toContain('User cancelled')
  })
})
