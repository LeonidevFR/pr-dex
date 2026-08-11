import { DEX } from './species.js'
import { STATS } from './species-stats.js'

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

export const levelFactor = (level) => 1 + 0.05 * (level - 1)

export function power({ species, level = 1, form = NORMAL_FORM }) {
  return STATS[species] * TIER_POWER[DEX[species].tier] * levelFactor(level) * form.factor
}
