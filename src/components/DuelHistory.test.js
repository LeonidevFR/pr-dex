import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DuelHistory from './DuelHistory.vue'

const MOI = 'moi'
const duel = (over = {}) => ({
  id: 1, challenger_id: MOI, opponent_id: 'bob', status: 'resolved', winner_id: MOI, stake_tier: 'r',
  challenger_species: 6, opponent_species: 9, challenger_level: 4, opponent_level: 3,
  challenger_power: 100, opponent_power: 100, resolved_at: '2026-11-24T10:00:00Z', adversaire_login: 'bob-dev',
  ...over,
})
const monter = async (load, props = {}) => {
  const w = mount(DuelHistory, { props: { load, userId: MOI, ...props } })
  await flushPromises()
  return w
}
const textes = (w) => w.findAll('.histo-ligne').map((l) => l.text())

describe('DuelHistory', () => {
  it('lit la première page, sans filtre, depuis mon identifiant', async () => {
    const load = vi.fn(async () => ({ duels: [duel()], plus: false }))
    await monter(load)
    expect(load).toHaveBeenCalledWith({ userId: MOI, offset: 0, limit: 20, issue: 'tous', adversaire: 'tous' })
  })

  it('résume une victoire contre un joueur : adversaire, enjeu, gains', async () => {
    const w = await monter(async () => ({ duels: [duel()], plus: false }))
    const [t] = textes(w)
    expect(t).toContain('Gagné')
    expect(t).toContain('Dracaufeu')
    expect(t).toContain('Tortank')
    expect(t).toContain('contre bob-dev')
    expect(t).toContain('enjeu rare')
    expect(t).toContain('+250 ₽')
    expect(t).toContain('+25 pts')
    expect(t).toContain('1 carte')
  })

  it('lit le duel depuis mon camp quand j’ai relevé le défi', async () => {
    const w = await monter(async () => ({
      duels: [duel({ challenger_id: 'bob', opponent_id: MOI, winner_id: 'bob' })], plus: false,
    }))
    const [t] = textes(w)
    expect(t).toContain('Perdu')
    expect(t.indexOf('Tortank')).toBeLessThan(t.indexOf('Dracaufeu'))
    expect(t).toContain('Tortank perdu')
  })

  it('ne parle ni de perte ni de points contre l’ordinateur', async () => {
    const w = await monter(async () => ({
      duels: [
        duel({ id: 1, status: 'computer', opponent_id: null, adversaire_login: null, winner_id: MOI }),
        duel({ id: 2, status: 'computer', opponent_id: null, adversaire_login: null, winner_id: null }),
      ],
      plus: false,
    }))
    const [gagne, perdu] = textes(w)
    expect(gagne).toContain('contre l’ordinateur')
    expect(gagne).toContain('+50 ₽')
    expect(gagne).not.toContain('pts')
    expect(perdu).toContain('rien de perdu')
    expect(w.findAll('.histo-details.perte')).toHaveLength(0)
  })

  it('« Voir plus » ajoute la page suivante à la suite', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ duels: [duel({ id: 2 })], plus: true })
      .mockResolvedValueOnce({ duels: [duel({ id: 1 })], plus: false })
    const w = await monter(load)
    await w.find('.histo-plus').trigger('click')
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }))
    expect(w.findAll('.histo-ligne')).toHaveLength(2)
    expect(w.find('.histo-plus').exists()).toBe(false)
  })

  it('un filtre relit depuis la première page, côté serveur', async () => {
    const load = vi.fn(async () => ({ duels: [duel()], plus: false }))
    const w = await monter(load)
    await w.findAll('select')[0].setValue('perdus')
    await w.findAll('select')[1].setValue('ordinateur')
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, issue: 'perdus', adversaire: 'ordinateur' }))
  })

  it('ignore une page arrivée après un changement de filtre', async () => {
    let lente
    const load = vi.fn()
      .mockResolvedValueOnce({ duels: [], plus: false })
      .mockImplementationOnce(() => new Promise((r) => { lente = r }))
      .mockResolvedValueOnce({ duels: [duel({ id: 9 })], plus: false })
    const w = await monter(load)
    await w.findAll('select')[0].setValue('gagnes')
    await w.findAll('select')[0].setValue('perdus')
    await flushPromises()
    lente({ duels: [duel({ id: 1 }), duel({ id: 2 })], plus: true })
    await flushPromises()
    expect(w.findAll('.histo-ligne')).toHaveLength(1)
  })

  it('distingue l’historique vide d’un filtre sans résultat', async () => {
    const load = vi.fn(async () => ({ duels: [], plus: false }))
    const w = await monter(load)
    expect(w.text()).toContain('Aucun duel joué')
    await w.findAll('select')[0].setValue('gagnes')
    await flushPromises()
    expect(w.text()).toContain('Aucun duel ne correspond')
  })

  it('relit la première page quand un duel vient de se jouer', async () => {
    const load = vi.fn(async () => ({ duels: [], plus: false }))
    const w = await monter(load, { version: [] })
    await w.setProps({ version: [duel()] })
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('dit quand l’historique n’a pas pu se charger', async () => {
    const w = await monter(async () => { throw new Error('coupé') })
    expect(w.text()).toContain('n’a pas pu se charger')
  })
})
