import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TheRail from './TheRail.vue'

const mountRail = (props = {}) =>
  mount(TheRail, { props: { caughtCount: 12, pendingCount: 0, ...props } })

describe('TheRail', () => {
  it('émet sync au clic sur le bouton de synchronisation', async () => {
    const w = mountRail()
    await w.find('.sync').trigger('click')
    expect(w.emitted('sync')).toHaveLength(1)
  })

  it('désactive le bouton de synchronisation pendant le chargement', () => {
    const w = mountRail({ syncing: true })
    expect(w.find('.sync').attributes('disabled')).toBeDefined()
  })

  it('n’est pas désactivé hors synchronisation', () => {
    const w = mountRail({ syncing: false })
    expect(w.find('.sync').attributes('disabled')).toBeUndefined()
  })
})
