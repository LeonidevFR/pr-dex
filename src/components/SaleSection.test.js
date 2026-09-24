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
   * Rien n'est coché au départ. Une sélection d'office ferait vendre par inadvertance ce que le
   * joueur n'a pas regardé — et ce qui part ne revient pas.
   */
  it('ne coche rien au départ', () => {
    const w = monter(TROIS_RATTATA)
    expect(w.find('.arena-big').text()).toBe('0 ₽')
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
    expect(w.findAll('.vendre-ligne').filter((l) => l.classes().includes('pris'))).toHaveLength(0)
  })

  it('chiffre la sélection à mesure qu’on la compose', async () => {
    const w = monter(TROIS_RATTATA)
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')   // « Tous »
    expect(w.find('.arena-big').text()).toBe(`${salePrice(RATTATA, 1) * 2} ₽`)
    expect(w.find('.arena-unit').text()).toContain('2 exemplaires')
  })

  it('vend en deux clics, et rend les clés choisies', async () => {
    const w = monter(TROIS_RATTATA)
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')
    await w.find('.vendre-btn').trigger('click')
    expect(w.emitted('sell')).toBeUndefined()
    expect(w.find('.vendre-btn').text()).toContain('Confirmer')

    await w.find('.vendre-btn').trigger('click')
    expect(w.emitted('sell')[0][0]).toHaveLength(2)
  })

  // Le second clic dit le prix : on confirme ce qu'on encaisse, pas seulement qu'on a cliqué.
  it('annonce le montant sur le clic de confirmation', async () => {
    const w = monter(TROIS_RATTATA)
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')
    await w.find('.vendre-btn').trigger('click')
    expect(w.find('.vendre-btn').text()).toContain(`${salePrice(RATTATA, 1) * 2} ₽`)
  })

  it('ne propose rien à vendre quand la sélection est vidée', async () => {
    const w = monter(TROIS_RATTATA)
    const bouton = () => w.findAll('.vendre-tete .evo-btn')[0]
    await bouton().trigger('click')   // tous
    await bouton().trigger('click')   // aucun
    expect(w.find('.arena-big').text()).toBe('0 ₽')
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
  })

  // Le raccourci du groupe prend tout son surplus — jamais le dernier exemplaire.
  it('bascule tout un groupe d’un clic, sans jamais prendre le dernier', async () => {
    const w = monter(TROIS_RATTATA)
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')
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
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')
    await w.find('.vendre-plier').trigger('click')

    const libre = w.findAll('.vendre-ligne').find((l) => l.classes().includes('bloque'))
    expect(libre).toBeTruthy()
    expect(libre.attributes('disabled')).toBeDefined()
    expect(w.find('.vendre-note').text()).toContain('plus jouable')
  })

  it('décoche un exemplaire précis sans toucher aux autres', async () => {
    const w = monter(TROIS_RATTATA)
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')
    await w.find('.vendre-plier').trigger('click')
    const pris = w.findAll('.vendre-ligne').filter((l) => l.classes().includes('pris'))
    await pris[0].trigger('click')
    expect(w.find('.arena-unit').text()).toContain('1 exemplaire')
  })

  // Un shiny est signalé comme tel : il ne doit pas partir sans qu'on l'ait vu.
  it('signale les shinies dans le détail', async () => {
    const w = monter([e('a', RATTATA), e('b', RATTATA, true), e('c', RATTATA, true)])
    await w.find('.vendre-plier').trigger('click')
    expect(w.find('.vendre-detail').text()).toContain('shiny')
  })

  /**
   * « Le meilleur » ne s'affiche que lorsqu'il l'est. Quand tout le monde est au niveau 1 et que
   * personne n'est chromatique, celui qu'on garde est arbitraire : l'annoncer comme le meilleur
   * affirmerait une distinction qui n'existe pas.
   */
  it('ne désigne un meilleur exemplaire que s’il se distingue', async () => {
    const egaux = monter(TROIS_RATTATA)
    await egaux.find('.vendre-plier').trigger('click')
    expect(egaux.find('.vendre-detail').text()).not.toContain('le meilleur')

    const inegaux = monter(TROIS_RATTATA, (k) => (k === 'b' ? 9 : 1))
    await inegaux.find('.vendre-plier').trigger('click')
    expect(inegaux.find('.vendre-detail').text()).toContain('le meilleur')
  })

  it('n’émet rien et ne se laisse pas cliquer pendant une opération', async () => {
    const w = monter(TROIS_RATTATA, () => 1, { busy: true })
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
  })

  // Ce qui disparaît du stock quitte la sélection ; rien ne s'y ajoute jamais tout seul.
  it('n’ajoute rien quand le stock grandit', async () => {
    const w = monter(TROIS_RATTATA)
    await w.setProps({
      groups: saleGroups([...TROIS_RATTATA, e('d', RATTATA), e('f', RATTATA)]),
    })
    expect(w.find('.arena-big').text()).toBe('0 ₽')
  })

  /**
   * Le surplus est un `computed` qui reconstruit ses groupes à chaque évaluation. Un `watch`
   * profond dessus réappliquait la sélection par défaut à n'importe quel recalcul, même
   * équivalent : on décochait deux exemplaires, la moindre relecture les recochait en silence, et
   * la vente emportait ce qu'on voulait garder.
   */
  it('garde la sélection quand le surplus est recalculé à l’identique', async () => {
    const w = monter(TROIS_RATTATA)
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')
    expect(w.find('.arena-unit').text()).toContain('2 exemplaires')

    await w.setProps({ groups: saleGroups([e('a', RATTATA), e('b', RATTATA), e('c', RATTATA)]) })
    expect(w.find('.arena-unit').text()).toContain('2 exemplaires')
  })

  // Ce qui a disparu quitte la sélection, sinon la vente suivante porterait sur du vide.
  it('oublie un exemplaire qui n’est plus là, sans rien rajouter', async () => {
    const w = monter([e('a', RATTATA), e('b', RATTATA), e('c', RATTATA), e('d', RATTATA)])
    await w.findAll('.vendre-tete .evo-btn')[0].trigger('click')   // tous : 3 sur 4
    expect(w.find('.arena-unit').text()).toContain('3 exemplaires')

    // « b » était choisi et disparaît ; « z » arrive et ne s'invite pas dans la vente.
    await w.setProps({
      groups: saleGroups([e('a', RATTATA), e('c', RATTATA), e('d', RATTATA), e('z', RATTATA)]),
    })
    expect(w.find('.arena-unit').text()).toContain('2 exemplaires')
  })
})
