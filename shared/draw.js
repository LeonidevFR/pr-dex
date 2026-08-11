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
  const pool = POOL[tier]
  if (!pool?.length) throw new Error(`palier inconnu : ${tier}`)
  return {
    species: pool[fnv1a(seed + ':pick') % pool.length],
    shiny: fnv1a(seed + ':shiny') % SHINY_ODDS === 0,
  }
}
