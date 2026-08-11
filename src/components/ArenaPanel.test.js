import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArenaPanel from './ArenaPanel.vue'

const exemplaire = (key, species, shiny = false) => ({ key, species, shiny })

const monter = (props = {}) => mount(ArenaPanel, {
  props: {
    credits: 3,
    pokedollars: 250,
    challenges: [],
    engageable: [exemplaire('github:a', 6), exemplaire('github:b', 25)],
    myOpen: null,
    levelOf: (k) => (k === 'github:a' ? 4 : 1),
    ...props,
  },
})

describe('ArenaPanel', () => {
  it('annonce les engagements restants et le portefeuille', () => {
    const w = monter()
    expect(w.text()).toContain('3 engagements disponibles')
    expect(w.text()).toContain('250 ₽')
  })

  it('explique le rythme quand il ne reste aucun engagement', () => {
    const w = monter({ credits: 0 })
    expect(w.text()).toContain('Un engagement par jour ouvré')
    expect(w.findAll('.evo-choice')).toHaveLength(0)
  })

  it('propose d’engager chaque exemplaire disponible, avec son niveau', () => {
    const w = monter()
    const choix = w.findAll('.evo-choice')
    expect(choix).toHaveLength(2)
    expect(choix[0].text()).toContain('Dracaufeu')
    expect(choix[0].text()).toContain('niv. 4')
  })

  // Rien ne part tant qu'on n'a pas confirmé : le clic sur un Pokémon choisit, il n'engage pas.
  it('ne déclenche rien au simple choix d’un exemplaire', async () => {
    const w = monter()
    await w.findAll('.evo-choice')[0].trigger('click')
    expect(w.emitted('engage')).toBeUndefined()
  })

  it('dit ce qu’on risque avant de confirmer', async () => {
    const w = monter()
    await w.findAll('.evo-choice')[0].trigger('click')
    expect(w.text()).toContain('il est détruit')
    expect(w.text()).toContain("L’espèce reste à la planche")
  })

  it('poste un défi avec l’exemplaire choisi', async () => {
    const w = monter()
    await w.findAll('.evo-choice')[0].trigger('click')
    await w.find('.btn-solid').trigger('click')
    expect(w.emitted('engage')[0]).toEqual(['github:a', false])
  })

  it('affronte l’ordinateur avec le même exemplaire', async () => {
    const w = monter()
    await w.findAll('.evo-choice')[1].trigger('click')
    await w.find('.btn-ghost').trigger('click')
    expect(w.emitted('engage')[0]).toEqual(['github:b', true])
  })

  // Les deux mises se révèlent en même temps : on choisit la sienne avant de savoir contre qui,
  // et jamais après avoir vu celle d'en face.
  it('n’affiche jamais la mise d’un défi ouvert', () => {
    const w = monter({ challenges: [{ id: 7, pseudo: 'bob', created_at: 'x' }] })
    expect(w.text()).toContain('bob')
    expect(w.text()).toContain('mise cachée')
  })

  it('refuse de relever tant qu’on n’a rien engagé', async () => {
    const w = monter({ challenges: [{ id: 7, pseudo: 'bob', created_at: 'x' }] })
    expect(w.find('.evo-btn').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Choisis d’abord ce que tu engages')
  })

  it('relève un défi une fois la mise choisie', async () => {
    const w = monter({ challenges: [{ id: 7, pseudo: 'bob', created_at: 'x' }] })
    await w.findAll('.evo-choice')[0].trigger('click')
    await w.find('.evo-btn').trigger('click')
    expect(w.emitted('accept')[0]).toEqual([7, 'github:a'])
  })

  // On ne peut pas se battre contre soi-même : son propre défi est rappelé à part, avec sa mise,
  // que l'on est seul à voir.
  it('sort son propre défi de la liste des défis relevables', () => {
    const w = monter({
      challenges: [{ id: 7, pseudo: 'moi', created_at: 'x' }],
      myOpen: { id: 7, challenger_key: 'github:a', species: 6 },
    })
    expect(w.findAll('.evo-btn')).toHaveLength(0)
    expect(w.text()).toContain('Dracaufeu t’attend sur la table')
  })

  it('dit qu’un défi sans preneur finira contre l’ordinateur', () => {
    const w = monter()
    expect(w.text()).toContain("l’ordinateur")
  })

  it('bloque les boutons pendant un appel en cours', async () => {
    const w = monter({ busy: true })
    await w.findAll('.evo-choice')[0].trigger('click')
    expect(w.find('.btn-solid').attributes('disabled')).toBeDefined()
  })
})
