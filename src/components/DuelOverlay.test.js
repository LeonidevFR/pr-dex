import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DuelOverlay from './DuelOverlay.vue'

const MOI = 'u-moi'
const LUI = 'u-lui'

const duel = (over = {}) => ({
  id: 1,
  challenger_id: MOI,
  opponent_id: LUI,
  status: 'resolved',
  winner_id: MOI,
  stake_tier: 'r',
  challenger_species: 6,
  opponent_species: 9,
  challenger_level: 4,
  opponent_level: 2,
  challenger_form: 2,
  opponent_form: 4,
  challenger_power: 700,
  opponent_power: 610,
  probability: 0.62,
  roll: 0.4123,
  ...over,
})

const monter = (over = {}, userId = MOI) =>
  mount(DuelOverlay, { props: { duel: duel(over), userId } })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const revele = async (w) => {
  vi.runAllTimers()
  await w.vm.$nextTick()
  return w
}

describe('DuelOverlay', () => {
  it('montre les deux Pokémon face à face dès l’ouverture', () => {
    const w = monter()
    expect(w.text()).toContain('Dracaufeu')
    expect(w.text()).toContain('Tortank')
  })

  // On regarde les deux Pokémon avant de savoir lequel tombe : sans cette pause, la révélation
  // et le verdict arrivent ensemble et le duel n'a jamais eu lieu, il s'est juste affiché.
  it('retient le verdict le temps de la révélation', () => {
    const w = monter()
    expect(w.text()).toContain('Le combat se joue')
    expect(w.text()).not.toContain('Victoire')
  })

  it('annonce la victoire une fois la révélation passée', async () => {
    const w = await revele(monter())
    expect(w.text()).toContain('Victoire')
  })

  it('annonce la défaite quand on a perdu', async () => {
    const w = await revele(monter({ winner_id: LUI }))
    expect(w.text()).toContain('Défaite')
  })

  // L'espèce reste acquise : c'est l'exemplaire qui disparaît, pas ce qu'on a vu.
  it('dit ce qu’on perd exactement en cas de défaite', async () => {
    const w = await revele(monter({ winner_id: LUI }))
    expect(w.text()).toContain('L’espèce reste à la planche')
  })

  it('dit ce qu’on gagne en cas de victoire', async () => {
    const w = await revele(monter())
    expect(w.text()).toContain('Son exemplaire est détruit')
    expect(w.text()).toContain('un pli rare')
  })

  // L'ordinateur ne possède rien : il ne peut ni détruire ni offrir.
  it('explique qu’un duel contre l’ordinateur ne coûte ni ne rapporte d’exemplaire', async () => {
    const w = await revele(monter({ status: 'computer', opponent_id: null }))
    expect(w.text()).toContain('ne possède rien')
    expect(w.text()).toContain('cinquième du tarif')
  })

  it('nomme l’enjeu et l’explique par les deux paliers réellement engagés', async () => {
    const w = await revele(monter())
    expect(w.text()).toContain('Enjeu du duel')
    expect(w.text()).toContain('comme au poker'.replace('c', 'C'))
    expect(w.text()).toContain('le plus modeste des deux')
  })

  /**
   * Une issue probabiliste sans explication passe pour arbitraire, surtout quand elle vient de
   * détruire un Pokémon obtenu en plusieurs semaines. Le détail doit permettre de refaire le
   * calcul, pas seulement d'y croire.
   */
  it('détaille le calcul des deux puissances et le tirage', async () => {
    const w = await revele(monter())
    expect(w.text()).toContain('stats de base')
    expect(w.text()).toContain('niveau 4')
    expect(w.text()).toContain('ta puissance')
    expect(w.text()).toContain('700')
    expect(w.text()).toContain('610')
    expect(w.text()).toContain('0.4123')
  })

  it('affiche les chances du joueur, pas celles du challengeur', async () => {
    const w = await revele(monter())
    expect(w.text()).toContain('62 %')
  })

  // La probabilité est stockée pour le camp challengeur : vue de l'autre côté, elle se retourne.
  it('retourne les chances quand on est le preneur', async () => {
    const w = await revele(monter({}, LUI))
    expect(w.text()).toContain('38 %')
  })

  it('montre son propre Pokémon en premier, quel que soit le côté', async () => {
    const w = await revele(monter({}, LUI))
    const noms = w.findAll('.arena-mon .line-name').map((n) => n.text())
    expect(noms).toEqual(['Tortank', 'Dracaufeu'])
  })

  // Un gain qu'on ne voit pas est un gain qui n'existe pas pour le joueur.
  it('affiche ce qu’on remporte, en toutes lettres', async () => {
    const w = await revele(monter())
    expect(w.text()).toContain('Ce que tu remportes')
    expect(w.text()).toContain('250')
    expect(w.text()).toContain('points de saison')
    expect(w.text()).toContain('pli rare')
  })

  it('n’annonce ni pli ni point après un duel contre l’ordinateur', async () => {
    const w = await revele(monter({ status: 'computer', opponent_id: null }))
    expect(w.text()).not.toContain('points de saison')
    expect(w.text()).not.toContain('pli rare')
    expect(w.text()).toContain('50')
  })

  it('n’annonce aucune récompense en cas de défaite', async () => {
    const w = await revele(monter({ winner_id: LUI }))
    expect(w.text()).not.toContain('Ce que tu remportes')
  })

  it('rappelle qu’aucun duel n’est gagné d’avance', async () => {
    const w = await revele(monter())
    expect(w.text()).toContain('une chance sur vingt')
  })
})
