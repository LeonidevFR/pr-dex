import { describe, it, expect } from 'vitest'
import { demoCatches, demoArena } from './demo.js'
import { entryKey } from '../../shared/entry.js'
import { DEX } from '../../shared/species.js'

const client = () => {
  const catches = demoCatches()
  return { arena: demoArena(catches), cle: entryKey(catches[0].source, catches[0].external_id) }
}

/**
 * La démo joue les duels avec le VRAI moteur — `resolveDuel`, celui dont la parité avec le SQL
 * est prouvée. Elle ne les imite pas : ce qu'on voit sans compte est ce qui se produirait avec.
 */
describe('arène en mode démo', () => {
  it('donne de quoi jouer sans compte', async () => {
    const { arena } = client()
    const etat = await arena.readArena()
    expect(etat.credits).toBeGreaterThan(0)
    expect(await arena.readOpenChallenges()).not.toHaveLength(0)
  })

  it('n’expose jamais la mise d’un défi ouvert', async () => {
    const { arena } = client()
    for (const d of await arena.readOpenChallenges()) {
      expect(Object.keys(d)).not.toContain('rival')
      expect(Object.keys(d)).not.toContain('challenger_key')
    }
  })

  it('résout un duel contre l’ordinateur et le rend lisible', async () => {
    const { arena, cle } = client()
    const duel = await arena.readDuel(await arena.engage(cle, true))
    expect(duel.status).toBe('computer')
    expect(duel.challenger_species).toBe(DEX[duel.challenger_species].id)
    expect(Number(duel.probability)).toBeGreaterThanOrEqual(0.10)
    expect(Number(duel.probability)).toBeLessThanOrEqual(0.90)
  })

  it('consomme un engagement à chaque duel', async () => {
    const { arena, cle } = client()
    const avant = (await arena.readArena()).credits
    await arena.engage(cle, true)
    expect((await arena.readArena()).credits).toBe(avant - 1)
  })

  // L'ordinateur ne possède rien : il ne détruit aucun exemplaire, même quand il gagne.
  it('ne détruit jamais d’exemplaire contre l’ordinateur', async () => {
    const { arena, cle } = client()
    await arena.engage(cle, true)
    const etat = await arena.readArena()
    expect(etat.exemplars.filter((e) => e.destroyed_at)).toHaveLength(0)
  })

  it('retire le défi relevé de la liste', async () => {
    const { arena, cle } = client()
    const [defi] = await arena.readOpenChallenges()
    await arena.accept(defi.id, cle)
    const restants = await arena.readOpenChallenges()
    expect(restants.map((d) => d.id)).not.toContain(defi.id)
  })

  it('rend un duel humain avec les deux camps renseignés', async () => {
    const { arena, cle } = client()
    const [defi] = await arena.readOpenChallenges()
    const duel = await arena.readDuel(await arena.accept(defi.id, cle))
    expect(duel.status).toBe('resolved')
    expect(duel.opponent_id).toBe(defi.challenger_id)
    expect(duel.challenger_species).toBeGreaterThan(0)
    expect(duel.opponent_species).toBeGreaterThan(0)
    expect(['c', 'u', 'r', 'l']).toContain(duel.stake_tier)
  })
})
