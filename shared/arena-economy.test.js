import { describe, it, expect } from 'vitest'
import { LEVEL_MAX } from './battle.js'
import { coveredTier, REWARD, COMPUTER_REWARD, SHOP, FRESH_MULTIPLIER, SEASON_PODIUM, SEASON_INCOME, CREDIT_PER_WORKING_DAY, CREDIT_CAP, PAIR_WEEKLY_CAP, CHALLENGE_EXPIRY_HOURS, seasonOf, seasonBounds, daysLeftInSeason, FIRST_SEASON, arenaIsOpen, arenaOpensAt, seasonNumber, seasonLabel, salePrice, SALE_BASE } from './arena-economy.js'
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
    expect(start.getMonth()).toBe(7)   // août
    expect(start.getDate()).toBe(1)
    expect(end.getMonth()).toBe(8)     // septembre
    expect(end.getDate()).toBe(30)
  })

  it('place la première saison de l’année sur février et mars', () => {
    const { start, end } = seasonBounds('2027-S1')
    expect(start.getFullYear()).toBe(2027)
    expect(start.getMonth()).toBe(1)
    expect(end.getMonth()).toBe(2)
  })

  /**
   * La saison à cheval sur le Nouvel An, seule subtilité du découpage décalé : décembre et
   * janvier sont la MÊME saison, nommée par son mois de départ. Sans ça, deux mois de la même
   * saison tomberaient dans deux codes différents, et le classement se scinderait en plein jeu.
   */
  it('tient décembre et janvier dans une seule saison, nommée par son départ', () => {
    const { start, end } = seasonBounds('2026-S6')
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(11)  // décembre 2026
    expect(end.getFullYear()).toBe(2027)
    expect(end.getMonth()).toBe(0)     // janvier 2027
    expect(end.getDate()).toBe(31)

    expect(seasonOf(new Date(2026, 11, 20))).toBe('2026-S6')
    expect(seasonOf(new Date(2027, 0, 20))).toBe('2026-S6')
    expect(seasonOf(new Date(2027, 1, 1))).toBe('2027-S1')
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
    expect(daysLeftInSeason('2026-S4', new Date(2026, 8, 30, 8, 0))).toBe(1)
  })

  it('rend zéro une fois la saison passée', () => {
    expect(daysLeftInSeason('2026-S4', new Date(2026, 9, 1))).toBe(0)
  })

  // Février fait 28 ou 29 jours : la durée se déduit du calendrier, jamais d'un compte fixe.
  it('suit les années bissextiles', () => {
    expect(daysLeftInSeason('2028-S1', new Date(2028, 1, 1))).toBe(60)
    expect(daysLeftInSeason('2027-S1', new Date(2027, 1, 1))).toBe(59)
  })

  it('donne la durée entière au premier jour', () => {
    // Août et septembre : 61 jours.
    expect(daysLeftInSeason('2026-S4', new Date(2026, 7, 1, 0, 0))).toBe(61)
  })
})

/**
 * L'arène ouvre au premier jour de la saison 1, et pas avant. Les saisons se découpant sur le
 * calendrier, ouvrir en cours de route donnerait une première saison tronquée qui ne vaudrait
 * pas les suivantes — alors qu'elle décernerait les mêmes badges.
 */
describe('ouverture de l’arène', () => {
  it('ouvre le premier jour de la première saison, pas la veille', () => {
    expect(arenaIsOpen(new Date(2026, 10, 30, 23, 59))).toBe(false)
    expect(arenaIsOpen(new Date(2026, 11, 1, 0, 0))).toBe(true)
  })

  it('reste ouverte ensuite, saison après saison', () => {
    expect(arenaIsOpen(new Date(2027, 5, 1))).toBe(true)
  })

  // La date se déduit de la première saison : deux constantes se contrediraient un jour.
  it('déduit sa date de la première saison, sans la répéter', () => {
    expect(arenaOpensAt()).toEqual(seasonBounds(FIRST_SEASON).start)
  })
})


/**
 * Le code `AAAA-SN` reste la clé en base — il se trie, se calcule, ne dépend d'aucune
 * convention — mais il ne dit rien à personne. On retient « la saison 3 », pas « 2027-S1 ».
 */
describe('nom des saisons', () => {
  it('compte à partir de la première, qui est la 1', () => {
    expect(seasonNumber(FIRST_SEASON)).toBe(1)
    expect(seasonLabel(FIRST_SEASON)).toBe('Saison 1')
  })

  it('enchaîne d’une année sur l’autre sans repartir de zéro', () => {
    expect(seasonLabel('2027-S1')).toBe('Saison 2')
    expect(seasonLabel('2027-S2')).toBe('Saison 3')
    expect(seasonLabel('2027-S6')).toBe('Saison 7')
  })

  // Les saisons d'avant le lancement n'ont pas eu lieu : elles n'ont pas de numéro, et mieux
  // vaut montrer leur code qu'un vide ou un numéro négatif.
  it('ne numérote pas ce qui n’a pas eu lieu', () => {
    expect(seasonNumber('2026-S5')).toBe(0)
    expect(seasonLabel('2026-S5')).toBe('2026-S5')
  })

  it('ne rend jamais rien, même sur un code illisible', () => {
    expect(seasonLabel('nawak')).toBe('nawak')
  })
})

/**
 * Le prix de revente d'un exemplaire.
 *
 * Il n'est pas une intuition : il s'ancre sur la boutique, ce qui donne trois invariants qu'on
 * peut tester plutôt que débattre. Sans eux, la revente serait un robinet dont personne ne
 * connaîtrait le débit — et le premier joueur à s'en apercevoir grinderait les PR.
 */
describe('prix de revente', () => {
  const PLI_GEN1 = { c: 250, u: 500, r: 1200, l: 4500 }

  it('reprend la grille de la spec, palier par palier et niveau par niveau', () => {
    expect([1, 3, 5, 10].map((n) => salePrice(19, n))).toEqual([10, 13, 17, 25])       // Rattata, commun
    expect([1, 3, 5, 10].map((n) => salePrice(35, n))).toEqual([20, 27, 33, 50])       // Mélofée, peu commun
    expect([1, 3, 5, 10].map((n) => salePrice(1, n))).toEqual([50, 67, 83, 125])       // Bulbizarre, rare
    expect([1, 3, 5, 10].map((n) => salePrice(150, n))).toEqual([180, 240, 300, 450])  // Mewtwo, légendaire
  })

  /**
   * L'invariant le plus important : jouer doit toujours rapporter plus que vendre, sinon la
   * revente devient une stratégie de revenu et l'arène un décor.
   */
  it('plafonne à la moitié du gain d’une victoire, sur les trois premiers paliers', () => {
    for (const [espece, palier] of [[19, 'c'], [35, 'u'], [1, 'r']]) {
      expect(salePrice(espece, LEVEL_MAX)).toBe(REWARD[palier].dollars / 2)
    }
  })

  /**
   * Racheter ne doit jamais rembourser le pli. Énoncé en dixièmes, l'invariant se briserait sur
   * l'arrondi de la base rare (50 $ au lieu des 48 $ exacts) ; énoncé en NOMBRE DE CARTES, il dit
   * la même chose sans dépendre d'un arrondi, et il dit ce qui compte à qui voudrait grinder.
   */
  it('exige dix reventes au niveau maximum pour racheter un seul pli du même palier', () => {
    for (const [espece, palier] of [[19, 'c'], [35, 'u'], [1, 'r'], [150, 'l']]) {
      const cartes = Math.ceil(PLI_GEN1[palier] / salePrice(espece, LEVEL_MAX))
      expect(cartes).toBeGreaterThanOrEqual(10)
    }
  })

  // Le niveau est un multiplicateur borné, pas une échappatoire : dix victoires valent ×2,5.
  it('multiplie par deux et demi du niveau 1 au niveau 10, jamais plus', () => {
    for (const espece of [19, 35, 1, 150]) {
      expect(salePrice(espece, LEVEL_MAX)).toBe(Math.round(salePrice(espece, 1) * 2.5))
    }
  })

  // Le palier prime : un commun poussé à fond reste loin d'un rare tout neuf.
  it('laisse le palier primer sur le niveau', () => {
    expect(salePrice(19, LEVEL_MAX)).toBeLessThan(salePrice(1, 1))
    expect(salePrice(35, LEVEL_MAX)).toBeLessThanOrEqual(salePrice(1, 1))
  })

  // La Gen 2 coûte le double en boutique : elle se revend le double.
  it('vaut le double en Gen 2, comme en boutique', () => {
    expect(salePrice(152, 1)).toBe(salePrice(19, 1) * 2)   // Germignon, commun Gen 2
    expect(salePrice(249, 1)).toBe(salePrice(150, 1) * 2)  // Lugia, légendaire Gen 2
  })

  it('quadruple un shiny', () => {
    expect(salePrice(19, 1, true)).toBe(40)
    expect(salePrice(1, LEVEL_MAX, true)).toBe(500)
  })

  // Un niveau hors bornes est une donnée douteuse, pas une occasion de prix douteux.
  it('borne le niveau au lieu de suivre une valeur aberrante', () => {
    expect(salePrice(19, 0)).toBe(salePrice(19, 1))
    expect(salePrice(19, 99)).toBe(salePrice(19, LEVEL_MAX))
  })

  // Échec bruyant : une espèce inconnue vaudrait 0 en silence, et la vente passerait pour nulle.
  it('refuse une espèce inconnue plutôt que de rendre zéro', () => {
    expect(() => salePrice(9999, 1)).toThrow()
  })
})
