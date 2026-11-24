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

const barre = (w) => w.find('.vendre-bar-txt').text()
const tous = (w, n = 0) => w.findAll('.vendre-tous')[n].trigger('click')
const deplier = (w, n = 0) => w.findAll('.vendre-deplier')[n].trigger('click')
const noms = (w) => w.findAll('.vendre-nom b').map((b) => b.text())
const pris = (w) => w.findAll('.vendre-ex').filter((l) => l.classes().includes('pris'))

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
    expect(barre(w)).toBe('Aucun exemplaire choisi')
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
    expect(pris(w)).toHaveLength(0)
  })

  // À cent espèces, des tuiles toutes dépliées feraient des milliers de pixels.
  it('replie chaque espèce en une ligne, et la déplie au clic', async () => {
    const w = monter(TROIS_RATTATA, (k) => (k === 'b' ? 8 : 1))
    expect(w.find('.vendre-ex').exists()).toBe(false)
    expect(w.find('.vendre-nom').text()).toContain(`×3 · 2 en trop · ${salePrice(RATTATA, 1) * 2} ₽`)
    await deplier(w)
    const tuiles = w.findAll('.vendre-ex')
    expect(tuiles).toHaveLength(3)
    expect(w.text()).toContain('Niv. 8')
    expect(w.text()).toContain('le meilleur')
    expect(tuiles[0].text()).toContain(`${salePrice(RATTATA, 1)} ₽`)
  })

  it('chiffre la sélection à mesure qu’on la compose', async () => {
    const w = monter(TROIS_RATTATA)
    await tous(w)
    expect(barre(w)).toBe(`2 exemplaires · ${salePrice(RATTATA, 1) * 2} ₽`)
    expect(w.find('.vendre-pris').text()).toBe('2 choisis')
  })

  it('ne déplie qu’une espèce à la fois', async () => {
    const w = monter([...TROIS_RATTATA, e('d', BULBIZARRE), e('f', BULBIZARRE)])
    await deplier(w, 0)
    await deplier(w, 1)
    expect(w.findAll('.vendre-corps')).toHaveLength(1)
    expect(w.findAll('.vendre-groupe')[1].classes()).toContain('ouverte')
  })

  it('résume la page : exemplaires en trop et valeur du surplus', () => {
    const w = monter([...TROIS_RATTATA, e('d', BULBIZARRE), e('f', BULBIZARRE)])
    const valeur = salePrice(RATTATA, 1) * 2 + salePrice(BULBIZARRE, 1)
    expect(w.find('.vendre-resume').text()).toBe(`3 en trop · ${valeur} ₽`)
  })

  it('trie par valeur, par rareté ou par numéro', async () => {
    const w = monter([...TROIS_RATTATA, e('d', BULBIZARRE), e('f', BULBIZARRE), e('g', 150), e('h', 150)])
    expect(noms(w)[0]).toBe('Rattata')   // le plus gros tas
    const trier = (cle) => w.find('.vendre-tri select').setValue(cle)
    expect(w.findAll('.vendre-tri option').map((o) => o.text())).toEqual(['Quantité', 'Valeur', 'Rareté', 'N° Pokédex'])
    await trier('numero')
    expect(noms(w)).toEqual(['Bulbizarre', 'Rattata', 'Mewtwo'])
    await trier('rarete')
    expect(noms(w)[0]).toBe('Mewtwo')
    await trier('valeur')
    expect(noms(w)[0]).toBe('Mewtwo')
  })

  it('cherche une espèce sans tenir compte des accents ni de la casse', async () => {
    const w = monter([...TROIS_RATTATA, e('d', BULBIZARRE), e('f', BULBIZARRE)])
    await w.find('.vendre-cherche input').setValue('BULBI')
    expect(noms(w)).toEqual(['Bulbizarre'])
    await w.find('.vendre-cherche input').setValue('zzz')
    expect(w.text()).toContain('Aucune espèce ne correspond')
  })

  /** Rien ne part sans avoir vu le lot : la vente passe par un récapitulatif. */
  it('montre le lot avant de vendre, puis rend les clés choisies', async () => {
    const w = monter([...TROIS_RATTATA, e('d', BULBIZARRE), e('f', BULBIZARRE)])
    await tous(w)
    await w.find('.vendre-btn').trigger('click')
    expect(w.emitted('sell')).toBeUndefined()

    const apercu = w.find('.vendre-apercu')
    expect(apercu.find('.vendre-apercu-titre').text()).toBe('Vendre 2 exemplaires\u00a0?')
    expect(apercu.findAll('.vendre-recap li')).toHaveLength(1)
    expect(apercu.find('.vendre-recap').text()).toContain('Rattata ×2')
    expect(apercu.find('.vendre-confirmer').text()).toBe(`Vendre pour ${salePrice(RATTATA, 1) * 2} ₽`)

    await apercu.find('.vendre-confirmer').trigger('click')
    expect(w.emitted('sell')[0][0]).toHaveLength(2)
    expect(w.find('.vendre-apercu').exists()).toBe(false)
  })

  it('referme le récapitulatif sans vendre ni perdre la sélection', async () => {
    const w = monter(TROIS_RATTATA)
    await tous(w)
    await w.find('.vendre-btn').trigger('click')
    await w.findAll('.vendre-apercu-actions button').find((b) => b.text() === 'Annuler').trigger('click')
    expect(w.find('.vendre-apercu').exists()).toBe(false)
    expect(w.emitted('sell')).toBeUndefined()
    expect(barre(w)).toContain('2 exemplaires')
  })

  // Un shiny est signalé : il ne doit pas partir sans qu'on l'ait vu.
  it('signale les shinies, dans les tuiles et dans le récapitulatif', async () => {
    const w = monter([e('a', RATTATA), e('b', RATTATA, true), e('c', RATTATA, true)])
    await deplier(w)
    expect(w.find('.vendre-grille').text()).toContain('shiny')
    await tous(w)
    await w.find('.vendre-btn').trigger('click')
    expect(w.find('.vendre-apercu').text()).toContain('dont 1 shiny')
  })

  it('vide la sélection d’un groupe ou de toute la page', async () => {
    const w = monter(TROIS_RATTATA)
    await tous(w)
    expect(w.find('.vendre-tous').text()).toBe('Tout retirer')
    await tous(w)
    expect(barre(w)).toBe('Aucun exemplaire choisi')
    await tous(w)
    await w.findAll('.vendre-bar .btn-ghost').find((b) => b.text() === 'Vider').trigger('click')
    expect(barre(w)).toBe('Aucun exemplaire choisi')
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
  })

  /**
   * La règle du dernier exemplaire s'apprend au doigt : la dernière tuile libre est verrouillée,
   * plutôt que de laisser composer un lot que le serveur refusera EN ENTIER.
   */
  it('verrouille le dernier exemplaire libre d’un groupe', async () => {
    const w = monter(TROIS_RATTATA)
    await deplier(w)
    await tous(w)
    const libre = w.findAll('.vendre-ex').find((l) => l.classes().includes('bloque'))
    expect(libre.attributes('disabled')).toBeDefined()
    expect(libre.text()).toContain('gardé')
    expect(w.find('.vendre-note').text()).toContain('ne peut plus aller en arène')
  })

  it('décoche un exemplaire précis sans toucher aux autres', async () => {
    const w = monter(TROIS_RATTATA)
    await deplier(w)
    await tous(w)
    await pris(w)[0].trigger('click')
    expect(barre(w)).toContain('1 exemplaire ·')
  })

  /**
   * « Le meilleur » ne s'affiche que lorsqu'il l'est. Quand tout le monde est au niveau 1 et que
   * personne n'est chromatique, celui qu'on garde est arbitraire : l'annoncer comme le meilleur
   * affirmerait une distinction qui n'existe pas.
   */
  it('ne désigne un meilleur exemplaire que s’il se distingue', async () => {
    const egaux = monter(TROIS_RATTATA)
    await deplier(egaux)
    expect(egaux.text()).not.toContain('le meilleur')
    const inegaux = monter(TROIS_RATTATA, (k) => (k === 'b' ? 9 : 1))
    await deplier(inegaux)
    expect(inegaux.text()).toContain('le meilleur')
  })

  it('n’émet rien et ne se laisse pas cliquer pendant une opération', () => {
    const w = monter(TROIS_RATTATA, () => 1, { busy: true })
    expect(w.find('.vendre-btn').attributes('disabled')).toBeDefined()
    expect(w.find('.vendre-tous').attributes('disabled')).toBeDefined()
  })

  // Ce qui disparaît du stock quitte la sélection ; rien ne s'y ajoute jamais tout seul.
  it('n’ajoute rien quand le stock grandit', async () => {
    const w = monter(TROIS_RATTATA)
    await w.setProps({
      groups: saleGroups([...TROIS_RATTATA, e('d', RATTATA), e('f', RATTATA)]),
    })
    expect(barre(w)).toBe('Aucun exemplaire choisi')
  })

  /**
   * Le surplus est un `computed` qui reconstruit ses groupes à chaque évaluation. Un `watch`
   * profond dessus réappliquait la sélection par défaut à n'importe quel recalcul, même
   * équivalent : on décochait deux exemplaires, la moindre relecture les recochait en silence, et
   * la vente emportait ce qu'on voulait garder.
   */
  it('garde la sélection quand le surplus est recalculé à l’identique', async () => {
    const w = monter(TROIS_RATTATA)
    await tous(w)
    expect(barre(w)).toContain('2 exemplaires')

    await w.setProps({ groups: saleGroups([e('a', RATTATA), e('b', RATTATA), e('c', RATTATA)]) })
    expect(barre(w)).toContain('2 exemplaires')
  })

  // Ce qui a disparu quitte la sélection, sinon la vente suivante porterait sur du vide.
  it('oublie un exemplaire qui n’est plus là, sans rien rajouter', async () => {
    const w = monter([e('a', RATTATA), e('b', RATTATA), e('c', RATTATA), e('d', RATTATA)])
    await tous(w)   // tous : 3 sur 4
    expect(barre(w)).toContain('3 exemplaires')

    // « b » était choisi et disparaît ; « z » arrive et ne s'invite pas dans la vente.
    await w.setProps({
      groups: saleGroups([e('a', RATTATA), e('c', RATTATA), e('d', RATTATA), e('z', RATTATA)]),
    })
    expect(barre(w)).toContain('2 exemplaires')
  })
})
