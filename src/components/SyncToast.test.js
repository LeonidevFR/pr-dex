import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SyncToast from './SyncToast.vue'

const mountToast = (sync) => mount(SyncToast, { props: { sync } })

afterEach(() => vi.useRealTimers())

describe('SyncToast', () => {
  it('ne montre rien sans recherche en cours', () => {
    expect(mountToast(null).find('.sync-toast').exists()).toBe(false)
  })

  // Le joueur rechargeait la page en boucle, ce qui coupait justement l'attente.
  it.each([
    [{ phase: 'waiting' }, 'En attente de GitHub'],
    [{ phase: 'running' }, 'On cherche tes nouvelles cartes'],
  ])('dit pendant l’attente que tout arrive seul (%j)', (sync, title) => {
    const text = mountToast(sync).find('.sync-toast').text()
    expect(text).toContain(title)
    expect(text).toContain('Inutile de recharger la page')
  })

  it.each([
    [1, '1 nouvelle carte'],
    [3, '3 nouvelles cartes'],
  ])('annonce les cartes trouvées (%i)', (count, label) => {
    expect(mountToast({ phase: 'found', count }).text()).toContain(label)
  })

  it('ouvre le rituel depuis l’annonce', async () => {
    const w = mountToast({ phase: 'found', count: 2 })
    await w.find('.sync-open').trigger('click')
    expect(w.emitted('open')).toBeTruthy()
  })

  it('signale un échec', () => {
    expect(mountToast({ phase: 'failed' }).text()).toContain('La recherche a échoué')
  })

  it('se ferme à la croix', async () => {
    const w = mountToast({ phase: 'failed' })
    await w.find('[aria-label="Fermer"]').trigger('click')
    expect(w.emitted('dismiss')).toBeTruthy()
  })

  it('disparaît seul quelques secondes après le résultat', async () => {
    vi.useFakeTimers()
    const w = mountToast({ phase: 'running' })
    await w.setProps({ sync: { phase: 'found', count: 2 } })
    vi.advanceTimersByTime(8000)
    expect(w.emitted('dismiss')).toBeTruthy()
  })

  it('ne se ferme pas seul pendant l’attente', () => {
    vi.useFakeTimers()
    const w = mountToast({ phase: 'running' })
    vi.advanceTimersByTime(60000)
    expect(w.emitted('dismiss')).toBeUndefined()
  })

  it('annonce les changements aux lecteurs d’écran', () => {
    expect(mountToast({ phase: 'running' }).find('.sync-toast').attributes('aria-live')).toBe('polite')
  })
})
