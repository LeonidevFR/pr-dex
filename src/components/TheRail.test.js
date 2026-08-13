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
})

/**
 * Des onglets et non plus des icônes : une icône dit « une action », un onglet dit « tu es
 * ici ». Avec un seul écran la nuance ne coûtait rien ; à cinq lieux, ne pas savoir où l'on se
 * trouve devient le problème principal.
 */
describe('les onglets', () => {
  const onglet = (w, libelle) => w.findAll('.tab').find((t) => t.text().includes(libelle))

  it('offre les cinq lieux', () => {
    const w = mountRail()
    for (const l of ['Planche', 'Arène', 'Saison', 'Boutique', 'Profil']) {
      expect(onglet(w, l), l).toBeDefined()
    }
  })

  it('demande la navigation par le nom du lieu, pas par un émetteur par écran', async () => {
    const w = mountRail()
    await onglet(w, 'Boutique').trigger('click')
    expect(w.emitted('go')[0]).toEqual(['shop'])
  })

  it('marque le lieu courant, et lui seul', () => {
    const w = mountRail({ place: 'season' })
    const actifs = w.findAll('.tab[aria-current="page"]')
    expect(actifs).toHaveLength(1)
    expect(actifs[0].text()).toContain('Saison')
  })

  // Un pli en attente doit se voir depuis n'importe quel lieu, sans quoi on l'oublie en jouant
  // ailleurs : la pastille reste sur l'onglet de la planche, où l'ouverture se fait.
  it('porte la pastille des plis sur l’onglet de la planche', () => {
    const w = mountRail({ pendingCount: 3 })
    expect(onglet(w, 'Planche').find('.pip').text()).toBe('3')
    expect(onglet(w, 'Arène').find('.pip').exists()).toBe(false)
  })

  /**
   * La progression et l'ouverture appartiennent à la planche : les afficher au-dessus de la
   * boutique ou du classement, c'est proposer un geste sans rapport avec l'écran regardé.
   */
  it('ne montre la progression et l’ouverture que sur la planche', () => {
    expect(mountRail({ place: 'collection' }).find('.rail-bas').exists()).toBe(true)
    expect(mountRail({ place: 'shop' }).find('.rail-bas').exists()).toBe(false)
    expect(mountRail({ place: 'shop' }).find('.claim-btn').exists()).toBe(false)
  })
})

/**
 * Un jeu d'icônes tracé dans le projet plutôt qu'une bibliothèque : le build ne dépend d'aucun
 * CDN, et six symboles ne justifient pas les dizaines de kilo-octets d'un paquet.
 */
describe('icônes du rail', () => {
  it('donne à chaque outil son icône, et un intitulé aux lecteurs d’écran', () => {
    const w = mountRail()
    for (const titre of ['Réglages', 'Filtrer la grille']) {
      const b = w.findAll('button').find((x) => x.attributes('title') === titre)
      expect(b, titre).toBeDefined()
      expect(b.find('svg').exists()).toBe(true)
    }
  })

  it('donne à chaque onglet la sienne', () => {
    for (const t of mountRail().findAll('.tab')) expect(t.find('svg').exists()).toBe(true)
  })

  // La rotation porte sur l'icône seule : sur le bouton entier, la pastille d'erreur tournerait
  // avec lui.
  it('ne fait tourner que l’icône de synchronisation', () => {
    const w = mountRail({ syncing: true })
    expect(w.find('.gear.sync span.spinning svg').exists()).toBe(true)
    expect(w.find('.gear.sync').classes()).not.toContain('spinning')
  })
})
