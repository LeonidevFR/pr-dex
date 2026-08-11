import { POOL, DEX } from '../shared/species.js'
import { drawFrom, fnv1a } from '../shared/draw.js'
import { formOf, resolveDuel } from '../shared/battle.js'
import { coveredTier, REWARD, HOUSE_REWARD, TIER_ORDER } from '../shared/arena-economy.js'

const DUELS_PER_WEEK = 5

/** Rythme réel observé dans l'équipe : ~5 PR mergées par jour ouvré, donc ~25 plis par semaine. */
const PLIS_PER_WEEK = 25

/**
 * Plafond de palier de chaque politique. Un joueur engage le plus haut palier autorisé
 * qu'il possède encore — c'est ce plafond, croisé avec sa réserve réelle, qui distingue les
 * politiques entre elles. `audacieux` ne diffère de `rare` que les rares fois où un
 * légendaire est effectivement en réserve.
 */
export const POLICIES = { prudent: 'c', rare: 'r', audacieux: 'l' }

const emptyStock = () => ({ c: [], u: [], r: [], l: [] })

/** Les plis tirés du travail, aux cotes de tout le monde — c'est ce qui alimente la réserve. */
function collectWeek(stock, seed) {
  for (let i = 0; i < PLIS_PER_WEEK; i++) {
    const { species } = drawFrom(`${seed}:${i}`)
    stock[DEX[species].tier].push({ species, level: 1 })
  }
}

/** Un pli gagné en arène entre en réserve comme n'importe quelle capture. */
function addPli(stock, tier, seed) {
  const pool = POOL[tier]
  stock[tier].push({ species: pool[fnv1a(seed) % pool.length], level: 1 })
}

/**
 * L'exemplaire engagé : le plus haut palier autorisé par la politique et effectivement
 * possédé, et dans ce palier le plus vétéran — un joueur envoie son champion. Rend aussi
 * `fallback`, vrai quand le palier visé était vide : c'est la trace mesurable qu'une
 * politique n'est pas soutenable.
 */
function pickStake(stock, policy) {
  const plafond = TIER_ORDER.indexOf(POLICIES[policy])
  for (let i = plafond; i >= 0; i--) {
    const tier = TIER_ORDER[i]
    if (!stock[tier].length) continue
    let best = 0
    for (let k = 1; k < stock[tier].length; k++) {
      if (stock[tier][k].level > stock[tier][best].level) best = k
    }
    return { tier, index: best, fallback: i < plafond }
  }
  return null
}

function newPlayer(policy) {
  if (policy !== 'maison' && !(policy in POLICIES)) {
    throw new Error(`politique inconnue : ${policy}`)
  }
  return {
    policy, stock: emptyStock(), dollars: 0, points: 0, plis: 0, lost: 0,
    duels: 0, wins: 0, fallbacks: 0, stakes: { c: 0, u: 0, r: 0, l: 0 },
  }
}

/** L'adversaire de la maison : plausible, jamais plus faible, et sans rien à perdre. */
function houseSide(tier, seed) {
  const pool = POOL[tier]
  return {
    species: pool[fnv1a(`${seed}:maison`) % pool.length],
    level: 1 + (fnv1a(`${seed}:niveau`) % 4),
    form: formOf(`${seed}:maison`, 'jour'),
  }
}

/**
 * Une ligue : cinq joueurs, chacun avec sa réserve et sa politique. Chaque jour ouvré, les
 * joueurs sont appariés par rotation et celui qui reste affronte la maison — la rotation
 * fait que tout le monde y passe à son tour.
 *
 * Le terrain adverse est ainsi ÉMERGENT : personne ne décide de ce que les autres engagent,
 * ça découle de leurs politiques et de ce qu'ils possèdent. C'est ce qui manquait à la
 * version précédente, où l'adversaire était le miroir du joueur et rendait tout équilibrage
 * vrai par construction.
 */
export function simulateLeague({ weeks, seed, policies }) {
  const players = policies.map(newPlayer)
  const jours = Math.round(weeks * DUELS_PER_WEEK)

  for (let j = 0; j < jours; j++) {
    if (j % DUELS_PER_WEEK === 0) {
      const semaine = j / DUELS_PER_WEEK
      players.forEach((p, i) => collectWeek(p.stock, `${seed}:tirage:${i}:${semaine}`))
    }

    const ordre = players.map((_, i) => (i + j) % players.length)
    for (let k = 0; k + 1 < players.length; k += 2) {
      duelHumain(players[ordre[k]], players[ordre[k + 1]], `${seed}:${j}:${k}`)
    }
    duelMaison(players[ordre[players.length - 1]], `${seed}:${j}:maison`)
  }

  return players.map((p) => ({
    policy: p.policy, dollars: p.dollars, points: p.points, plis: p.plis, lost: p.lost,
    duels: p.duels, wins: p.wins, fallbacks: p.fallbacks, stakes: p.stakes,
    stock: Object.fromEntries(TIER_ORDER.map((t) => [t, p.stock[t].length])),
  }))
}

function duelHumain(a, b, seed) {
  if (a.policy === 'maison' || b.policy === 'maison') {
    // Un joueur qui ne veut que la maison ne relève jamais de défi : son adversaire du jour
    // se rabat sur la maison lui aussi, plutôt que de jouer un duel fantôme.
    duelMaison(a.policy === 'maison' ? b : a, `${seed}:report`)
    return
  }
  const ea = pickStake(a.stock, a.policy)
  const eb = pickStake(b.stock, b.policy)
  if (!ea || !eb) return

  const ga = a.stock[ea.tier][ea.index]
  const gb = b.stock[eb.tier][eb.index]
  const issue = resolveDuel({
    left: { ...ga, form: formOf(`${seed}:a`, 'jour') },
    right: { ...gb, form: formOf(`${seed}:b`, 'jour') },
    seed,
  })
  const enjeu = coveredTier(ea.tier, eb.tier)

  for (const [j, e] of [[a, ea], [b, eb]]) {
    j.duels++
    j.stakes[e.tier]++
    if (e.fallback) j.fallbacks++
  }

  const [vainqueur, ev, gv, perdant, ep] = issue.winner === 'left'
    ? [a, ea, ga, b, eb]
    : [b, eb, gb, a, ea]

  gv.level = issue.levelAfter
  vainqueur.wins++
  vainqueur.dollars += REWARD[enjeu].dollars
  vainqueur.points += REWARD[enjeu].points
  vainqueur.plis++
  addPli(vainqueur.stock, enjeu, `${seed}:pli`)

  perdant.lost++
  perdant.stock[ep.tier].splice(ep.index, 1)
}

/**
 * Contre la maison : des pokédollars au quart du tarif humain, et rien d'autre. Aucun pli,
 * aucun point, AUCUN GAIN DE NIVEAU (spec § 2) et aucun risque — la maison ne possède rien,
 * elle ne peut donc ni détruire ni créer un exemplaire. Un joueur qui ne fait que ça ne se
 * construit jamais de champion : c'est voulu.
 */
function duelMaison(j, seed) {
  const e = pickStake(j.stock, j.policy === 'maison' ? 'rare' : j.policy)
  if (!e) return
  const mien = j.stock[e.tier][e.index]

  j.duels++
  j.stakes[e.tier]++
  if (e.fallback) j.fallbacks++

  const issue = resolveDuel({
    left: { ...mien, form: formOf(`${seed}:moi`, 'jour') },
    right: houseSide(e.tier, seed),
    seed,
  })
  if (issue.winner === 'left') {
    j.wins++
    j.dollars += HOUSE_REWARD[e.tier]
  }
}

/**
 * Un légendaire descendu une fois par semaine face au terrain ordinaire — majoritairement du
 * peu commun et du rare, à des niveaux bas. Rend le nombre de semaines survécues : le
 * bornage à 90 % garantit qu'il finit par tomber, quelle que soit sa force.
 */
const ORDINARY_FIELD = ['u', 'u', 'r', 'r', 'c']

export function simulateLegendaryLife({ weeks, seed }) {
  let level = 1
  const species = POOL.l[fnv1a(`${seed}:mon-legendaire`) % POOL.l.length]
  for (let w = 0; w < weeks; w++) {
    const s = `${seed}:${w}`
    const tier = ORDINARY_FIELD[fnv1a(`${s}:terrain`) % ORDINARY_FIELD.length]
    const pool = POOL[tier]
    const issue = resolveDuel({
      left: { species, level, form: formOf(s, 'jour') },
      right: {
        species: pool[fnv1a(`${s}:lui`) % pool.length],
        level: 1 + (fnv1a(`${s}:niveau`) % 3),
        form: formOf(`${s}:adv`, 'jour'),
      },
      seed: s,
    })
    if (issue.winner === 'right') return w
    level = issue.levelAfter
  }
  return weeks
}

const quantile = (tri, q) => tri[Math.min(tri.length - 1, Math.floor(tri.length * q))]

function main() {
  const SAISON = 8.7
  const RUNS = 30
  const POLICIES_CLI = ['prudent', 'rare', 'audacieux', 'rare', 'maison']

  console.log(`Ligue de ${POLICIES_CLI.length} joueurs, ${RUNS} saisons de deux mois simulées.\n`)
  console.log('politique     médiane   p10      p90    victoires  replis  mises légendaires')

  const ligues = Array.from({ length: RUNS }, (_, i) =>
    simulateLeague({ weeks: SAISON, seed: `cli-${i}`, policies: POLICIES_CLI }))

  POLICIES_CLI.forEach((policy, index) => {
    const joueurs = ligues.map((l) => l[index])
    const tri = joueurs.map((j) => j.dollars).sort((a, b) => a - b)
    const moy = (f) => joueurs.reduce((a, j) => a + f(j), 0) / joueurs.length
    console.log(
      `${(policy + ' #' + index).padEnd(14)}${String(quantile(tri, 0.5)).padStart(6)} $` +
      `${String(quantile(tri, 0.1)).padStart(8)} $${String(quantile(tri, 0.9)).padStart(8)} $` +
      `${(moy((j) => j.wins / j.duels) * 100).toFixed(0).padStart(9)} %` +
      `${moy((j) => j.fallbacks).toFixed(1).padStart(8)}` +
      `${moy((j) => j.stakes.l).toFixed(1).padStart(12)}`,
    )
  })

  const vies = Array.from({ length: 200 }, (_, i) => simulateLegendaryLife({ weeks: 52, seed: `cli-vie-${i}` }))
  const tri = vies.slice().sort((a, b) => a - b)
  console.log(`\nLégendaire engagé chaque semaine : médiane ${quantile(tri, 0.5)} semaines ` +
    `(p10 ${quantile(tri, 0.1)}, p90 ${quantile(tri, 0.9)}), ` +
    `${vies.filter((v) => v >= 52).length}/200 tiennent un an.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
