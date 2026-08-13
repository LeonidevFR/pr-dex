import { describe, it, expect } from 'vitest'
import { coveredTier, REWARD, COMPUTER_REWARD, SHOP, FRESH_MULTIPLIER, SEASON_PODIUM, SEASON_INCOME, CREDIT_PER_WORKING_DAY, CREDIT_CAP, PAIR_WEEKLY_CAP, CHALLENGE_EXPIRY_HOURS, seasonOf, seasonBounds, daysLeftInSeason } from './arena-economy.js'
import { TIER_ORDER } from './species.js'

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

  // Mesuré : au quart, et avec un gain indexé sur la seule mise du joueur, farmer
  // l'ordinateur rapportait 1 176 $ par saison SANS AUCUN RISQUE contre un seuil de 1 384 $
  // — l'option sûre frôlait la moitié de l'option risquée. Le cinquième, combiné à un gain
  // qui suit désormais l'enjeu, la ramène à sa place d'entraînement rémunéré.
  it('paye l’ordinateur au cinquième exact du tarif humain, en pokédollars seulement', () => {
    expect(COMPUTER_REWARD).toEqual({ c: 10, u: 20, r: 50, l: 120 })
    for (const t of TIER_ORDER) expect(COMPUTER_REWARD[t]).toBe(REWARD[t].dollars / 5)
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

/**
 * Les bornes d'une saison se déduisent de son nom : deux mois de calendrier, rien de stocké.
 * Une date de début consignée en base pourrait diverger du découpage, qui est un calcul.
 */
describe('bornes de saison', () => {
  it('couvre les deux mois que son numéro désigne', () => {
    const { start, end } = seasonBounds('2026-S4')
    expect(start.getMonth()).toBe(6)   // juillet
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(7)     // août
    expect(end.getDate()).toBe(31)
  })

  it('place la première saison sur janvier et février', () => {
    const { start, end } = seasonBounds('2027-S1')
    expect(start.getFullYear()).toBe(2027)
    expect(start.getMonth()).toBe(0)
    expect(end.getMonth()).toBe(1)
  })

  // Février fait 28 ou 29 jours : la borne se déduit du calendrier, jamais d'un compte fixe.
  it('suit les années bissextiles', () => {
    expect(seasonBounds('2028-S1').end.getDate()).toBe(29)
    expect(seasonBounds('2027-S1').end.getDate()).toBe(28)
  })

  // La fin est le dernier instant de la saison, pas le premier de la suivante — sinon l'écran
  // annoncerait un jour de plus qu'il n'en reste.
  it('finit à la dernière seconde, et non au lendemain', () => {
    const { end } = seasonBounds('2026-S4')
    expect(end.getHours()).toBe(23)
    expect(seasonOf(end)).toBe('2026-S4')
  })

  it('se recoupe avec seasonOf sur toute une année', () => {
    for (let mois = 0; mois < 12; mois++) {
      const jour = new Date(2026, mois, 15)
      const { start, end } = seasonBounds(seasonOf(jour))
      expect(jour >= start && jour <= end).toBe(true)
    }
  })
})

describe('jours restants', () => {
  it('compte le jour courant, où l’on peut encore engager', () => {
    expect(daysLeftInSeason('2026-S4', new Date(2026, 7, 31, 8, 0))).toBe(1)
  })

  it('rend zéro une fois la saison passée', () => {
    expect(daysLeftInSeason('2026-S4', new Date(2026, 8, 1))).toBe(0)
  })

  it('donne la durée entière au premier jour', () => {
    // Juillet et août : 62 jours.
    expect(daysLeftInSeason('2026-S4', new Date(2026, 6, 1, 0, 0))).toBe(62)
  })
})
