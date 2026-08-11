import { POOL, DEX } from '../shared/species.js'
import { fnv1a } from '../shared/draw.js'
import { formOf, resolveDuel } from '../shared/battle.js'
import { coveredTier, REWARD, HOUSE_REWARD } from '../shared/arena-economy.js'

const DUELS_PER_WEEK = 5
const POLICY_TIER = { commun: 'c', 'peu-commun': 'u', rare: 'r', legendaire: 'l' }

/** Espèce tirée dans le pool d'un palier, de façon reproductible depuis un seed. */
const pickSpecies = (tier, seed) => POOL[tier][fnv1a(seed) % POOL[tier].length]

/**
 * Le terrain adverse joue la MÊME politique que le joueur, et son champion monte en niveau
 * comme le sien. C'est la seule façon de mesurer un taux de victoire non biaisé : une
 * première version faisait jouer au joueur des exemplaires toujours neufs face à des
 * vétérans, ce qui écrasait tous les taux à 43 % et faisait conclure à tort que le rare ne
 * s'autofinançait pas.
 *
 * Chaque camp remplace son exemplaire détruit par un frais de niveau 1 — ce que fait un
 * vrai joueur, qui repart de sa réserve.
 */
export function simulateSeason({ policy, weeks, seed }) {
  const duels = Math.round(weeks * DUELS_PER_WEEK)
  const mien = POLICY_TIER[policy] ?? 'r'
  let dollars = 0
  let points = 0
  let plis = 0
  let lost = 0
  let wins = 0

  let moi = { species: pickSpecies(mien, `${seed}:m0`), level: 1 }
  let lui = { species: pickSpecies(mien, `${seed}:a0`), level: 1 }

  for (let i = 0; i < duels; i++) {
    const s = `${seed}:${i}`
    const gauche = { ...moi, form: formOf(`${s}:moi`, 'jour') }
    const droite = { ...lui, form: formOf(`${s}:adv`, 'jour') }

    if (policy === 'maison') {
      // Contre la maison, rien n'est détruit ni créé : seulement des pokédollars, au quart
      // du tarif humain et au palier de sa propre mise. Aucun point, donc une saison entière
      // en solo ne fait pas monter au classement — par construction.
      if (resolveDuel({ left: gauche, right: droite, seed: s }).winner === 'left') {
        dollars += HOUSE_REWARD[mien]
        wins++
      }
      lui = { species: pickSpecies(mien, `${s}:adv`), level: 1 + (fnv1a(`${s}:niveau`) % 4) }
      continue
    }

    const enjeu = coveredTier(DEX[moi.species].tier, DEX[lui.species].tier)
    const issue = resolveDuel({ left: gauche, right: droite, seed: s })

    if (issue.winner === 'left') {
      dollars += REWARD[enjeu].dollars
      points += REWARD[enjeu].points
      plis++
      wins++
      moi = { ...moi, level: issue.levelAfter }
      lui = { species: pickSpecies(mien, `${s}:adv`), level: 1 }
    } else {
      lost++
      moi = { species: pickSpecies(mien, `${s}:moi`), level: 1 }
      lui = { ...lui, level: issue.levelAfter }
    }
  }

  return { dollars, points, plis, lost, duels, winRate: wins / duels }
}

/**
 * Le terrain ordinaire vu par un légendaire qui descend dans l'arène : majoritairement du
 * peu commun et du rare, à des niveaux bas — la plupart des exemplaires sont frais, les
 * vétérans sont rares parce que les niveaux se gagnent lentement.
 */
const ORDINARY_FIELD = ['u', 'u', 'r', 'r', 'c']
const ordinaryTier = (seed) => ORDINARY_FIELD[fnv1a(`${seed}:terrain`) % ORDINARY_FIELD.length]
const ordinaryLevel = (seed) => 1 + (fnv1a(`${seed}:niveau`) % 3)

/**
 * Un légendaire descendu une fois par semaine face à ce terrain. Rend le nombre de semaines
 * survécues. Le bornage à 90 % garantit qu'il finit par tomber — et comme un légendaire
 * frais (725 de puissance) dépasse à peine un bon rare (690), il tombe même assez vite.
 */
export function simulateLegendaryLife({ weeks, seed }) {
  let level = 1
  for (let w = 0; w < weeks; w++) {
    const s = `${seed}:${w}`
    const moi = { species: pickSpecies('l', `${seed}:mon-legendaire`), level, form: formOf(s, 'jour') }
    const lui = {
      species: pickSpecies(ordinaryTier(s), `${s}:lui`),
      level: ordinaryLevel(s),
      form: formOf(`${s}:adv`, 'jour'),
    }
    const issue = resolveDuel({ left: moi, right: lui, seed: s })
    if (issue.winner === 'right') return w
    level = issue.levelAfter
  }
  return weeks
}

function main() {
  const SAISON = 8.7
  console.log('Une saison de deux mois, 5 duels par semaine ouvrée.\n')
  for (const policy of ['commun', 'peu-commun', 'rare', 'legendaire', 'maison']) {
    const r = simulateSeason({ policy, weeks: SAISON, seed: `cli-${policy}` })
    console.log(
      `${policy.padEnd(12)} ${String(r.dollars).padStart(6)} $  ${String(r.points).padStart(4)} pts  ` +
      `${r.plis} plis gagnés  ${r.lost} exemplaires perdus  ${(r.winRate * 100).toFixed(0)} % de victoires`,
    )
  }

  const vies = Array.from({ length: 200 }, (_, i) => simulateLegendaryLife({ weeks: 52, seed: `cli-vie-${i}` }))
  const mediane = vies.slice().sort((a, b) => a - b)[Math.floor(vies.length / 2)]
  console.log(`\nLégendaire engagé chaque semaine : ${mediane} semaines de survie médiane, ` +
    `${vies.filter((v) => v >= 52).length}/200 tiennent un an.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
