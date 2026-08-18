import { describe, it, expect } from 'vitest'
import { demoCatches, demoArena, loadDemoClient } from './demo.js'
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
    expect(Number(duel.probability)).toBeGreaterThanOrEqual(0.05)
    expect(Number(duel.probability)).toBeLessThanOrEqual(0.95)
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

/**
 * Un achat qui ne se voit pas ne s'essaie pas. En production le pli attend le passage de la
 * collecte ; en démo il rejoint la file d'ouverture sur-le-champ — faire patienter quelqu'un
 * qui découvre le jeu sans compte n'apprendrait rien à personne.
 */
describe('achats en mode démo', () => {
  const client = () => loadDemoClient()

  it('donne de quoi essayer tous les articles', async () => {
    const plusCher = Math.max(...(await client().readShop()).map((a) => a.price))
    expect((await client().readArena()).pokedollars).toBeGreaterThanOrEqual(plusCher)
  })

  it('débite et dépose le pli dans la file d’ouverture', async () => {
    const c = client()
    const avant = (await c.readCatches()).length
    const solde = (await c.readArena()).pokedollars

    const id = await c.buy('gen1-r')

    const apres = await c.readCatches()
    expect(apres).toHaveLength(avant + 1)
    expect((await c.readArena()).pokedollars).toBeLessThan(solde)

    // Non réclamé : il doit s'ouvrir comme une PR fraîchement mergée, pas apparaître tout ouvert.
    const etat = await c.readState()
    expect(etat.state.claimed).not.toContain(`boutique:${id}`)
  })

  it('tire dans la génération achetée', async () => {
    const c = client()
    await c.buy('gen2-c')
    const dernier = (await c.readCatches()).at(-1)
    expect(dernier.species).toBeGreaterThan(151)
    expect(DEX[dernier.species].tier).toBe('c')
  })

  it('refuse un achat hors budget sans rien déposer', async () => {
    const c = client()
    for (let i = 0; i < 3; i++) await c.buy('gen1-l-inedit').catch(() => {})
    const avant = (await c.readCatches()).length
    await expect(c.buy('gen1-l-inedit')).rejects.toThrow(/il manque/)
    expect(await c.readCatches()).toHaveLength(avant)
  })
})

/**
 * Le piège qui a rendu un achat invisible : le client rendait le tableau qu'il mutait, donc
 * `catches.value = c` reposait la même référence et Vue ne réagissait pas. Le pli était bien
 * là, dans un écran qui ne se redessinait jamais.
 */
describe('lectures du client démo', () => {
  it('rend une charge neuve à chaque lecture', async () => {
    const c = loadDemoClient()
    expect(await c.readCatches()).not.toBe(await c.readCatches())
  })

  it('ne laisse pas muter sa collection depuis l’extérieur', async () => {
    const c = loadDemoClient()
    const lu = await c.readCatches()
    lu.push({ source: 'pirate' })
    lu[0].species = 999
    const relu = await c.readCatches()
    expect(relu).toHaveLength(lu.length - 1)
    expect(relu[0].species).not.toBe(999)
  })
})
