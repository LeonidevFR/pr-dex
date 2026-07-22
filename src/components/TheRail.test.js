import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  describe('erreur de sync', () => {
    it('n’affiche aucun badge sans erreur', () => {
      const w = mountRail()
      expect(w.find('.err-dot').exists()).toBe(false)
    })

    it('affiche un badge et un message adapté à l’erreur', () => {
      const w = mountRail({ syncError: 'offline' })
      expect(w.find('.err-dot').exists()).toBe(true)
      expect(w.find('.sync').attributes('title')).toContain('Hors ligne')
    })

    it('retombe sur un message générique pour un kind inconnu', () => {
      const w = mountRail({ syncError: 'mystere' })
      expect(w.find('.sync').attributes('title')).toBe('La synchronisation a échoué.')
    })

    it('affiche un message d’attente explicite pendant la synchronisation', () => {
      const w = mountRail({ syncing: true })
      expect(w.find('.sync').attributes('title')).toContain('en cours')
    })
  })

  describe('bouton de filtre', () => {
    it('émet toggle-filters au clic', async () => {
      const w = mountRail()
      await w.find('.filter-toggle').trigger('click')
      expect(w.emitted('toggle-filters')).toHaveLength(1)
    })

    it('porte une vraie icône (svg), pas un glyphe texte', () => {
      const w = mountRail()
      expect(w.find('.filter-toggle svg').exists()).toBe(true)
    })

    it('se marque actif quand le panneau est ouvert', () => {
      const w = mountRail({ filtersOpen: true })
      expect(w.find('.filter-toggle').classes()).toContain('active')
    })

    it('se marque actif quand un filtre est posé, même panneau fermé', () => {
      const w = mountRail({ filtersOpen: false, filtersActive: true })
      expect(w.find('.filter-toggle').classes()).toContain('active')
    })

    it('n’est pas actif sans filtre ni panneau ouvert', () => {
      const w = mountRail()
      expect(w.find('.filter-toggle').classes()).not.toContain('active')
    })
  })

  describe('anti-spam', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('ignore les clics répétés pendant le cooldown', async () => {
      const w = mountRail()
      await w.find('.sync').trigger('click')
      await w.find('.sync').trigger('click')
      await w.find('.sync').trigger('click')
      expect(w.emitted('sync')).toHaveLength(1)
    })

    it('désactive le bouton pendant le cooldown, même si syncing redevient false', async () => {
      const w = mountRail()
      await w.find('.sync').trigger('click')
      expect(w.find('.sync').attributes('disabled')).toBeDefined()
    })

    it('réautorise un clic une fois le cooldown écoulé', async () => {
      const w = mountRail()
      await w.find('.sync').trigger('click')
      vi.advanceTimersByTime(5 * 60 * 1000)
      await w.vm.$nextTick()
      expect(w.find('.sync').attributes('disabled')).toBeUndefined()
      await w.find('.sync').trigger('click')
      expect(w.emitted('sync')).toHaveLength(2)
    })

    it('reste désactivé juste avant la fin du cooldown', async () => {
      const w = mountRail()
      await w.find('.sync').trigger('click')
      vi.advanceTimersByTime(5 * 60 * 1000 - 1)
      await w.vm.$nextTick()
      expect(w.find('.sync').attributes('disabled')).toBeDefined()
    })
  })
})
