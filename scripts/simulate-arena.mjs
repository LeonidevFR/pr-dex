import { POOL, DEX, TIER_ORDER } from '../shared/species.js'
import { drawFrom, fnv1a } from '../shared/draw.js'
import { formOf, resolveDuel, NORMAL_FORM } from '../shared/battle.js'
import { coveredTier, REWARD, COMPUTER_REWARD, CREDIT_CAP } from '../shared/arena-economy.js'

/**
 * Un duel coûte un crédit et le plafond hebdomadaire de crédits est de cinq : le nombre de
 * duels qu'un joueur peut mener dans la semaine EST le plafond de crédits, ce n'est pas une
 * seconde grandeur qui se trouverait valoir la même chose.
 */
const DUELS_PER_WEEK = CREDIT_CAP

/** Rythme réel observé dans l'équipe : ~5 PR mergées par jour ouvré, donc ~25 plis par semaine. */
const PLIS_PER_WEEK = 25

/**
 * Plafond de palier de chaque politique. Un joueur engage le plus haut palier autorisé
 * qu'il possède encore — c'est ce plafond, croisé avec sa réserve réelle, qui distingue les
 * politiques entre elles. `audacieux` ne diffère de `rare` que les rares fois où un
 * légendaire est effectivement en réserve.
 */
export const POLICIES = { prudent: 'c', rare: 'r', audacieux: 'l' }

const emptyStock = () => Object.fromEntries(TIER_ORDER.map((t) => [t, []]))

/** Les plis tirés du travail, aux cotes de tout le monde — c'est ce qui alimente la réserve. */
function collectWeek(stock, seed) {
  for (let i = 0; i < PLIS_PER_WEEK; i++) {
    const { species } = drawFrom(`${seed}:${i}`)
    stock[DEX[species].tier].push({ species, level: 1 })
  }
}

/** Un pli gagné en arène entre en réserve comme n'importe quelle capture. */
function addPack(stock, tier, seed) {
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
  const ceiling = TIER_ORDER.indexOf(POLICIES[policy])
  for (let i = ceiling; i >= 0; i--) {
    const tier = TIER_ORDER[i]
    if (!stock[tier].length) continue
    let best = 0
    for (let k = 1; k < stock[tier].length; k++) {
      if (stock[tier][k].level > stock[tier][best].level) best = k
    }
    return { tier, index: best, fallback: i < ceiling }
  }
  return null
}

function newPlayer(policy) {
  if (policy !== 'ordinateur' && !(policy in POLICIES)) {
    throw new Error(`politique inconnue : ${policy}`)
  }
  return {
    policy, stock: emptyStock(), dollars: 0, points: 0, packs: 0, lost: 0,
    duels: 0, wins: 0, computerWins: 0, fallbacks: 0,
    stakes: Object.fromEntries(TIER_ORDER.map((t) => [t, 0])),
  }
}

/**
 * Le terrain ordinaire : ce que l'équipe engage réellement, majoritairement du peu commun et
 * du rare. Sert deux fois — à l'ordinateur pour tirer son palier, et au légendaire descendu
 * chaque semaine — et doit rester une seule table : deux copies divergeraient, et l'espérance
 * de vie du légendaire cesserait de se mesurer sur le terrain que l'ordinateur incarne.
 */
const ORDINARY_FIELD = ['u', 'u', 'r', 'r', 'c']

/**
 * L'adversaire de l'ordinateur : un palier tiré dans le terrain ordinaire — INDÉPENDAMMENT
 * de la mise du joueur (spec § 2) —, une espèce uniforme dans ce pool, un niveau bas, et la
 * forme du jour NORMALE : l'ordinateur ne bénéficie ni ne souffre de l'aléa des formes.
 *
 * L'ancienne règle le faisait tirer dans le pool du palier engagé par le joueur. Les deux
 * paliers étaient alors égaux par construction, donc l'enjeu valait toujours la mise du
 * joueur et la règle de l'enjeu était inopérante contre l'ordinateur.
 */
function computerSide(seed) {
  const tier = ORDINARY_FIELD[fnv1a(`${seed}:terrain`) % ORDINARY_FIELD.length]
  const pool = POOL[tier]
  return {
    tier,
    side: {
      species: pool[fnv1a(`${seed}:ordinateur`) % pool.length],
      level: 1 + (fnv1a(`${seed}:niveau`) % 4),
      form: NORMAL_FORM,
    },
  }
}

/**
 * Une ligue : cinq joueurs, chacun avec sa réserve et sa politique. Chaque jour ouvré, les
 * joueurs sont appariés par rotation et celui qui reste affronte l'ordinateur — la rotation
 * fait que tout le monde y passe à son tour.
 *
 * Le terrain adverse est ainsi ÉMERGENT : personne ne décide de ce que les autres engagent,
 * ça découle de leurs politiques et de ce qu'ils possèdent. C'est ce qui manquait à la
 * version précédente, où l'adversaire était le miroir du joueur et rendait tout équilibrage
 * vrai par construction.
 */
export function simulateLeague({ weeks, seed, policies }) {
  const players = policies.map(newPlayer)
  const days = Math.round(weeks * DUELS_PER_WEEK)

  for (let j = 0; j < days; j++) {
    if (j % DUELS_PER_WEEK === 0) {
      const week = j / DUELS_PER_WEEK
      players.forEach((p, i) => collectWeek(p.stock, `${seed}:tirage:${i}:${week}`))
    }

    // Ronde à la Berger : le joueur qui « sort » affronte l'ordinateur, les autres sont
    // appariés en miroir autour de lui. Sur cinq jours, chaque paire se rencontre
    // exactement une fois — sans quoi un joueur n'affronterait qu'un voisinage fixe, et le
    // classement mesurerait sa position dans le cycle autant que sa politique.
    const n = players.length
    const resting = j % n
    for (let k = 1; k * 2 < n; k++) {
      duelHumain(players[(resting + k) % n], players[(resting - k + n) % n], `${seed}:${j}:${k}`)
    }
    duelOrdinateur(players[resting], `${seed}:${j}:ordinateur`)
  }

  return players.map((p) => ({
    policy: p.policy, dollars: p.dollars, points: p.points, packs: p.packs, lost: p.lost,
    duels: p.duels, wins: p.wins, computerWins: p.computerWins, fallbacks: p.fallbacks,
    stakes: p.stakes,
    stock: Object.fromEntries(TIER_ORDER.map((t) => [t, p.stock[t].length])),
  }))
}

function duelHumain(a, b, seed) {
  // Un joueur qui ne relève jamais de défi renvoie son adversaire du jour vers l'ordinateur —
  // et va s'y entraîner lui aussi. Sans cette seconde ligne il ne jouerait qu'un jour sur
  // cinq, et l'acquis « l'ordinateur ne suffit pas » se vérifierait sur un écart de cadence
  // au lieu d'un écart de revenus.
  if (a.policy === 'ordinateur' || b.policy === 'ordinateur') {
    duelOrdinateur(a, `${seed}:a`)
    duelOrdinateur(b, `${seed}:b`)
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
  const stake = coveredTier(ea.tier, eb.tier)

  for (const [j, e] of [[a, ea], [b, eb]]) {
    j.duels++
    j.stakes[e.tier]++
    if (e.fallback) j.fallbacks++
  }

  const [winner, winnerEntry, loser, loserEntry] = issue.winner === 'left'
    ? [a, ga, b, eb]
    : [b, gb, a, ea]

  winnerEntry.level = issue.levelAfter
  winner.wins++
  winner.dollars += REWARD[stake].dollars
  winner.points += REWARD[stake].points
  winner.packs++
  addPack(winner.stock, stake, `${seed}:pli`)

  loser.lost++
  loser.stock[loserEntry.tier].splice(loserEntry.index, 1)
}

/**
 * Contre l'ordinateur : des pokédollars au cinquième du tarif humain, au palier de l'enjeu
 * comme contre un humain, et rien d'autre. Aucun pli, aucun point, AUCUN GAIN DE NIVEAU
 * (spec § 2) et aucun risque — l'ordinateur ne possède rien, il ne peut donc ni détruire ni
 * créer un exemplaire. Un joueur qui ne fait que ça ne se construit jamais de champion :
 * c'est voulu.
 */
function duelOrdinateur(j, seed) {
  const e = pickStake(j.stock, j.policy === 'ordinateur' ? 'rare' : j.policy)
  if (!e) return
  const own = j.stock[e.tier][e.index]
  const them = computerSide(seed)

  j.duels++
  j.stakes[e.tier]++
  if (e.fallback) j.fallbacks++

  const issue = resolveDuel({
    left: { ...own, form: formOf(`${seed}:moi`, 'jour') },
    right: them.side,
    seed,
  })
  if (issue.winner === 'left') {
    j.wins++
    j.computerWins++
    j.dollars += COMPUTER_REWARD[coveredTier(e.tier, them.tier)]
  }
}

/**
 * Un légendaire descendu une fois par semaine face au terrain ordinaire, à des niveaux bas.
 * Rend le nombre de semaines survécues : le bornage à 90 % garantit qu'il finit par tomber,
 * quelle que soit sa force.
 */
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

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]

function main() {
  const SAISON = 8.7
  const RUNS = 30
  const POLICIES_CLI = ['prudent', 'rare', 'audacieux', 'rare', 'ordinateur']

  console.log(`Ligue de ${POLICIES_CLI.length} joueurs, ${RUNS} saisons de deux mois simulées.\n`)
  console.log('politique     médiane   p10      p90    victoires  replis  mises légendaires')

  const ligues = Array.from({ length: RUNS }, (_, i) =>
    simulateLeague({ weeks: SAISON, seed: `cli-${i}`, policies: POLICIES_CLI }))

  POLICIES_CLI.forEach((policy, index) => {
    const players = ligues.map((l) => l[index])
    const sorted = players.map((j) => j.dollars).sort((a, b) => a - b)
    const avg = (f) => players.reduce((a, j) => a + f(j), 0) / players.length
    console.log(
      `${(policy + ' #' + index).padEnd(14)}${String(quantile(sorted, 0.5)).padStart(6)} $` +
      `${String(quantile(sorted, 0.1)).padStart(8)} $${String(quantile(sorted, 0.9)).padStart(8)} $` +
      `${(avg((j) => j.wins / j.duels) * 100).toFixed(0).padStart(9)} %` +
      `${avg((j) => j.fallbacks).toFixed(1).padStart(8)}` +
      `${avg((j) => j.stakes.l).toFixed(1).padStart(12)}`,
    )
  })

  const lives = Array.from({ length: 200 }, (_, i) => simulateLegendaryLife({ weeks: 52, seed: `cli-vie-${i}` }))
  const sorted = lives.slice().sort((a, b) => a - b)
  console.log(`\nLégendaire engagé chaque semaine : médiane ${quantile(sorted, 0.5)} semaines ` +
    `(p10 ${quantile(sorted, 0.1)}, p90 ${quantile(sorted, 0.9)}), ` +
    `${lives.filter((v) => v >= 52).length}/200 tiennent un an.`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
