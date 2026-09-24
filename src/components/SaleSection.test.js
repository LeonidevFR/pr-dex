import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SaleSection from './SaleSection.vue'
import { saleGroups } from '../lib/revente.js'
import { salePrice } from '../../shared/arena-economy.js'

const RATTATA = 19
const BULBIZARRE = 1

const e = (key, species, shiny = false) => ({ key, species, shiny })

const monter = (disponibles, levelOf = () => 1, props = {}) => mount(SaleSection, {
  props: { groups: saleGroups(disponibles, levelOf), ...props },
})

const TROIS_RATTATA = [e('a', RATTATA), e('b', RATTATA), e('c', RATTATA)]

describe('SaleSection', () => {
  it('dit qu’il n’y a rien à vendre plutôt que d’afficher une liste vide', () => {
    const w = monter([e('a', RATTATA)])
    expect(w.text()).toContain('Rien en double')
    expect(w.find('.vendre-groupe').exists()).toBe(false)
  })

  it('groupe par espèce, le plus gros tas en tête', () => {
    const w = monter([...TROIS_RATTATA, e('d', BULBIZARRE), e('f', BULBIZARRE)])
    const lignes = w.findAll('.vendre-groupe')
    expect(lignes).toHaveLength(2)
    expect(lignes[0].text()).toContain('Rattata')
  })

  /**
   * La sélection par défaut est la fonctionnalité : on confirme sans lire. Deux Rattata sur trois
   * sont donc déjà cochés, et le total les chiffre.
   */
  it('présélectionne le surplus et en annonce le total', () => {
    const w = monter(TROIS_RATTATA)
    expect(w.find('.arena-big').text()).toBe(`${salePrice(RATTATA, 1) * 2} ₽`)
    expect(w.find('.arena-unit').text()).toContain('2 exemplaires')
  })

  it('vend en deux clics, et rend les clés choisies', async () => {
    const w = monter(TROIS_RATTATA)
    await w.find('.vendre-btn').trigger('click')
    expect(w.emitted('sell')).toBeUndefined()
    expect(w.find('.vendre-btn').text()).toContain('Confirmer')

    await w.find('.vendre-btn').trigger('click')
    expect(w.emitted('sell')[0][0]).toHaveLength(2)
  })

  // Le second clic dit le prix : on confirme ce qu'on encaisse, pas seulement qu'on a cliqué.
  it('annonce le montant sur le clic de confirmation', async () => {
    const w = monter(TROIS_RATTATA)
    await w.find('.vendre-btn').trigger('click')
    expect(w.find('.vendre-btn').text()).toContain(`${salePrice(RATTATA, 1) * 2} ₽`)
  })

  it('ne propose rien à vendre quand la sélection est vide', async () => {
    const w = monter(TROIS_RATTATA)
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click') // « Aucun »
    expect(w.find('.arena-big').text()).toBe('0 ₽')
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
  })

  it('bascule tout un groupe d’un clic, sans jamais prendre le dernier', async () => {
    const w = monter(TROIS_RATTATA)
    const bouton = () => w.findAll('.vendre-tete .evo-btn')[0]
    await bouton().trigger('click')   // aucun
    await bouton().trigger('click')   // tous
    expect(w.find('.arena-unit').text()).toContain('2 exemplaires')
  })

  it('détaille les exemplaires une fois la ligne dépliée', async () => {
    const w = monter(TROIS_RATTATA, (k) => (k === 'b' ? 8 : 1))
    expect(w.find('.vendre-detail').exists()).toBe(false)
    await w.find('.vendre-plier').trigger('click')

    const lignes = w.findAll('.vendre-ligne')
    expect(lignes).toHaveLength(3)
    expect(w.find('.vendre-detail').text()).toContain('niv. 8')
    expect(w.find('.vendre-detail').text()).toContain('le meilleur')
  })

  /**
   * La règle du dernier exemplaire s'apprend au doigt : la dernière case libre est verrouillée,
   * plutôt que de laisser composer un lot que le serveur refusera EN ENTIER.
   */
  it('verrouille la dernière case libre d’un groupe', async () => {
    const w = monter(TROIS_RATTATA)
    await w.find('.vendre-plier').trigger('click')

    const libre = w.findAll('.vendre-ligne').find((l) => l.classes().includes('bloque'))
    expect(libre).toBeTruthy()
    expect(libre.attributes('disabled')).toBeDefined()
    expect(w.find('.vendre-note').text()).toContain('garder un exemplaire')
  })

  it('décoche un exemplaire précis sans toucher aux autres', async () => {
    const w = monter(TROIS_RATTATA)
    await w.find('.vendre-plier').trigger('click')
    const pris = w.findAll('.vendre-ligne').filter((l) => l.classes().includes('pris'))
    await pris[0].trigger('click')
    expect(w.find('.arena-unit').text()).toContain('1 exemplaire')
  })

  // Un shiny ne partira jamais sans qu'on l'ait explicitement demandé.
  it('laisse le shiny décoché mais vendable', async () => {
    const w = monter([e('a', RATTATA), e('b', RATTATA, true), e('c', RATTATA, true)])
    expect(w.find('.arena-unit').text()).toContain('1 exemplaire')
    await w.find('.vendre-plier').trigger('click')
    expect(w.find('.vendre-detail').text()).toContain('shiny')
  })

  it('n’émet rien et ne se laisse pas cliquer pendant une opération', async () => {
    const w = monter(TROIS_RATTATA, () => 1, { busy: true })
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
  })

  // Une vente aboutie change le stock : la sélection doit repartir du nouveau surplus.
  it('repart du nouveau surplus quand le stock change', async () => {
    const w = monter(TROIS_RATTATA)
    await w.setProps({ groups: saleGroups([e('a', RATTATA), e('b', RATTATA)]) })
    expect(w.find('.arena-unit').text()).toContain('1 exemplaire')
  })
})
