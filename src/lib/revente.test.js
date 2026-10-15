import { describe, it, expect } from 'vitest'
import { saleGroups, saleTotal, NIVEAU_INVESTI } from './revente.js'
import { salePrice } from '../../shared/arena-economy.js'

const RATTATA = 19
const BULBIZARRE = 1

const e = (key, species, shiny = false) => ({ key, species, shiny })

describe('surplus vendable', () => {
  // On ne vend pas son dernier exemplaire : le proposer serait promettre ce que le serveur reprend.
  it('ignore les espèces dont il ne reste qu’un exemplaire', () => {
    expect(saleGroups([e('a', RATTATA)])).toEqual([])
  })

  it('groupe par espèce et compte le surplus', () => {
    const g = saleGroups([e('a', RATTATA), e('b', RATTATA), e('c', BULBIZARRE), e('d', BULBIZARRE)])
    expect(g.map((x) => x.species).sort()).toEqual([BULBIZARRE, RATTATA])
    expect(g.every((x) => x.items.length === 2)).toBe(true)
  })

  // Le plus gros tas d'abord : c'est celui qu'on est venu traiter.
  it('met le plus gros tas en tête', () => {
    const g = saleGroups([
      e('a', BULBIZARRE), e('b', BULBIZARRE),
      e('c', RATTATA), e('d', RATTATA), e('f', RATTATA),
    ])
    expect(g[0].species).toBe(RATTATA)
  })

  /**
   * La réponse en un geste : tout sauf ce qu'on garde. Sans ça, vider douze Nidoran demanderait
   * douze décisions — la corvée que la revente est censée supprimer.
   */
  it('présélectionne tout le surplus, moins l’exemplaire gardé', () => {
    const [g] = saleGroups([e('a', RATTATA), e('b', RATTATA), e('c', RATTATA)])
    expect(g.preselected).toHaveLength(2)
    expect(g.items.filter((i) => i.keeper)).toHaveLength(1)
  })

  it('garde le plus aguerri, et vend les autres', () => {
    const niveaux = { a: 1, b: 9, c: 2 }
    const [g] = saleGroups(
      [e('a', RATTATA), e('b', RATTATA), e('c', RATTATA)], (k) => niveaux[k])
    expect(g.items.find((i) => i.keeper).key).toBe('b')
    expect(g.preselected).toEqual(expect.arrayContaining(['a', 'c']))
  })

  // Un shiny se garde avant tout, même moins aguerri : c'est ce qui ne se remplace pas.
  it('garde le shiny plutôt que le plus haut niveau', () => {
    const [g] = saleGroups(
      [e('a', RATTATA), e('b', RATTATA, true)], (k) => (k === 'a' ? 10 : 1))
    expect(g.items.find((i) => i.keeper).key).toBe('b')
  })

  it('ne présélectionne jamais un shiny, même en surplus', () => {
    const [g] = saleGroups([e('a', RATTATA), e('b', RATTATA, true), e('c', RATTATA, true)])
    expect(g.preselected).toEqual(['a'])
  })

  // Un exemplaire investi a gagné des duels pour en arriver là : vendable, jamais par défaut.
  it('ne présélectionne pas un exemplaire investi', () => {
    const [g] = saleGroups(
      [e('a', RATTATA), e('b', RATTATA), e('c', RATTATA)],
      (k) => (k === 'c' ? NIVEAU_INVESTI : 1),
    )
    expect(g.preselected).not.toContain('c')
    expect(g.items.map((i) => i.key)).toContain('c')
  })

  it('porte le prix que le serveur appliquera', () => {
    const [g] = saleGroups([e('a', RATTATA), e('b', RATTATA)], () => 7)
    expect(g.items[0].price).toBe(salePrice(RATTATA, 7))
  })

  it('totalise la sélection au prix de chaque exemplaire', () => {
    const groupes = saleGroups(
      [e('a', RATTATA), e('b', RATTATA), e('c', BULBIZARRE), e('d', BULBIZARRE)])
    expect(saleTotal(groupes, new Set(['a', 'c'])))
      .toBe(salePrice(RATTATA, 1) + salePrice(BULBIZARRE, 1))
    expect(saleTotal(groupes, new Set())).toBe(0)
  })

  // Une espèce inconnue est une donnée cassée : on l'écarte plutôt que de la faire planter.
  it('écarte une espèce inconnue sans casser le reste', () => {
    const g = saleGroups([e('a', 9999), e('b', 9999), e('c', RATTATA), e('d', RATTATA)])
    expect(g.map((x) => x.species)).toEqual([RATTATA])
  })
})
