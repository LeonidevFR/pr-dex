import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AchievementToasts from './AchievementToasts.vue'

afterEach(() => vi.useRealTimers())

describe('AchievementToasts', () => {
  it('annonce le succès, son palier et combien l’ont', () => {
    const w = mount(AchievementToasts, { props: { toasts: [{ id: 1, code: 'on-top' }], counts: { 'on-top': 2 } } })
    expect(w.find('.ach-toast-kicker').text()).toBe('Succès débloqué')
    expect(w.find('.ach-toast-name').text()).toBe('Sur la tête')
    expect(w.find('.ach-toast-sub').text()).toBe('Commun · 2 joueurs l’ont')
  })

  it('empile plusieurs toasts', () => {
    const w = mount(AchievementToasts, { props: { toasts: [{ id: 1, code: 'on-top' }, { id: 2, code: 'deja-vu' }], counts: {} } })
    expect(w.findAll('.ach-toast')).toHaveLength(2)
  })

  it('se ferme au clic', async () => {
    const w = mount(AchievementToasts, { props: { toasts: [{ id: 7, code: 'on-top' }], counts: {} } })
    await w.find('.ach-toast').trigger('click')
    expect(w.emitted('dismiss')).toEqual([[7]])
  })

  it('se ferme seul après 5,9 s', async () => {
    vi.useFakeTimers()
    const w = mount(AchievementToasts, { props: { toasts: [{ id: 3, code: 'on-top' }], counts: {} } })
    vi.advanceTimersByTime(5800)
    expect(w.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(200)
    expect(w.emitted('dismiss')).toEqual([[3]])
  })
})
