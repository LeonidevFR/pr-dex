export const TIER_ORDER = ['c', 'u', 'r', 'l']

/**
 * L'« enjeu du duel » : on ne gagne pas plus que ce que l'adversaire a engagé, comme au
 * poker. C'est la règle qui supprime d'un seul mouvement les deux stratégies dégénérées —
 * écraser un Roucool avec un légendaire, et venir en Roucool pour tenter l'exploit.
 */
export const coveredTier = (a, b) =>
  TIER_ORDER[Math.min(TIER_ORDER.indexOf(a), TIER_ORDER.indexOf(b))]

export const REWARD = {
  c: { dollars: 50, points: 5 },
  u: { dollars: 100, points: 10 },
  r: { dollars: 250, points: 25 },
  l: { dollars: 600, points: 60 },
}

/**
 * L’ordinateur ne possède rien : il ne peut ni détruire ni créer un exemplaire, seulement
 * payer. Au quart du tarif humain et non à la moitié — la simulation a montré qu'à
 * demi-tarif, farmer l'IA rapportait presque autant qu'une saison de duels réels, sans
 * jamais rien risquer.
 */
export const COMPUTER_REWARD = { c: 12, u: 25, r: 62, l: 150 }

export const FRESH_MULTIPLIER = 2.5

/**
 * Le revenu d'une saison en politique rare, tel que la simulation le MESURE — pas
 * l'hypothèse de 5 400 sur laquelle la première version des prix était calée, et qui
 * n'avait jamais été confrontée à une ligue où le terrain adverse est émergent. C'est donc
 * cette constante, et elle seule, qui doit bouger le jour où la simulation évolue : les prix
 * en dérivent, jamais l'inverse.
 */
export const SEASON_INCOME = 3000

/**
 * Le pli légendaire est ancré à 1,5 saison, et tout le reste s'échelonne sous lui. Les prix
 * dérivés (×2,5 pour l'inédit) tombent tous sur des entiers, condition d'un affichage sans
 * décimale et d'une comparaison exacte avec le portefeuille.
 */
const BASE_PRICES = [
  { gen: 1, tier: 'c', price: 250 },
  { gen: 1, tier: 'u', price: 500 },
  { gen: 1, tier: 'r', price: 1200 },
  { gen: 2, tier: 'c', price: 500 },
  { gen: 2, tier: 'u', price: 1000 },
  { gen: 2, tier: 'r', price: 2400 },
  { gen: 1, tier: 'l', price: 4500 },
]

/**
 * L'inédit garanti tire uniquement parmi les espèces non possédées. Il existe parce que
 * l'objectif de la boutique est de compléter : un pli rare tire parmi 46 espèces, donc
 * quand il en manque trois, on paye pour un doublon neuf fois sur dix.
 */
export const SHOP = BASE_PRICES.flatMap(({ gen, tier, price }) => [
  { slug: `gen${gen}-${tier}`, gen, tier, fresh: false, price },
  { slug: `gen${gen}-${tier}-inedit`, gen, tier, fresh: true, price: price * FRESH_MULTIPLIER },
])

/**
 * « De quoi fêter, pas de quoi dominer » (spec § 4). Le podium précédent avait été calé sur
 * une saison supposée à 5 400 : à 2 500, le vainqueur empochait 83 % d'une saison entière
 * de jeu en une seule remise, ce qui creusait un écart matériel saison après saison. Ramené
 * à un tiers de saison pour le premier, ces prix se lisent sur SEASON_INCOME.
 */
export const SEASON_PODIUM = [1000, 500, 250]

export const CREDIT_PER_WORKING_DAY = 1
export const CREDIT_CAP = 5
export const PAIR_WEEKLY_CAP = 2
export const CHALLENGE_EXPIRY_HOURS = 24
