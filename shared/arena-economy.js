// Réexporté depuis species.js, où vit désormais l'ordre des paliers, pour ne casser aucun
// import existant : l'enjeu d'un duel s'en sert autant que la grille.
export { TIER_ORDER } from './species.js'
import { TIER_ORDER } from './species.js'

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
 * payer. Au cinquième du tarif humain, et au palier de l'ENJEU — `coveredTier` de sa mise et
 * de celle du joueur — comme contre un humain.
 *
 * Le quart avait été retenu quand le gain suivait la seule mise du joueur : engager plus
 * haut payait alors davantage sans contrepartie, seul endroit du modèle où c'était le cas.
 * Mesuré dans cette configuration, farmer l'ordinateur rapportait 1 176 $ par saison sans le
 * moindre risque, contre un seuil de 1 384 $ (la moitié d'une saison en politique rare) :
 * l'option sûre frôlait la moitié de l'option risquée.
 */
export const COMPUTER_REWARD = { c: 10, u: 20, r: 50, l: 120 }

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

/**
 * La saison d'une date, au même format que la fonction SQL `arena_season` : deux mois de
 * calendrier, bornes fixes. Dupliquée ici parce que le front doit savoir quelle saison lire
 * sans faire un aller-retour pour le demander — et un test de parité l'aligne sur le SQL.
 */
export function seasonOf(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-S${Math.ceil((d.getMonth() + 1) / 2)}`
}

/**
 * La première saison qui compte pour de bon.
 *
 * Le découpage des saisons est un calcul sur le calendrier, pas une date de lancement : la mise
 * en service tombe au milieu d'une saison déjà commencée. Celles d'avant se jouent et marquent
 * des points, mais ne se ferment jamais et ne décernent rien — un rodage.
 *
 * Écrite ici ET dans `arena_first_season` côté SQL, avec un test de parité qui les aligne : le
 * front doit pouvoir dire « ça ne compte pas encore » sans demander l'avis du serveur.
 */
export const FIRST_SEASON = '2026-S5'

/**
 * Vrai tant que la saison ne décerne rien. Comparaison textuelle : le format `AAAA-SN` se trie
 * dans l'ordre chronologique tant que le numéro tient sur un chiffre, ce que six saisons par an
 * garantissent.
 */
export const isWarmup = (season) => String(season) < FIRST_SEASON

/**
 * Les bornes d'une saison, déduites de son seul nom : `2026-S4` couvre juillet et août 2026.
 *
 * Rien n'est stocké en base pour ça, et rien ne doit l'être — une date de début consignée
 * pourrait diverger du découpage qui, lui, est un calcul. La règle est déjà écrite deux fois,
 * ici et en SQL ; l'écrire une troisième fois en données inviterait la contradiction.
 *
 * La fin est le dernier instant de la saison et non le premier de la suivante : `31 août
 * 23 h 59 m 59 s` se lit et s'affiche, `1er septembre 00 h 00` ferait dire à l'écran qu'il
 * reste un jour de plus qu'en réalité.
 */
export function seasonBounds(season) {
  const [annee, numero] = season.split('-S').map(Number)
  const debut = new Date(annee, (numero - 1) * 2, 1)
  const fin = new Date(annee, numero * 2, 0, 23, 59, 59, 999)
  return { start: debut, end: fin }
}

/**
 * Ce qu'il reste à jouer, en jours entiers. Le jour courant compte : à 8 h du matin le dernier
 * jour, il reste bien un jour pour engager, pas zéro.
 */
export function daysLeftInSeason(season, now = new Date()) {
  const { end } = seasonBounds(season)
  return Math.max(0, Math.ceil((end - now) / 86_400_000))
}
