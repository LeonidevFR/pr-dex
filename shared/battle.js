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

/**
 * Seuils croissants sur le rapport adversaire / soi. Écraser un adversaire faible ne fait
 * jamais progresser : c'est ce qui rend le farming des petits joueurs stérile, sans qu'une
 * règle ait besoin de l'interdire.
 */
const LEVEL_GAIN_STEPS = [[0.75, 0], [1.10, 1], [1.50, 2], [2.00, 3]]

export function levelGain(mine, theirs) {
  const rapport = theirs / mine
  for (const [seuil, gain] of LEVEL_GAIN_STEPS) if (rapport < seuil) return gain
  return 5
}

/**
 * Le seul aléa du duel, dérivé du seed comme l'est le tirage. Un duel est donc rejouable :
 * le client peut recalculer ce que le serveur a écrit, et le résumé de combat n'est pas une
 * affirmation à croire sur parole.
 */
const roll = (seed) => fnv1a(`${seed}:issue`) / 2 ** 32

export function resolveDuel({ left, right, seed }) {
  const pg = power(left)
  const pd = power(right)
  const probability = winProbability(pg, pd)
  const tirage = roll(seed)
  const gaucheGagne = tirage < probability

  const [vainqueur, perdant] = gaucheGagne ? [left, right] : [right, left]
  const [pv, pp] = gaucheGagne ? [pg, pd] : [pd, pg]
  const gain = levelGain(pv, pp)

  return {
    winner: gaucheGagne ? 'left' : 'right',
    probability,
    roll: tirage,
    left: { power: pg, level: left.level ?? 1, form: left.form ?? NORMAL_FORM },
    right: { power: pd, level: right.level ?? 1, form: right.form ?? NORMAL_FORM },
    gain,
    levelAfter: Math.min(LEVEL_MAX, (vainqueur.level ?? 1) + gain),
  }
}
