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

const BASE_PRICES = [
  { gen: 1, tier: 'c', price: 500 },
  { gen: 1, tier: 'u', price: 1000 },
  { gen: 1, tier: 'r', price: 2500 },
  { gen: 2, tier: 'c', price: 1000 },
  { gen: 2, tier: 'u', price: 2000 },
  { gen: 2, tier: 'r', price: 5000 },
  { gen: 1, tier: 'l', price: 6000 },
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

export const SEASON_PODIUM = [2500, 1250, 600]

export const CREDIT_PER_WORKING_DAY = 1
export const CREDIT_CAP = 5
export const PAIR_WEEKLY_CAP = 2
export const CHALLENGE_EXPIRY_HOURS = 24
