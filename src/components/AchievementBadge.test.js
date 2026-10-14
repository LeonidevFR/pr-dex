import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AchievementBadge from './AchievementBadge.vue'
import { BY_CODE } from '../lib/achievements.js'

describe('AchievementBadge', () => {
  it('un succès obtenu prend l’encre de son palier et son sprite en masque', () => {
    const w = mount(AchievementBadge, { props: { achievement: BY_CODE['deja-vu'] } })
    expect(w.classes()).toContain('ach-t-r')
    expect(w.find('.ach-sprite').attributes('style')).toContain('/132.png')
  })

  it('un palier chiffré porte son glyphe', () => {
    const w = mount(AchievementBadge, { props: { achievement: BY_CODE['species-100'] } })
    expect(w.find('.ach-glyph').text()).toBe('100')
  })

  it('un succès caché ne montre qu’un point d’interrogation, sans encre', () => {
    const w = mount(AchievementBadge, { props: { achievement: BY_CODE['deja-vu'], state: 'hidden' } })
    expect(w.text()).toBe('?')
    expect(w.find('.ach-sprite').exists()).toBe(false)
    expect(w.classes()).not.toContain('ach-t-r')
  })

  it('un palier en cours est en pointillés, sans encre', () => {
    const w = mount(AchievementBadge, { props: { achievement: BY_CODE['species-140'], state: 'todo' } })
    expect(w.classes()).toContain('ach-todo')
    expect(w.classes()).not.toContain('ach-t-l')
  })
})
