import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TheTray from './TheTray.vue'

const entry = (id, species, extra = {}) => ({
  source: 'github', external_id: id, key: `github:${id}`, species, shiny: false, via: 'catch',
  label: 't', ref: 'moi/atlas#1', url: 'https://github.com/moi/atlas/pull/1',
  date: '2026-02-03', ...extra,
})

const mountTray = (bySpecies, evolvable) => mount(TheTray, { props: { bySpecies, evolvable } })
const mountFiltered = (props) => mount(TheTray, { props: { bySpecies: {}, ...props } })

describe('TheTray', () => {
  it('affiche les 151 cases', () => {
    expect(mountTray({}).findAll('.cell')).toHaveLength(151)
  })

  it('rend une case non capturée en silhouette et la désactive', () => {
    const cell = mountTray({}).findAll('.cell')[0]
    expect(cell.classes()).toContain('ghost')
    expect(cell.attributes('disabled')).toBeDefined()
  })

  it('rend une case capturée cliquable', () => {
    const cell = mountTray({ 25: [entry('a3f8c21e9b', 25)] }).findAll('.cell')[24]
    expect(cell.classes()).toContain('has')
    expect(cell.attributes('disabled')).toBeUndefined()
  })

  it('émet l’espèce sélectionnée au clic', async () => {
    const w = mountTray({ 25: [entry('a3f8c21e9b', 25)] })
    await w.findAll('.cell')[24].trigger('click')
    expect(w.emitted('select')[0]).toEqual([25])
  })

  it('montre la source d’une capture', () => {
    const w = mountTray({ 25: [entry('a3f8c21e9b4d', 25, { source: 'crm' })] })
    expect(w.findAll('.cell')[24].find('.cell-origin').text()).toBe('crm')
  })

  it('affiche « évolué » plutôt qu’une source pour une entrée d’évolution', () => {
    const w = mountTray({ 130: [{ species: 130, from: 129, via: 'evo', date: '2026-07-14', shiny: false }] })
    expect(w.findAll('.cell')[129].find('.cell-origin').text()).toBe('évolué')
  })

  it('compte les doublons', () => {
    const w = mountTray({ 25: [entry('a', 25), entry('b', 25)] })
    expect(w.findAll('.cell')[24].find('.cell-dupes').text()).toBe('×2')
  })

  it('n’affiche pas de compteur pour une capture unique', () => {
    const w = mountTray({ 25: [entry('a', 25)] })
    expect(w.findAll('.cell')[24].find('.cell-dupes').exists()).toBe(false)
  })

  it('affiche le stock disponible (prop copies) plutôt que le total brut quand fourni', () => {
    const w = mount(TheTray, {
      props: { bySpecies: { 1: [entry('a', 1), entry('b', 1)] }, copies: { 1: 1 } },
    })
    expect(w.findAll('.cell')[0].find('.cell-dupes').exists()).toBe(false) // 1 disponible : pas de badge
  })

  it('remonte à ×N avec la prop copies quand du stock reste', () => {
    const w = mount(TheTray, {
      props: { bySpecies: { 1: [entry('a', 1), entry('b', 1), entry('c', 1)] }, copies: { 1: 2 } },
    })
    expect(w.findAll('.cell')[0].find('.cell-dupes').text()).toBe('×2')
  })

  it('marque une espèce dont au moins une capture est chromatique', () => {
    const w = mountTray({ 25: [entry('a', 25), entry('b', 25, { shiny: true })] })
    expect(w.findAll('.cell')[24].classes()).toContain('shiny')
    expect(w.findAll('.cell')[24].find('img').attributes('src')).toContain('/shiny/')
  })

  it('marque un sprite cassé sans retirer la case', () => {
    const w = mountTray({ 25: [entry('a', 25)] })
    const img = w.findAll('.cell')[24].find('img')
    img.trigger('error')
    expect(w.findAll('.cell')).toHaveLength(151)
  })

  it('marque une case dont l’espèce peut évoluer maintenant', () => {
    const w = mountTray({ 1: [entry('a', 1)] }, new Set([1]))
    expect(w.findAll('.cell')[0].find('.cell-evo').exists()).toBe(true)
  })

  it('n’affiche pas le badge d’évolution pour une espèce qui n’en a pas les moyens', () => {
    const w = mountTray({ 1: [entry('a', 1)] }, new Set())
    expect(w.findAll('.cell')[0].find('.cell-evo').exists()).toBe(false)
  })

  it('n’affiche pas le badge d’évolution sans le prop (valeur par défaut)', () => {
    const w = mountTray({ 1: [entry('a', 1)] })
    expect(w.findAll('.cell')[0].find('.cell-evo').exists()).toBe(false)
  })

  it('marque une légendaire capturée pour le halo', () => {
    // 144 Artikodin est légendaire (DEX[144].tier === 'l')
    const w = mountTray({ 144: [entry('a', 144)] })
    expect(w.findAll('.cell')[143].classes()).toContain('legendary')
  })

  it('ne marque pas une non-légendaire', () => {
    const w = mountTray({ 25: [entry('a', 25)] })
    expect(w.findAll('.cell')[24].classes()).not.toContain('legendary')
  })

  it('ne marque pas une légendaire non capturée', () => {
    expect(mountTray({}).findAll('.cell')[143].classes()).not.toContain('legendary')
  })

  describe('filtres', () => {
    const chipByText = (w, text) => w.findAll('.filter-chip').find((c) => c.text() === text)

    it('affiche toujours la barre d’outils, sans panneau à ouvrir', () => {
      expect(mountTray({}).find('.toolbar').exists()).toBe(true)
      expect(mountTray({}).find('.tray-search').exists()).toBe(true)
    })

    it('nomme le filtre des non-capturées « Manquants »', () => {
      expect(chipByText(mountFiltered(), 'Manquants')).toBeDefined()
    })

    it('émet set-query à la saisie, sans filtrer elle-même', async () => {
      const w = mountFiltered()
      await w.find('.tray-search').setValue('pika')
      expect(w.emitted('set-query').at(-1)).toEqual(['pika'])
    })

    it('ne garde que les espèces qui répondent à la recherche', () => {
      const w = mountFiltered({ query: 'evoli' })
      expect(w.findAll('.cell')).toHaveLength(1)
      expect(w.find('.cell-no').text()).toBe('133')
    })

    it('croise la recherche avec les paliers', () => {
      expect(mountFiltered({ query: 'pika', activeTiers: new Set(['l']) }).findAll('.cell')).toHaveLength(0)
    })

    it('dit qu’aucun Pokémon ne correspond et propose d’effacer', async () => {
      const w = mountFiltered({ query: 'zzz' })
      expect(w.find('.tray-empty').text()).toContain('Aucun Pokémon ne correspond')
      await w.find('.tray-empty .filter-reset').trigger('click')
      expect(w.emitted('reset-filters')).toBeTruthy()
    })

    it('ne garde que les paliers listés dans activeTiers (5 légendaires)', () => {
      const w = mountFiltered({ activeTiers: new Set(['l']) })
      expect(w.findAll('.cell')).toHaveLength(5)
    })

    it('émet toggle-tier avec le palier cliqué, ne mute rien elle-même', async () => {
      const w = mountFiltered()
      await chipByText(w, 'Commun').trigger('click')
      expect(w.emitted('toggle-tier')[0]).toEqual(['c'])
      expect(w.findAll('.cell')).toHaveLength(151) // le parent décide, pas la case ici
    })

    it('filtre sur les captures via le prop statusFilter', () => {
      const w = mountFiltered({ bySpecies: { 25: [entry('a', 25)] }, statusFilter: 'caught' })
      expect(w.findAll('.cell')).toHaveLength(1)
      expect(w.findAll('.cell')[0].classes()).toContain('has')
    })

    it('filtre sur les non-capturées via le prop statusFilter', () => {
      const w = mountFiltered({ bySpecies: { 25: [entry('a', 25)] }, statusFilter: 'uncaught' })
      expect(w.findAll('.cell')).toHaveLength(150)
    })

    it('émet set-status-filter au clic sur un chip de statut', async () => {
      const w = mountFiltered()
      await chipByText(w, 'Capturés').trigger('click')
      expect(w.emitted('set-status-filter')[0]).toEqual(['caught'])
    })

    it('n’affiche le bouton réinitialiser que si un filtre est actif', () => {
      expect(mountFiltered().find('.filter-reset').exists()).toBe(false)
      expect(mountFiltered({ statusFilter: 'caught' }).find('.filter-reset').exists()).toBe(true)
    })


    it('ne garde que les espèces évoluables via le prop statusFilter', () => {
      const w = mountFiltered({
        bySpecies: { 1: [entry('a', 1)], 25: [entry('b', 25)] },
        evolvable: new Set([1]),
        statusFilter: 'evolvable',
      })
      expect(w.findAll('.cell')).toHaveLength(1)
      expect(w.findAll('.cell')[0].find('.cell-evo').exists()).toBe(true)
    })

    it('croise « évoluables » avec les paliers actifs', () => {
      const w = mountFiltered({
        bySpecies: { 1: [entry('a', 1)], 25: [entry('b', 25)] },
        evolvable: new Set([1, 25]), // 1 est rare, 25 commun
        activeTiers: new Set(['c']),
        statusFilter: 'evolvable',
      })
      expect(w.findAll('.cell')).toHaveLength(1)
    })

    it('compte les évoluables dans le chip', () => {
      expect(mountFiltered({ evolvable: new Set([1, 25]) }).find('.chip-evo').text()).toBe('Évoluables · 2')
    })

    it('émet set-status-filter au clic sur le chip Évoluables', async () => {
      const w = mountFiltered()
      await w.find('.chip-evo').trigger('click')
      expect(w.emitted('set-status-filter')[0]).toEqual(['evolvable'])
    })

    it('explique la grille vide plutôt que de la laisser muette', () => {
      const w = mountFiltered({ statusFilter: 'evolvable', evolvable: new Set() })
      expect(w.findAll('.cell')).toHaveLength(0)
      expect(w.find('.tray-empty').text()).toContain('Rien à faire évoluer')
    })

    // Nommer l'évolution comme seule cause serait faux si un palier était décoché en même temps.
    it('reste évasif quand un palier décoché participe aussi au vide', () => {
      const w = mountFiltered({
        statusFilter: 'evolvable', evolvable: new Set(), activeTiers: new Set(['l']),
      })
      expect(w.find('.tray-empty').text()).toContain('Aucune espèce ne répond à ces filtres')
    })

    it('n’affiche pas le message de grille vide quand des cases restent', () => {
      expect(mountFiltered().find('.tray-empty').exists()).toBe(false)
    })

    it('émet reset-filters au clic sur réinitialiser', async () => {
      const w = mountFiltered({ statusFilter: 'caught' })
      await w.find('.filter-reset').trigger('click')
      expect(w.emitted('reset-filters')).toBeTruthy()
    })
  })

  describe('pastilles et halos', () => {
    it('nomme le palier d’une capture peu commune, rare ou légendaire', () => {
      const w = mountTray({ 37: [entry('a', 37)], 4: [entry('b', 4)], 144: [entry('c', 144)] })
      expect(w.findAll('.cell')[36].find('.cell-pill').text()).toBe('Peu commun')
      expect(w.findAll('.cell')[3].find('.cell-pill').text()).toBe('Rare')
      expect(w.findAll('.cell')[143].find('.cell-pill').text()).toBe('Légendaire')
    })

    it('ne met pas de pastille sur une capture commune', () => {
      expect(mountTray({ 25: [entry('a', 25)] }).findAll('.cell')[24].find('.cell-pill').exists()).toBe(false)
    })

    it('ne met pas de pastille sur une silhouette', () => {
      expect(mountTray({}).findAll('.cell')[143].find('.cell-pill').exists()).toBe(false)
    })

    // Plus de halo : un picto discret dit la rareté sans alourdir la grille.
    it('n’a plus aucun halo', () => {
      const w = mountTray({ 144: [entry('a', 144)], 25: [entry('b', 25, { shiny: true })] })
      expect(w.findAll('.cell-halo')).toHaveLength(0)
    })

    it('marque d’une gemme une légendaire capturée', () => {
      const cell = mountTray({ 144: [entry('a', 144)] }).findAll('.cell')[143]
      expect(cell.find('.cell-legend .lucide-gem').exists()).toBe(true)
      expect(cell.find('.cell-legend').attributes('aria-label')).toBe('légendaire')
    })

    it('ne marque pas une légendaire manquante ni une rare', () => {
      const w = mountTray({ 4: [entry('a', 4)] })
      expect(w.findAll('.cell')[143].find('.cell-legend').exists()).toBe(false)
      expect(w.findAll('.cell')[3].find('.cell-legend').exists()).toBe(false)
    })

    it('montre gemme et étoile sur une légendaire shiny', () => {
      const cell = mountTray({ 144: [entry('a', 144, { shiny: true })] }).findAll('.cell')[143]
      expect(cell.find('.cell-legend').exists()).toBe(true)
      expect(cell.find('.cell-shiny .lucide-sparkle').exists()).toBe(true)
      expect(cell.classes()).toContain('shiny')
    })

    it('ne montre pas ↑ sur une case shiny, même évoluable', () => {
      const cell = mountTray({ 10: [entry('a', 10, { shiny: true })] }, new Set([10])).findAll('.cell')[9]
      expect(cell.find('.cell-evo').exists()).toBe(false)
      expect(cell.classes()).toContain('shiny')
    })

    it('marque une rare capturée pour son cadre', () => {
      expect(mountTray({ 4: [entry('a', 4)] }).findAll('.cell')[3].classes()).toContain('rare')
    })
  })
})
