// Réexporté depuis species.js, où vit désormais l'ordre des paliers, pour ne casser aucun
// import existant : l'enjeu d'un duel s'en sert autant que la grille.
export { TIER_ORDER } from './species.js'
import { TIER_ORDER, DEX } from './species.js'
import { LEVEL_MAX } from './battle.js'

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
  const mois = d.getMonth() + 1
  // Janvier appartient à la saison ouverte en décembre : elle garde le nom de son mois de
  // départ, et donc l'année précédente. `|| 6` attrape ce seul cas — pour tous les autres mois
  // la division entière tombe déjà sur le bon numéro.
  const numero = Math.floor(mois / 2) || 6
  return `${mois === 1 ? d.getFullYear() - 1 : d.getFullYear()}-S${numero}`
}

/**
 * La première saison, et la seule date qui compte : l'arène ouvre avec elle.
 *
 * Le découpage des saisons est un calcul sur le calendrier, pas une date de lancement — la mise
 * en service tomberait donc au milieu d'une saison déjà entamée, dont il ne resterait que
 * quelques jours. Plutôt que de faire jouer une saison tronquée qui ne vaudrait pas les
 * suivantes, l'arène reste fermée jusqu'au premier jour de celle-ci. La saison 1 est alors une
 * saison entière, comme toutes celles qui suivront.
 *
 * C'est précisément ce qui a fait décaler le découpage d'un mois. Calé sur les mois impairs, il
 * n'offrait après le report du lancement que des départs au 1er novembre — en pleines vacances
 * de la seule personne qui tient le projet — ou au 1er janvier. Décalé, il ouvre au 1er décembre
 * et la saison 1 se joue entière, du 1er décembre 2026 au 31 janvier 2027.
 *
 * Écrite ici ET dans `arena_first_season` côté SQL, avec un test de parité qui les aligne.
 */
export const FIRST_SEASON = '2026-S6'

/**
 * L'arène est-elle ouverte ? Avant, ses écrans annoncent sa venue ; après, plus rien ne
 * distingue la première saison des autres.
 */

/**
 * Les bornes d'une saison, déduites de son seul nom : `2026-S4` couvre août et septembre 2026,
 * et `2026-S6` décembre 2026 et janvier 2027.
 *
 * Rien n'est stocké en base pour ça, et rien ne doit l'être — une date de début consignée
 * pourrait diverger du découpage qui, lui, est un calcul. La règle est déjà écrite deux fois,
 * ici et en SQL ; l'écrire une troisième fois en données inviterait la contradiction.
 *
 * La fin est le dernier instant de la saison et non le premier de la suivante : `30 septembre
 * 23 h 59 m 59 s` se lit et s'affiche, `1er octobre 00 h 00` ferait dire à l'écran qu'il reste
 * un jour de plus qu'en réalité.
 */
export function seasonBounds(season) {
  const [annee, numero] = season.split('-S').map(Number)
  // Le mois de départ est `numero * 2` en base 1, soit `numero * 2 - 1` en base 0. La saison 6
  // part donc de décembre et finit en janvier : `new Date(annee, 13, 0)` déborde sur l'année
  // suivante, ce que le constructeur fait proprement — inutile de traiter ce cas à part.
  const debut = new Date(annee, numero * 2 - 1, 1)
  const fin = new Date(annee, numero * 2 + 1, 0, 23, 59, 59, 999)
  return { start: debut, end: fin }
}

/**
 * Ce qu'il reste à jouer, en jours entiers. Le jour courant compte : à 8 h du matin le dernier
 * jour, il reste bien un jour pour engager, pas zéro.
 */
/**
 * Le NUMÉRO d'une saison, compté depuis la première. `2026-S6` est la saison 1, `2027-S1` la 2.
 *
 * Le code `AAAA-SN` reste la clé en base — il se trie, se calcule et ne dépend d'aucune
 * convention — mais il ne dit rien à personne. Un joueur retient « la saison 3 », pas
 * « 2027-S1 ». Les saisons antérieures au lancement rendent 0 : elles n'ont pas de numéro
 * puisqu'elles n'ont pas eu lieu.
 */
export function seasonNumber(season) {
  const rang = (code) => {
    const [annee, numero] = String(code).split('-S').map(Number)
    return Number.isInteger(annee) && Number.isInteger(numero) ? annee * 6 + numero : NaN
  }
  const n = rang(season) - rang(FIRST_SEASON) + 1
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** « Saison 3 » quand elle en est une, son code sinon — mieux vaut un code qu'un vide. */
export const seasonLabel = (season) => {
  const n = seasonNumber(season)
  return n ? `Saison ${n}` : String(season)
}

export const arenaOpensAt = () => seasonBounds(FIRST_SEASON).start
export const arenaIsOpen = (now = new Date()) => now >= arenaOpensAt()

export function daysLeftInSeason(season, now = new Date()) {
  const { end } = seasonBounds(season)
  return Math.max(0, Math.ceil((end - now) / 86_400_000))
}

/**
 * La revente d'un exemplaire en trop.
 *
 * Un tirage donne trois bonbons ET un exemplaire, indépendamment : les bonbons sont encaissés au
 * tirage, et une évolution ne consomme qu'un exemplaire, pas la pile. Le surplus est donc du
 * poids mort — et l'arène ne l'absorbe pas : engager quinze exemplaires l'un après l'autre est
 * une corvée, pas un usage.
 *
 * La base est ancrée sur la BOUTIQUE, à peu près 4 % du pli du même palier, arrondie à des
 * chiffres qui se lisent. L'ancrage n'est pas décoratif : c'est lui qui donne les trois
 * invariants que `arena-economy.test.js` vérifie plutôt que de les laisser à l'intuition.
 *
 *   1. Jouer rapporte le double de vendre. Un exemplaire au niveau maximum vaut exactement la
 *      moitié du gain d'une victoire de son palier.
 *   2. Racheter ne rembourse jamais le pli. Une carte se revend entre 4 % et 10 % de ce qu'a
 *      coûté le pli qui l'a produite : le va-et-vient boutique → revente perd 90 % au mieux.
 *   3. Le palier prime sur le niveau. Le multiplicateur plafonne à ×2,5, et l'écart le plus
 *      serré entre deux paliers est de ×2,5 lui aussi.
 */
export const SALE_BASE = { c: 10, u: 20, r: 50, l: 180 }

/** La Gen 2 coûte le double en boutique. Elle se revend le double : même rapport, même échelle. */
const SALE_GEN_FACTOR = { 1: 1, 2: 2 }

export const SALE_SHINY_FACTOR = 4

/**
 * Le prix d'un exemplaire précis. Le niveau est borné plutôt que cru : une valeur aberrante
 * venue d'une donnée douteuse ne doit pas produire un prix aberrant.
 *
 * Écrite ici ET dans `public.dex_sale_price` côté SQL — le serveur débite, le front affiche
 * avant de cliquer — avec un test de parité qui les aligne, comme pour `fnv1a`, les saisons et
 * la résolution des duels.
 */
export function salePrice(species, level = 1, shiny = false) {
  const espece = DEX[species]
  // Échec bruyant : une espèce inconnue vaudrait 0 en silence, et la vente passerait pour nulle
  // au lieu de signaler la donnée cassée.
  if (!espece) throw new Error(`espèce inconnue : ${species}`)

  const base = SALE_BASE[espece.tier] * SALE_GEN_FACTOR[espece.gen]
  const niveau = Math.min(LEVEL_MAX, Math.max(1, Math.trunc(level) || 1))
  return Math.round(base * (1 + (niveau - 1) / 6) * (shiny ? SALE_SHINY_FACTOR : 1))
}
