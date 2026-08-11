import { DEX } from './species.js'
import { STATS } from './species-stats.js'
import { fnv1a } from './draw.js'

/**
 * Le palier ne fait que nuancer : la mesure des stats par palier (spec § 3) montre que la
 * rareté est déjà largement portée par les stats elles-mêmes. Le coefficient appuie surtout
 * la frontière peu commun / rare, où les deux paliers se chevauchent lourdement.
 */
export const TIER_POWER = { c: 1.00, u: 1.06, r: 1.15, l: 1.25 }

export const LEVEL_MAX = 10

export const FORMS = [
  { slug: 'epuise', name: 'Épuisé', factor: 0.90 },
  { slug: 'fatigue', name: 'Fatigué', factor: 0.95 },
  { slug: 'normal', name: 'Normal', factor: 1.00 },
  { slug: 'en-forme', name: 'En forme', factor: 1.05 },
  { slug: 'pleine-forme', name: 'En pleine forme', factor: 1.10 },
]

export const NORMAL_FORM = FORMS.find((f) => f.factor === 1)

/**
 * Calculée, jamais stockée : une fonction pure de la clé d'exemplaire et du jour, sur le
 * modèle du tirage. Aucune table, aucune écriture, impossible à retirer en rafraîchissant
 * la page, et le serveur comme le client arrivent au même résultat sans se parler.
 */
export const formOf = (key, day) => FORMS[fnv1a(`${key}:forme:${day}`) % FORMS.length]

export const levelFactor = (level) => 1 + 0.05 * (level - 1)

export function power({ species, level = 1, form = NORMAL_FORM }) {
  return STATS[species] * TIER_POWER[DEX[species].tier] * levelFactor(level) * form.factor
}

/**
 * Le bornage fait à lui seul trois choses : aucun combat n'est gagné d'avance, l'exploit
 * existe sans règle dédiée, et tout légendaire descendu régulièrement finit par tomber
 * (espérance de vie ≈ 10 duels). C'est le curseur principal de l'équilibrage du mode.
 */
export const P_FLOOR = 0.10
export const P_CEIL = 0.90

/**
 * Élévation au cube et non rapport direct : un rapport direct laisserait un Rattata battre
 * Électhor près d'une fois sur trois, ce que l'écart de stats ne justifie pas.
 */
export function winProbability(a, b) {
  const brut = a ** 3 / (a ** 3 + b ** 3)
  return Math.min(P_CEIL, Math.max(P_FLOOR, brut))
}
