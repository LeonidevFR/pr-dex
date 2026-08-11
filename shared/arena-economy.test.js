import { describe, it, expect } from 'vitest'
import {
  TIER_ORDER, coveredTier, REWARD, COMPUTER_REWARD, SHOP, FRESH_MULTIPLIER,
  SEASON_PODIUM, SEASON_INCOME, CREDIT_PER_WORKING_DAY, CREDIT_CAP, PAIR_WEEKLY_CAP,
  CHALLENGE_EXPIRY_HOURS,
} from './arena-economy.js'

describe('coveredTier', () => {
  it('rend le palier commun quand les deux camps engagent un commun', () => {
    expect(coveredTier('c', 'c')).toBe('c')
  })

  // On ne gagne pas plus que ce que l'adversaire a engagé : c'est ce qui interdit à la fois
  // d'écraser un Roucool avec un légendaire et de venir en Roucool pour rafler gros.
  it('rend le plus petit des deux paliers', () => {
    expect(coveredTier('l', 'c')).toBe('c')
    expect(coveredTier('c', 'l')).toBe('c')
    expect(coveredTier('r', 'u')).toBe('u')
    expect(coveredTier('u', 'r')).toBe('u')
  })

  it('est commutatif sur toutes les paires', () => {
    for (const a of TIER_ORDER) for (const b of TIER_ORDER) {
      expect(coveredTier(a, b)).toBe(coveredTier(b, a))
    }
  })
})

describe('gains', () => {
  it('couvre les quatre paliers, strictement croissants', () => {
    const dollars = TIER_ORDER.map((t) => REWARD[t].dollars)
    const points = TIER_ORDER.map((t) => REWARD[t].points)
    expect(dollars).toEqual([50, 100, 250, 600])
    expect(points).toEqual([5, 10, 25, 60])
  })

  // Mesuré avant écriture : à demi-tarif, farmer l'ordinateur rapportait 2 750 $ par saison
  // SANS AUCUN RISQUE, contre 5 406 $ en duels réels — l'option sûre devenait presque aussi
  // rentable que l'option risquée. Le quart la ramène à 21 %.
  it('paye l’ordinateur au quart du tarif humain, en pokédollars seulement', () => {
    expect(COMPUTER_REWARD).toEqual({ c: 12, u: 25, r: 62, l: 150 })
    for (const t of TIER_ORDER) expect(COMPUTER_REWARD[t]).toBeLessThan(REWARD[t].dollars / 3)
  })
})

describe('boutique', () => {
  it('vend les trois paliers de chaque génération, plus le légendaire', () => {
    expect(SHOP.filter((a) => !a.fresh)).toHaveLength(7)
  })

  it('propose chaque article aussi en inédit garanti, à 2,5 fois le prix', () => {
    for (const normal of SHOP.filter((a) => !a.fresh)) {
      const inedit = SHOP.find((a) => a.fresh && a.gen === normal.gen && a.tier === normal.tier)
      expect(inedit.price).toBe(normal.price * FRESH_MULTIPLIER)
    }
  })

  it('vend la Gen 2 deux fois le prix de la Gen 1 à palier égal', () => {
    for (const tier of ['c', 'u', 'r']) {
      const g1 = SHOP.find((a) => !a.fresh && a.gen === 1 && a.tier === tier)
      const g2 = SHOP.find((a) => !a.fresh && a.gen === 2 && a.tier === tier)
      expect(g2.price).toBe(g1.price * 2)
    }
  })

  // Le dernier objectif du jeu doit rester à plusieurs saisons de distance, sans quoi il n'y
  // a plus rien à viser passé six mois — mais pas au point d'être hors d'atteinte.
  it('place le légendaire inédit entre trois et quatre saisons d’économies', () => {
    const legendaire = SHOP.find((a) => a.fresh && a.tier === 'l')
    expect(legendaire.price / SEASON_INCOME).toBeGreaterThan(3)
    expect(legendaire.price / SEASON_INCOME).toBeLessThan(4)
  })

  it('ne produit que des prix entiers, inédit garanti compris', () => {
    for (const article of SHOP) expect(Number.isInteger(article.price)).toBe(true)
  })
})

describe('plafonds de jeu', () => {
  it('reprend les valeurs de la spec', () => {
    expect(CREDIT_PER_WORKING_DAY).toBe(1)
    expect(CREDIT_CAP).toBe(5)
    expect(PAIR_WEEKLY_CAP).toBe(2)
    expect(CHALLENGE_EXPIRY_HOURS).toBe(24)
    expect(SEASON_PODIUM).toEqual([1000, 500, 250])
  })
})
