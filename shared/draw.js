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
 * Seul le sha entre. Aucune métadonnée de PR — ni taille, ni type, ni heure, ni repo.
 * Règle produit : le système ne récompense ni le volume ni le travail nocturne.
 */
export function drawFromSha(sha) {
  const r = fnv1a(sha + ':tier') / 2 ** 32
  let acc = 0
  let tier = 'l'
  for (const [t, w] of WEIGHTS) {
    acc += w
    if (r < acc) { tier = t; break }
  }
  const pool = POOL[tier]
  return {
    species: pool[fnv1a(sha + ':pick') % pool.length],
    shiny: fnv1a(sha + ':shiny') % SHINY_ODDS === 0,
  }
}
