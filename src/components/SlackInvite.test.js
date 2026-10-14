import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SlackInvite from './SlackInvite.vue'

describe('SlackInvite', () => {
  it('invite à lier Slack pour les boosters de monkey-testing', () => {
    expect(mount(SlackInvite).text()).toContain('monkey-testing')
  })
  it('émet link au clic sur le bouton', async () => {
    const w = mount(SlackInvite)
    await w.find('.link-slack').trigger('click')
    expect(w.emitted('link')).toBeTruthy()
  })
  it('émet dismiss à la fermeture', async () => {
    const w = mount(SlackInvite)
    await w.find('[aria-label="Fermer le bandeau"]').trigger('click')
    expect(w.emitted('dismiss')).toBeTruthy()
  })
})
