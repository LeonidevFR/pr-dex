import { DEX } from './species.js'
import { STATS } from './species-stats.js'
import { fnv1a } from './draw.js'

/**
 * Le palier ne fait que nuancer sur les trois premiers : la mesure des stats par palier
 * (spec § 3) montre que la rareté est déjà largement portée par les stats elles-mêmes, et un
 * coefficient lourd la compterait deux fois. Le coefficient appuie la frontière peu commun /
 * rare, où les deux paliers se chevauchent lourdement.
 *
 * Le légendaire est l'exception, et elle est mesurée : son pool va de 580 à 680 quand le pool
 * rare monte à 600 — les stats seules ne séparent donc pas ces deux paliers. À 1,25, un
 * légendaire frais ne battait le meilleur rare que 54 % du temps ; à 1,45 il le bat 64 % du
 * temps et écrase un rare moyen à 80 %, sans jamais devenir intouchable puisque le bornage à
 * 90 % continue de garantir sa mortalité.
 */
export const TIER_POWER = { c: 1.00, u: 1.06, r: 1.15, l: 1.45 }

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
 *
 * La chaîne hachée est un CONTRAT : la spec § 6 prévoit que cette logique vive en double,
 * ici et en SQL, avec un test de parité. Elle doit être répliquée caractère pour caractère
 * côté SQL — un deux-points de différence donne une autre forme pour le même exemplaire.
 */
export const formOf = (key, day) => FORMS[fnv1a(`${key}:forme:${day}`) % FORMS.length]

export const levelFactor = (level) => 1 + 0.05 * (level - 1)

export function power({ species, level = 1, form = NORMAL_FORM }) {
  // Échec bruyant : un `NaN` remonterait jusqu'à `levelGain`, où toutes les comparaisons
  // avec `NaN` sont fausses — il y rendrait donc 5, le gain maximal.
  if (!DEX[species] || !STATS[species]) throw new Error(`espèce inconnue : ${species}`)
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
  const raw = a ** 3 / (a ** 3 + b ** 3)
  return Math.min(P_CEIL, Math.max(P_FLOOR, raw))
}

/**
 * Seuils croissants sur le rapport adversaire / soi. Écraser un adversaire faible ne fait
 * jamais progresser : c'est ce qui rend le farming des petits joueurs stérile, sans qu'une
 * règle ait besoin de l'interdire.
 */
const LEVEL_GAIN_STEPS = [[0.75, 0], [1.10, 1], [1.50, 2], [2.00, 3]]

export function levelGain(mine, theirs) {
  const ratio = theirs / mine
  for (const [threshold, gain] of LEVEL_GAIN_STEPS) if (ratio < threshold) return gain
  return 5
}

/**
 * Le seul aléa du duel, dérivé du seed comme l'est le tirage. Un duel est donc rejouable :
 * le client peut recalculer ce que le serveur a écrit, et le résumé de combat n'est pas une
 * affirmation à croire sur parole.
 */
const roll = (seed) => fnv1a(`${seed}:issue`) / 2 ** 32

/**
 * Ordre canonique du duel, dérivé du seul contenu des deux exemplaires. La clé d'exemplaire
 * (`source:external_id`, voir `entry.js`) vient en tête parce qu'elle est la seule des quatre
 * composantes à être unique : espèce, niveau et forme laissent ex æquo deux exemplaires
 * jumeaux — ce qui arrive dès que deux joueurs engagent la même espèce au même niveau, avec
 * la même forme du jour une fois sur cinq — et le vainqueur redevient alors fonction de la
 * place des arguments.
 *
 * La RPC du lot 2 DOIT toujours fournir `key` pour les deux camps. Sans elle, le champ est
 * absent, la clé retombe sur les trois critères historiques et les jumeaux sont de nouveau
 * départagés par l'ordre d'appel. Le champ reste optionnel parce que la simulation, qui ne
 * manipule pas d'exemplaires réels, n'en a pas.
 */
const sortKey = ({ key = '', species, level = 1, form = NORMAL_FORM }) =>
  `${key}:${species}:${level}:${form.slug}`

export function resolveDuel({ left, right, seed }) {
  const leftPower = power(left)
  const rightPower = power(right)
  const probability = winProbability(leftPower, rightPower)
  const draw = roll(seed)

  // Le tirage est confronté au camp canoniquement premier et non à `left` : sans cela,
  // échanger les deux arguments à seed égal changerait le vainqueur près d'une fois sur
  // trois. Or le serveur résout un duel challenger / preneur et le client le rejoue dans
  // l'ordre qui l'arrange — les deux doivent retomber sur le même exemplaire.
  const leftFirst = sortKey(left) <= sortKey(right)
  const firstWins = leftFirst
    ? draw < probability
    : draw < winProbability(rightPower, leftPower)
  const leftWins = leftFirst ? firstWins : !firstWins

  const winner = leftWins ? left : right
  const [winnerPower, loserPower] = leftWins ? [leftPower, rightPower] : [rightPower, leftPower]
  const gain = levelGain(winnerPower, loserPower)

  return {
    winner: leftWins ? 'left' : 'right',
    probability,
    roll: draw,
    left: { power: leftPower, level: left.level ?? 1, form: left.form ?? NORMAL_FORM },
    right: { power: rightPower, level: right.level ?? 1, form: right.form ?? NORMAL_FORM },
    gain,
    levelAfter: Math.min(LEVEL_MAX, (winner.level ?? 1) + gain),
  }
}
