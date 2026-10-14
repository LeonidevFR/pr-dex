import { DEX, familyOf, familyLine, hasEvoInFamily } from '../../shared/species.js'
import { entryKey } from '../../shared/entry.js'

/**
 * Le catalogue des succès. L'ordre est celui de l'affichage, groupe par groupe.
 *
 * `tier` reprend les paliers des cartes, mais mesure la difficulté : la part des joueurs qui
 * l'obtiennent en un an de jeu (~300 cartes), estimée par simulation. ≥ 70 % commun, 30–70 %
 * peu commun, 10–30 % rare, < 10 % légendaire. Fixe : il ne dépend pas de qui l'a.
 *
 * `target` n'existe que sur les paliers visibles qui affichent une progression.
 */
export const ACHIEVEMENTS = [
  { code: 'shiny-1', group: 'collection', name: 'Premier chromatique', desc: 'Obtenir une carte chromatique.', tier: 'c', hidden: false, icon: { glyph: '★' } },
  { code: 'lineage-1', group: 'collection', name: 'Première lignée', desc: 'Compléter une famille d’évolution.', tier: 'c', hidden: false, icon: { sprite: 6 } },
  { code: 'species-50', group: 'collection', name: '50 espèces', desc: 'Avoir 50 espèces au Pokédex.', tier: 'c', hidden: false, icon: { glyph: '50' }, target: 50 },
  { code: 'species-100', group: 'collection', name: '100 espèces', desc: 'Avoir 100 espèces au Pokédex.', tier: 'c', hidden: false, icon: { glyph: '100' }, target: 100 },
  { code: 'species-140', group: 'collection', name: '140 espèces', desc: 'Avoir 140 espèces au Pokédex.', tier: 'l', hidden: false, icon: { glyph: '140' }, target: 140 },
  { code: 'species-151', group: 'collection', name: '151 espèces', desc: 'Compléter le Pokédex.', tier: 'l', hidden: false, icon: { glyph: '151' }, target: 151 },
  { code: 'shiny-species-3', group: 'collection', name: 'Chasseur de chromatiques I', desc: 'Avoir 3 espèces chromatiques.', tier: 'u', hidden: false, icon: { glyph: '★3' }, target: 3 },
  { code: 'shiny-species-5', group: 'collection', name: 'Chasseur de chromatiques II', desc: 'Avoir 5 espèces chromatiques.', tier: 'l', hidden: false, icon: { glyph: '★5' }, target: 5 },
  { code: 'shiny-species-8', group: 'collection', name: 'Chasseur de chromatiques III', desc: 'Avoir 8 espèces chromatiques.', tier: 'l', hidden: false, icon: { glyph: '★8' }, target: 8 },
  { code: 'mt-1', group: 'monkey', name: 'Premier booster', desc: 'Ouvrir son premier booster de monkey-testing.', tier: 'c', hidden: false, icon: { sprite: 56 } },
  { code: 'mt-5', group: 'monkey', name: 'Habitué', desc: 'Participer à 5 sessions de monkey-testing.', tier: 'u', hidden: false, icon: { glyph: '×5' }, target: 5 },
  { code: 'mt-10', group: 'monkey', name: 'Golden Monkey', desc: 'Participer à 10 sessions de monkey-testing.', tier: 'r', hidden: false, icon: { sprite: 57 }, target: 10 },
  { code: 'two-hats', group: 'monkey', name: 'Double casquette', desc: 'Avoir des cartes GitHub et des cartes monkey-testing.', tier: 'u', hidden: false, icon: { sprite: 122 } },
  { code: 'on-top', group: 'dice', name: 'Sur la tête', desc: 'Tirer une carte, puis sa propre évolution juste après.', tier: 'c', hidden: true, icon: { sprite: 5 } },
  { code: 'hot-hand', group: 'dice', name: 'Main chaude', desc: 'Tirer 3 cartes rares ou mieux d’affilée.', tier: 'u', hidden: true, icon: { sprite: 126 } },
  { code: 'deja-vu', group: 'dice', name: 'Déjà-vu', desc: 'Tirer la même espèce deux fois d’affilée.', tier: 'r', hidden: true, icon: { sprite: 132 } },
  { code: 'lucky-number', group: 'dice', name: 'Numéro gagnant', desc: 'Les 3 derniers chiffres d’une PR donnent le numéro de la carte tirée.', tier: 'r', hidden: true, icon: { sprite: 25 } },
  { code: 'beginner-luck', group: 'dice', name: 'Chance du débutant', desc: 'Un légendaire ou un chromatique dans tes 10 premières cartes.', tier: 'r', hidden: true, icon: { sprite: 113 } },
  { code: 'golden-booster', group: 'dice', name: 'Booster doré', desc: '3 cartes rares ou mieux dans un même booster.', tier: 'u', hidden: true, icon: { sprite: 52 } },
  { code: 'shiny-booster', group: 'dice', name: 'Booster chromatique', desc: 'Un chromatique dans un booster de monkey-testing.', tier: 'r', hidden: true, icon: { glyph: '✦' } },
  { code: 'twins', group: 'dice', name: 'Jumeaux', desc: 'Tirer la même espèce qu’un coéquipier, le même jour.', tier: 'r', hidden: true, icon: { sprite: 102 } },
  { code: 'shiny-double', group: 'dice', name: 'Doublé chromatique', desc: 'Tirer 2 chromatiques à moins de 10 cartes d’écart.', tier: 'l', hidden: true, icon: { glyph: '★★' } },
  { code: 'too-late', group: 'actions', name: 'Trop tard', desc: 'Tirer une espèce que tu avais déjà obtenue par évolution.', tier: 'c', hidden: true, icon: { sprite: 79 } },
  { code: 'right-away', group: 'actions', name: 'Sitôt dit', desc: 'Faire évoluer une carte le jour où elle a été tirée.', tier: 'c', hidden: true, icon: { sprite: 63 } },
  { code: 'big-leap', group: 'actions', name: 'Le grand saut', desc: 'Mener un même exemplaire du 1er au 3e stade.', tier: 'c', hidden: true, icon: { sprite: 3 } },
  { code: 'worth-it', group: 'actions', name: 'Ça valait le coup', desc: 'Faire évoluer une carte chromatique.', tier: 'u', hidden: true, icon: { sprite: 133 } },
  { code: 'patient-fisher', group: 'actions', name: 'Pêcheur patient', desc: 'Avoir 10 Magicarpe sans en avoir jamais fait évoluer.', tier: 'l', hidden: true, icon: { sprite: 129 } },
  { code: 'gyarados', group: 'actions', name: 'Patience récompensée', desc: 'Faire évoluer Magicarpe en Léviator.', tier: 'l', hidden: true, icon: { sprite: 130 } },
]

export const BY_CODE = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]))

const MAGIKARP = 129
const GYARADOS = 130
const RARE_OR_BETTER = new Set(['r', 'l'])
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
const evosOf = (id) => { const t = DEX[id]?.to; return t == null ? [] : Array.isArray(t) ? t : [t] }
const isMonkey = (c) => c.source === 'slack' && c.ref === 'monkey-testing'
const sessionOf = (c) => c.external_id.split(':')[1]
// `<repo>#<numéro> · <sha>` : seul le connecteur GitHub écrit ce format.
const prNumber = (c) => { const m = /#(\d+)/.exec(c.ref ?? ''); return m ? Number(m[1]) : null }

/**
 * Les succès que remplissent les données d'un joueur. Fonction pure : ni Vue, ni réseau,
 * ni horloge.
 *
 * - `catches` : toutes ses captures, ouvertes ou non, dans l'ordre de la base (date puis id).
 * - `claimed` : les clés ouvertes (`state.claimed`).
 * - `evolutions` : `state.evolutions`, tel qu'écrit (aucune validation côté base).
 * - `others` : les captures ouvertes des autres joueurs (`leaderboard_players()`), pour Jumeaux.
 *
 * Renvoie `unlocked` (code → { date, triggerKey }, la date de l'événement qui l'a rempli) et
 * `progress` (code → { current, target }) pour les paliers visibles.
 */
export function evaluate({ catches, claimed, evolutions, others = [] }) {
  const unlocked = {}
  const hit = (code, date, triggerKey) => { if (!unlocked[code]) unlocked[code] = { date, triggerKey } }

  const opened = new Set(claimed)
  // Tri stable : à date égale, l'ordre reçu (l'id en base) départage.
  const seq = [...catches].sort(byDate).map((c) => {
    const key = entryKey(c.source, c.external_id)
    return { ...c, key, open: opened.has(key), tier: DEX[c.species]?.tier }
  })
  const open = seq.filter((c) => c.open)

  // Évolutions résolues sur leur exemplaire source, comme `useDex`. L'index d'origine est
  // gardé même quand une entrée malformée est sautée : `evo:i` le référence.
  const pool = [...open]
  const evos = []
  ;(Array.isArray(evolutions) ? evolutions : []).forEach((e, i) => {
    if (!e || !DEX[e.species]) return
    const fromKey = e.fromKey ?? e.fromSha
    const src = fromKey ? pool.find((c) => c.key === fromKey) : pool.find((c) => c.species === e.from)
    const evo = { ...e, fromKey, key: `evo:${i}`, shiny: src?.shiny ?? false, src }
    evos.push(evo)
    pool.push(evo)
  })

  // ── Collection : on rejoue captures ouvertes et évolutions dans l'ordre des dates. ──
  const events = [...open, ...evos].sort(byDate)
  const owned = new Set()
  const shinyOwned = new Set()
  const lineageDone = (id) => {
    const fam = familyOf(id)
    return hasEvoInFamily(fam) && familyLine(fam).flat().every((s) => owned.has(s))
  }
  for (const ev of events) {
    owned.add(ev.species)
    if (ev.shiny) {
      shinyOwned.add(ev.species)
      hit('shiny-1', ev.date, ev.key)
    }
    for (const n of [50, 100, 140, 151]) if (owned.size >= n) hit(`species-${n}`, ev.date, ev.key)
    for (const n of [3, 5, 8]) if (shinyOwned.size >= n) hit(`shiny-species-${n}`, ev.date, ev.key)
    if (lineageDone(ev.species)) hit('lineage-1', ev.date, ev.key)
  }

  // ── Monkey-testing : une session compte dès qu'une de ses cartes est ouverte. ──
  const sessions = new Map()
  for (const c of open.filter(isMonkey)) {
    const s = sessionOf(c)
    if (!sessions.has(s)) {
      sessions.set(s, [])
      for (const n of [1, 5, 10]) if (sessions.size === n) hit(`mt-${n}`, c.date, c.key)
    }
    const cards = sessions.get(s)
    cards.push(c)
    if (c.shiny) hit('shiny-booster', c.date, c.key)
    if (cards.filter((x) => RARE_OR_BETTER.has(x.tier)).length >= 3) hit('golden-booster', c.date, c.key)
  }
  const firstGithub = open.find((c) => c.source === 'github')
  const firstMonkey = open.find(isMonkey)
  if (firstGithub && firstMonkey) {
    const last = byDate(firstGithub, firstMonkey) > 0 ? firstGithub : firstMonkey
    hit('two-hats', last.date, last.key)
  }

  // ── Coups de dés : la séquence compte aussi les cartes scellées, qui cassent une suite. ──
  for (let i = 0; i < seq.length; i++) {
    const c = seq[i]
    const prev = seq[i - 1]
    const prev2 = seq[i - 2]
    if (!c.open) continue
    if (prev?.open && prev.species === c.species) hit('deja-vu', c.date, c.key)
    if (prev?.open && evosOf(prev.species).includes(c.species)) hit('on-top', c.date, c.key)
    if (prev?.open && prev2?.open && [prev2, prev, c].every((x) => RARE_OR_BETTER.has(x.tier))) hit('hot-hand', c.date, c.key)
    if (i < 10 && (c.shiny || c.tier === 'l')) hit('beginner-luck', c.date, c.key)
    if (c.shiny && seq.slice(Math.max(0, i - 10), i).some((x) => x.open && x.shiny)) hit('shiny-double', c.date, c.key)
    if (c.source === 'github' && prNumber(c) !== null && prNumber(c) % 1000 === c.species) hit('lucky-number', c.date, c.key)
  }
  const theirs = new Set(others.map((o) => `${o.species}@${o.date}`))
  for (const c of open) if (theirs.has(`${c.species}@${c.date}`)) { hit('twins', c.date, c.key); break }

  // ── Actions ──
  for (const e of evos) {
    if (e.shiny) hit('worth-it', e.date, e.key)
    if (e.fromKey?.startsWith('evo:')) hit('big-leap', e.date, e.key)
    if (e.src && !e.fromKey?.startsWith('evo:') && e.src.date === e.date) hit('right-away', e.date, e.key)
    if (e.species === GYARADOS) hit('gyarados', e.date, e.key)
  }
  for (const c of open) {
    if (evos.some((e) => e.species === c.species && e.date < c.date)) { hit('too-late', c.date, c.key); break }
  }
  const firstFish = evos.filter((e) => e.from === MAGIKARP).map((e) => e.date).sort()[0]
  const fish = open.filter((c) => c.species === MAGIKARP && (!firstFish || c.date < firstFish))
  if (fish.length >= 10) hit('patient-fisher', fish[9].date, fish[9].key)

  const progress = {}
  for (const n of [50, 100, 140, 151]) progress[`species-${n}`] = { current: owned.size, target: n }
  for (const n of [3, 5, 8]) progress[`shiny-species-${n}`] = { current: shinyOwned.size, target: n }
  for (const n of [5, 10]) progress[`mt-${n}`] = { current: sessions.size, target: n }

  return { unlocked, progress }
}
