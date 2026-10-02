import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsPanel from './SettingsPanel.vue'

describe('SettingsPanel', () => {
  // Depuis le classement, les autres joueurs voient tes totaux : le texte ne peut plus dire
  // que ta collection leur est invisible.
  it('dit ce que les autres joueurs voient de toi', () => {
    const w = mount(SettingsPanel, { props: { githubLogin: 'leo' } })
    expect(w.text()).not.toContain('isolées des autres joueurs')
    expect(w.text()).toContain('Les autres joueurs voient tes totaux dans le classement, pas le détail de tes PR.')
  })
})
