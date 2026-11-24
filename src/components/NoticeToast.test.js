import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import NoticeToast from './NoticeToast.vue'

afterEach(() => vi.useRealTimers())

describe('NoticeToast', () => {
  it('n’affiche rien sans message', () => {
    expect(mount(NoticeToast).find('.notice-toast').exists()).toBe(false)
  })

  it('annonce une bonne nouvelle comme un statut et un refus comme une alerte', async () => {
    const w = mount(NoticeToast, { props: { message: '2 exemplaires vendus, 130 ₽ en caisse.', good: true } })
    expect(w.find('.notice-toast').classes()).toContain('bonne')
    expect(w.find('.notice-toast').attributes('role')).toBe('status')
    await w.setProps({ message: 'Aucun crédit cette semaine.', good: false })
    expect(w.find('.notice-toast').attributes('role')).toBe('alert')
  })

  it('s’efface seul : vite pour une bonne nouvelle, plus tard pour un refus', async () => {
    vi.useFakeTimers()
    const w = mount(NoticeToast, { props: { message: 'Vendu.', good: true } })
    vi.advanceTimersByTime(4999)
    expect(w.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(w.emitted('dismiss')).toHaveLength(1)

    await w.setProps({ message: 'Refusé.', good: false })
    vi.advanceTimersByTime(9999)
    expect(w.emitted('dismiss')).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(w.emitted('dismiss')).toHaveLength(2)
  })

  it('se ferme à la croix', async () => {
    const w = mount(NoticeToast, { props: { message: 'Refusé.' } })
    await w.find('.toast-x').trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
  })
})
