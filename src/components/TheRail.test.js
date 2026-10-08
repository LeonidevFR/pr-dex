import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TheRail from './TheRail.vue'

const mountRail = (props = {}) =>
  mount(TheRail, { props: { caughtCount: 12, pendingCount: 0, ...props } })

describe('TheRail', () => {
  beforeEach(() => localStorage.clear())

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

  it('fait tourner le glyphe, pas tout le bouton — sinon la pastille d’erreur tournerait avec', () => {
    const w = mountRail({ syncing: true, syncError: 'offline' })
    expect(w.find('.sync').classes()).not.toContain('spinning')
    expect(w.find('.sync span.spinning').exists()).toBe(true)
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

  describe('onglets', () => {
    const tab = (w, label) => w.findAll('.rail-tab').find((t) => t.text() === label)

    it('propose les quatre vues dans une navigation', () => {
      const w = mountRail()
      expect(w.find('nav.rail-nav').exists()).toBe(true)
      expect(w.findAll('.rail-tab').map((t) => t.text()))
        .toEqual(['Collection', 'Arène', 'Leaderboard', 'Statistiques'])
    })

    /**
     * L'arène compte quatre lieux et n'occupe qu'un onglet : les poser à plat aurait porté le
     * rail à sept entrées dans une barre dessinée pour trois. L'onglet reste visible avant
     * l'ouverture du 1er décembre — il mène au teaser, qui est fait pour ça.
     */
    it('replie les quatre lieux de l’arène sous un seul onglet', async () => {
      const w = mountRail({ view: 'arena' })
      const arene = w.findAll('.rail-tab').find((t) => t.text() === 'Arène')
      expect(arene.classes()).toContain('active')
      await arene.trigger('click')
      expect(w.emitted('navigate').at(-1)).toEqual(['arena'])
    })

    it('marque l’onglet courant, pour l’œil et pour les lecteurs d’écran', () => {
      const w = mountRail({ view: 'team' })
      expect(tab(w, 'Leaderboard').classes()).toContain('active')
      expect(tab(w, 'Leaderboard').attributes('aria-current')).toBe('page')
      expect(tab(w, 'Collection').attributes('aria-current')).toBeUndefined()
    })

    it('émet navigate avec la vue cliquée', async () => {
      const w = mountRail()
      await tab(w, 'Statistiques').trigger('click')
      expect(w.emitted('navigate')[0]).toEqual(['stats'])
    })

    it('n’a plus ni filtre ni trophée', () => {
      const w = mountRail()
      expect(w.find('.filter-toggle').exists()).toBe(false)
      expect(w.find('.trophy').exists()).toBe(false)
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
      vi.advanceTimersByTime(60 * 1000)
      await w.vm.$nextTick()
      expect(w.find('.sync').attributes('disabled')).toBeUndefined()
      await w.find('.sync').trigger('click')
      expect(w.emitted('sync')).toHaveLength(2)
    })

    it('reste désactivé juste avant la fin du cooldown', async () => {
      const w = mountRail()
      await w.find('.sync').trigger('click')
      vi.advanceTimersByTime(60 * 1000 - 1)
      await w.vm.$nextTick()
      expect(w.find('.sync').attributes('disabled')).toBeDefined()
    })

    it('survit à un rechargement de page (recalculé depuis localStorage au montage)', async () => {
      const w1 = mountRail()
      await w1.find('.sync').trigger('click')
      w1.unmount()

      vi.advanceTimersByTime(30 * 1000) // encore dans le cooldown d'1 min
      const w2 = mountRail()
      await w2.vm.$nextTick()
      expect(w2.find('.sync').attributes('disabled')).toBeDefined()
      await w2.find('.sync').trigger('click')
      expect(w2.emitted('sync')).toBeUndefined()
    })

    it('réautorise après remontage une fois le cooldown écoulé', async () => {
      const w1 = mountRail()
      await w1.find('.sync').trigger('click')
      w1.unmount()

      vi.advanceTimersByTime(60 * 1000)
      const w2 = mountRail()
      expect(w2.find('.sync').attributes('disabled')).toBeUndefined()
    })
  })

  describe('vocabulaire', () => {
    it('invite à retourner les cartes en attente', () => {
      expect(mountRail({ pendingCount: 4 }).find('.claim-btn').text()).toBe('Retourner 4')
    })

    it('dit qu’il n’y a rien à retourner', () => {
      expect(mountRail({ pendingCount: 0 }).find('.claim-btn').text()).toBe('Rien à retourner')
    })
  })

  describe('thème', () => {
    it('propose de passer au clair depuis le sombre', () => {
      expect(mountRail({ theme: 'dark' }).find('.theme-toggle').attributes('aria-label')).toBe('Passer au thème clair')
    })

    it('propose de passer au sombre depuis le clair', () => {
      expect(mountRail({ theme: 'light' }).find('.theme-toggle').attributes('aria-label')).toBe('Passer au thème sombre')
    })

    it('émet toggle-theme au clic', async () => {
      const w = mountRail()
      await w.find('.theme-toggle').trigger('click')
      expect(w.emitted('toggle-theme')).toHaveLength(1)
    })
  })

  it('nomme le compteur « Pokédex »', () => {
    expect(mountRail({ caughtCount: 41 }).find('.progress').text()).toContain('Pokédex')
  })
})

/**
 * Des onglets et non plus des icônes : une icône dit « une action », un onglet dit « tu es
 * ici ». Avec un seul écran la nuance ne coûtait rien ; à cinq lieux, ne pas savoir où l'on se
 * trouve devient le problème principal.
 */

/**
 * Un jeu d'icônes tracé dans le projet plutôt qu'une bibliothèque : le build ne dépend d'aucun
 * CDN, et six symboles ne justifient pas les dizaines de kilo-octets d'un paquet.
 */

/**
 * La couleur du lieu doit se VOIR. Un premier essai la posait en voile à 9 % d'opacité :
 * présente dans le code, invisible à l'écran — et une couleur qu'on ne remarque pas ne sert à
 * rien. Elle porte désormais trois marques, dont deux que l'œil vise d'emblée.
 */

