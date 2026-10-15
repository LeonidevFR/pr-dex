import { POOL } from './species.js'

export const WEIGHTS = [['c', 0.45], ['u', 0.42], ['r', 0.125], ['l', 0.005]]
export const SHINY_ODDS = 128

/** FNV-1a 32 bits. `Math.imul` garantit la multiplication 32 bits, identique en Node et navigateur. */
export function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Seul le seed entre — la clé d'exemplaire (`entryKey`), rien d'autre. Aucune métadonnée de
 * l'événement source : ni taille, ni type, ni heure, ni dépôt, ni note obtenue. Règle
 * produit, valable pour toute source : un pôle déclare quel acte vaut un tirage, il ne
 * déclare pas ce que vaut un tirage.
 */
export function drawFrom(seed) {
  const r = fnv1a(seed + ':tier') / 2 ** 32
  let acc = 0
  let tier = 'l'
  for (const [t, w] of WEIGHTS) {
    acc += w
    if (r < acc) { tier = t; break }
  }
  return drawInTier(seed, tier)
}

/**
 * Le même tirage, mais dans un palier imposé. Sert aux plis dont le palier ne se joue pas au
 * hasard : celui gagné en arène vaut l'enjeu du duel, celui acheté en boutique vaut ce qu'on
 * a payé.
 *
 * L'espèce et le chromatique se tirent exactement comme ailleurs, sur les mêmes suffixes de
 * seed — un pli d'arène n'a pas de meilleures chances qu'un pli de travail, il a seulement
 * son palier décidé d'avance. C'est ce qui permet à l'arène de récompenser sans jamais
 * toucher aux cotes, la règle que `drawFrom` protège depuis le premier jour.
 */
export function drawInTier(seed, tier) {
  if (!POOL[tier]?.length) throw new Error(`palier inconnu : ${tier}`)
  return drawFromPool(seed, POOL[tier])
}

/**
 * Le même tirage dans un ensemble d'espèces imposé. C'est ce qui permet à la boutique de vendre
 * un pli d'une génération précise, ou un pli « inédit garanti » qui ne tire que parmi les
 * espèces qu'on ne possède pas encore.
 *
 * Les suffixes de seed ne changent pas : un pli acheté n'a pas de meilleures chances d'être
 * chromatique qu'un pli mérité. Seul l'ensemble dans lequel on pioche est restreint.
 */
export function drawFromPool(seed, ids) {
  if (!ids?.length) throw new Error('tirage dans un ensemble vide')
  return {
    species: ids[fnv1a(seed + ':pick') % ids.length],
    shiny: fnv1a(seed + ':shiny') % SHINY_ODDS === 0,
  }
}
