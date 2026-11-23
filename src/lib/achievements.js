import { DEX, familyOf, familyLine, hasEvoInFamily } from '../../shared/species.js'
import { entryKey } from '../../shared/entry.js'
import { seasonBounds } from '../../shared/arena-economy.js'

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
  { code: 'species-140', group: 'collection', name: '140 espèces', desc: 'Avoir 140 espèces au Pokédex.', tier: 'u', hidden: false, icon: { glyph: '140' }, target: 140 },
  { code: 'species-151', group: 'collection', name: '151 espèces', desc: 'Compléter la 1re génération.', tier: 'r', hidden: false, icon: { glyph: '151' }, target: 151 },
  { code: 'shiny-species-3', group: 'collection', name: 'Chasseur de chromatiques I', desc: 'Avoir 3 espèces chromatiques.', tier: 'u', hidden: false, icon: { glyph: '★3' }, target: 3 },
  { code: 'shiny-species-5', group: 'collection', name: 'Chasseur de chromatiques II', desc: 'Avoir 5 espèces chromatiques.', tier: 'u', hidden: false, icon: { glyph: '★5' }, target: 5 },
  { code: 'shiny-species-10', group: 'collection', name: 'Chasseur de chromatiques III', desc: 'Avoir 10 espèces chromatiques.', tier: 'u', hidden: false, icon: { glyph: '★10' }, target: 10 },
  { code: 'shiny-species-20', group: 'collection', name: 'Chasseur de chromatiques IV', desc: 'Avoir 20 espèces chromatiques.', tier: 'r', hidden: false, icon: { glyph: '★20' }, target: 20 },
  { code: 'shiny-species-50', group: 'collection', name: 'Chasseur de chromatiques V', desc: 'Avoir 50 espèces chromatiques.', tier: 'l', hidden: false, icon: { glyph: '★50' }, target: 50 },
  { code: 'starters', group: 'collection', name: 'Le choix du prof', desc: 'Avoir Bulbizarre, Salamèche et Carapuce.', tier: 'u', hidden: true, icon: { sprite: 7 } },
  { code: 'birds', group: 'collection', name: 'Trio d’oiseaux', desc: 'Avoir Artikodin, Électhor et Sulfura.', tier: 'r', hidden: true, icon: { sprite: 145 } },
  { code: 'fossils', group: 'collection', name: 'Fossiles', desc: 'Avoir Amonita, Kabuto et Ptéra.', tier: 'u', hidden: true, icon: { sprite: 138 } },
  { code: 'team-rocket', group: 'collection', name: 'Team Rocket', desc: 'Avoir Abo, Smogo et Miaouss.', tier: 'u', hidden: true, icon: { sprite: 52 } },
  { code: 'eeveelutions', group: 'collection', name: 'Évolition', desc: 'Avoir Aquali, Voltali et Pyroli.', tier: 'u', hidden: true, icon: { sprite: 133 } },
  { code: 'mt-1', group: 'monkey', name: 'Premier booster', desc: 'Ouvrir son premier booster de monkey-testing.', tier: 'u', hidden: false, icon: { sprite: 56 } },
  { code: 'mt-5', group: 'monkey', name: 'Habitué', desc: 'Participer à 5 sessions de monkey-testing.', tier: 'u', hidden: false, icon: { glyph: '×5' }, target: 5 },
  { code: 'mt-10', group: 'monkey', name: 'Golden Monkey', desc: 'Participer à 10 sessions de monkey-testing.', tier: 'r', hidden: false, icon: { sprite: 57 }, target: 10 },
  { code: 'two-hats', group: 'monkey', name: 'Double casquette', desc: 'Avoir des cartes GitHub et des cartes monkey-testing.', tier: 'u', hidden: false, icon: { sprite: 122 } },
  { code: 'on-top', group: 'dice', name: 'Sur la tête', desc: 'Tirer une carte, puis sa propre évolution juste après.', tier: 'c', hidden: true, icon: { sprite: 5 } },
  { code: 'hot-hand', group: 'dice', name: 'Main chaude', desc: 'Tirer 3 cartes rares ou mieux d’affilée.', tier: 'u', hidden: true, icon: { sprite: 126 } },
  { code: 'deja-vu', group: 'dice', name: 'Déjà-vu', desc: 'Tirer la même espèce deux fois d’affilée.', tier: 'c', hidden: true, icon: { sprite: 132 } },
  { code: 'lucky-number', group: 'dice', name: 'Numéro gagnant', desc: 'Les 3 derniers chiffres d’une PR donnent le numéro de la carte tirée.', tier: 'u', hidden: true, icon: { sprite: 25 } },
  { code: 'beginner-luck', group: 'dice', name: 'Chance du débutant', desc: 'Un légendaire ou un chromatique dans tes 10 premières cartes.', tier: 'r', hidden: true, icon: { sprite: 113 } },
  { code: 'golden-booster', group: 'dice', name: 'Booster doré', desc: '3 cartes rares ou mieux dans un même booster.', tier: 'r', hidden: true, icon: { sprite: 52 } },
  { code: 'shiny-booster', group: 'dice', name: 'Booster chromatique', desc: 'Un chromatique dans un booster de monkey-testing.', tier: 'r', hidden: true, icon: { glyph: '✦' } },
  { code: 'palindrome', group: 'dice', name: 'Palindrome', desc: 'Tirer une carte d’une PR dont le numéro se lit dans les deux sens (3 chiffres ou plus).', tier: 'c', hidden: true, icon: { glyph: '121' } },
  { code: 'twins', group: 'dice', name: 'Jumeaux', desc: 'Tirer la même espèce qu’un coéquipier, le même jour.', tier: 'c', hidden: true, icon: { sprite: 102 } },
  { code: 'shiny-legendary', group: 'dice', name: 'Gros veinard', desc: 'Tirer un légendaire chromatique.', tier: 'l', hidden: true, icon: { sprite: 151 } },
  { code: 'shiny-double', group: 'dice', name: 'Doublé chromatique', desc: 'Tirer 2 chromatiques à 10 cartes d’écart au plus.', tier: 'u', hidden: true, icon: { glyph: '★★' } },
  { code: 'too-late', group: 'actions', name: 'Trop tard', desc: 'Tirer une espèce que tu avais déjà obtenue par évolution.', tier: 'c', hidden: true, icon: { sprite: 79 } },
  { code: 'right-away', group: 'actions', name: 'Sitôt dit', desc: 'Faire évoluer une carte le jour où elle a été tirée.', tier: 'c', hidden: true, icon: { sprite: 63 } },
  { code: 'big-leap', group: 'actions', name: 'Le grand saut', desc: 'Mener un même exemplaire du 1er au 3e stade.', tier: 'u', hidden: true, icon: { sprite: 3 } },
  { code: 'worth-it', group: 'actions', name: 'Ça valait le coup', desc: 'Faire évoluer une carte chromatique.', tier: 'c', hidden: true, icon: { sprite: 133 } },
  { code: 'patient-fisher', group: 'actions', name: 'Pêcheur patient', desc: 'Avoir 10 Magicarpe sans en avoir jamais fait évoluer.', tier: 'u', hidden: true, icon: { sprite: 129 } },
  { code: 'gyarados', group: 'actions', name: 'Patience récompensée', desc: 'Faire évoluer Magicarpe en Léviator.', tier: 'u', hidden: true, icon: { sprite: 130 } },
  { code: 'cards-100', group: 'volume', name: '100 cartes', desc: 'Ouvrir 100 cartes.', tier: 'c', hidden: false, icon: { glyph: '100' }, target: 100 },
  { code: 'cards-500', group: 'volume', name: '500 cartes', desc: 'Ouvrir 500 cartes.', tier: 'u', hidden: false, icon: { glyph: '500' }, target: 500 },
  { code: 'cards-1000', group: 'volume', name: '1 000 cartes', desc: 'Ouvrir 1 000 cartes.', tier: 'u', hidden: false, icon: { glyph: '1k' }, target: 1000 },
  { code: 'cards-2500', group: 'volume', name: '2 500 cartes', desc: 'Ouvrir 2 500 cartes.', tier: 'l', hidden: false, icon: { glyph: '2,5k' }, target: 2500 },
  { code: 'cards-5000', group: 'volume', name: '5 000 cartes', desc: 'Ouvrir 5 000 cartes.', tier: 'l', hidden: false, icon: { glyph: '5k' }, target: 5000 },
  { code: 'gen2-1', group: 'gen2', name: 'Nouvelle région', desc: 'Avoir une espèce de la 2e génération.', tier: 'u', hidden: false, icon: { sprite: 152 } },
  { code: 'gen2-25', group: 'gen2', name: 'Johto 25', desc: 'Avoir 25 espèces de la 2e génération.', tier: 'r', hidden: false, icon: { glyph: '25' }, target: 25 },
  { code: 'gen2-50', group: 'gen2', name: 'Johto 50', desc: 'Avoir 50 espèces de la 2e génération.', tier: 'l', hidden: false, icon: { glyph: '50' }, target: 50 },
  { code: 'gen2-100', group: 'gen2', name: 'Johto complet', desc: 'Avoir les 100 espèces de la 2e génération.', tier: 'l', hidden: false, icon: { glyph: '100' }, target: 100 },
  { code: 'gen2-legendary', group: 'gen2', name: 'Légende de Johto', desc: 'Avoir un légendaire de la 2e génération.', tier: 'l', hidden: false, icon: { sprite: 250 } },
  { code: 'beasts', group: 'gen2', name: 'Les trois bêtes', desc: 'Avoir Raikou, Entei et Suicune.', tier: 'l', hidden: true, icon: { sprite: 245 } },
  { code: 'arena-win-1', group: 'arena', name: 'Première victoire', desc: 'Gagner un duel contre un collègue.', tier: 'c', hidden: false, icon: { sprite: 66 } },
  { code: 'arena-streak-3', group: 'arena', name: 'Trois à la suite', desc: 'Gagner 3 duels d’affilée.', tier: 'u', hidden: false, icon: { glyph: '×3' } },
  { code: 'arena-streak-5', group: 'arena', name: 'Cinq à la suite', desc: 'Gagner 5 duels d’affilée.', tier: 'r', hidden: false, icon: { glyph: '×5' } },
  { code: 'underdog', group: 'arena', name: 'David contre Goliath', desc: 'Gagner un duel avec moins de 30 % de chances.', tier: 'u', hidden: true, icon: { sprite: 129 } },
  { code: 'giant-slayer', group: 'arena', name: 'Tombeur de légende', desc: 'Battre un légendaire en duel.', tier: 'r', hidden: true, icon: { sprite: 150 } },
  { code: 'level-10', group: 'arena', name: 'Vétéran', desc: 'Mener un exemplaire au niveau 10.', tier: 'r', hidden: false, icon: { glyph: 'N10' } },
  { code: 'podium', group: 'arena', name: 'Sur le podium', desc: 'Finir une saison dans les trois premiers.', tier: 'r', hidden: false, icon: { glyph: '3e' } },
  { code: 'champion', group: 'arena', name: 'Champion de saison', desc: 'Finir une saison à la première place.', tier: 'l', hidden: false, icon: { glyph: '1er' } },
  { code: 'shop-1', group: 'arena', name: 'Premier achat', desc: 'Acheter un pli en boutique.', tier: 'c', hidden: false, icon: { glyph: '₽' } },
  { code: 'shop-10', group: 'arena', name: 'Habitué de la boutique', desc: 'Acheter 10 plis en boutique.', tier: 'u', hidden: false, icon: { glyph: '×10' }, target: 10 },
  { code: 'shop-20', group: 'arena', name: 'Client fidèle', desc: 'Acheter 20 plis en boutique.', tier: 'r', hidden: false, icon: { glyph: '×20' }, target: 20 },
  { code: 'shop-legendary', group: 'arena', name: 'Achat légendaire', desc: 'Obtenir un légendaire en boutique.', tier: 'r', hidden: false, icon: { sprite: 151 } },
  { code: 'sell-10', group: 'arena', name: 'Revendeur', desc: 'Revendre 10 cartes.', tier: 'c', hidden: false, icon: { glyph: '10₽' }, target: 10 },
  { code: 'sell-100', group: 'arena', name: 'Brocanteur', desc: 'Revendre 100 cartes.', tier: 'u', hidden: false, icon: { glyph: '100₽' }, target: 100 },
  { code: 'sell-1000', group: 'arena', name: 'Grossiste', desc: 'Revendre 1 000 cartes.', tier: 'l', hidden: false, icon: { glyph: '1k₽' }, target: 1000 },
]

export const BY_CODE = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]))

const MAGIKARP = 129
const GYARADOS = 130
const RARE_OR_BETTER = new Set(['r', 'l'])
const SHINY_STEPS = [3, 5, 10, 20, 50]
const TRIOS = {
  starters: [1, 4, 7],
  birds: [144, 145, 146],
  fossils: [138, 140, 142],
  'team-rocket': [23, 109, 52],
  eeveelutions: [134, 135, 136],
}
const CARD_STEPS = [100, 500, 1000, 2500, 5000]
const GEN2_STEPS = [25, 50, 100]
const SHOP_STEPS = [10, 20]
const SELL_STEPS = [10, 100, 1000]
const BEASTS = [243, 244, 245]
const day = (ts) => (ts ? String(ts).slice(0, 10) : null)
const pad = (n) => String(n).padStart(2, '0')
/** Le dernier jour d'une saison, en date locale comme `seasonBounds`. */
const seasonEndDay = (season) => {
  const { end } = seasonBounds(season)
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
}
const isPalindrome = (n) => n >= 100 && String(n) === [...String(n)].reverse().join('')
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
export function evaluate({ catches, claimed, evolutions, others = [], arena = null }) {
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
    // L'arène tient les évolutions côté serveur et les nomme `evo:<id>` : la clé vient alors
    // avec l'entrée. Sans elle, c'est le rang dans `state.evolutions`.
    const evo = { ...e, fromKey, key: e.key ?? `evo:${i}`, shiny: src?.shiny ?? false, src }
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
    for (const n of SHINY_STEPS) if (shinyOwned.size >= n) hit(`shiny-species-${n}`, ev.date, ev.key)
    for (const [code, trio] of Object.entries(TRIOS)) if (trio.every((s) => owned.has(s))) hit(code, ev.date, ev.key)
    if (lineageDone(ev.species)) hit('lineage-1', ev.date, ev.key)
  }

  // ── Volume et 2e génération ──
  const byDay = [...open].sort(byDate)
  for (const n of CARD_STEPS) if (byDay.length >= n) hit(`cards-${n}`, byDay[n - 1].date, byDay[n - 1].key)
  const gen2 = new Set()
  for (const ev of events) {
    if (DEX[ev.species]?.gen !== 2) continue
    gen2.add(ev.species)
    hit('gen2-1', ev.date, ev.key)
    for (const n of GEN2_STEPS) if (gen2.size >= n) hit(`gen2-${n}`, ev.date, ev.key)
    if (DEX[ev.species].tier === 'l') hit('gen2-legendary', ev.date, ev.key)
    if (BEASTS.every((s) => gen2.has(s))) hit('beasts', ev.date, ev.key)
  }

  // ── Boutique : un pli acheté devient une capture de source `boutique`. ──
  const bought = [...catches].filter((c) => c.source === 'boutique').sort(byDate)
  if (bought.length) hit('shop-1', bought[0].date, entryKey(bought[0].source, bought[0].external_id))
  for (const n of SHOP_STEPS) {
    if (bought.length >= n) hit(`shop-${n}`, bought[n - 1].date, entryKey(bought[n - 1].source, bought[n - 1].external_id))
  }
  const legendBuy = bought.find((c) => DEX[c.species]?.tier === 'l')
  if (legendBuy) hit('shop-legendary', legendBuy.date, entryKey(legendBuy.source, legendBuy.external_id))

  // ── Arène : seuls les duels contre un collègue comptent, pas l'entraînement contre l'ordinateur. ──
  if (arena?.userId) {
    const me = arena.userId
    const duels = (arena.duels ?? [])
      .filter((d) => d.status === 'resolved' && (d.challenger_id === me || d.opponent_id === me))
      .sort((a, b) => (a.resolved_at < b.resolved_at ? -1 : a.resolved_at > b.resolved_at ? 1 : a.id - b.id))
    let streak = 0
    for (const d of duels) {
      const mine = d.challenger_id === me
      const won = d.winner_id === me
      const date = day(d.resolved_at)
      const key = `duel:${d.id}`
      streak = won ? streak + 1 : 0
      if (!won) continue
      hit('arena-win-1', date, key)
      if (streak >= 3) hit('arena-streak-3', date, key)
      if (streak >= 5) hit('arena-streak-5', date, key)
      // `probability` est la chance du challengeur : celle de qui relève en est le complément.
      const chance = mine ? d.probability : 1 - d.probability
      if (chance != null && chance < 0.3) hit('underdog', date, key)
      const foe = mine ? d.opponent_species : d.challenger_species
      if (DEX[foe]?.tier === 'l') hit('giant-slayer', date, key)
    }
    // Un niveau ne monte qu'en gagnant : la date est celle de la dernière victoire de l'exemplaire.
    for (const ex of arena.exemplars ?? []) {
      if (ex.level < 10) continue
      const last = [...duels].reverse().find((d) => d.winner_id === me
        && (d.challenger_key === ex.entry_key || d.opponent_key === ex.entry_key))
      if (last) { hit('level-10', day(last.resolved_at), ex.entry_key); break }
    }
    const podiums = (arena.seasons ?? [])
      .filter((s) => [s.first_id, s.second_id, s.third_id].includes(me))
      .sort((a, b) => (a.season < b.season ? -1 : 1))
    if (podiums.length) hit('podium', seasonEndDay(podiums[0].season), `saison:${podiums[0].season}`)
    const won = podiums.find((s) => s.first_id === me)
    if (won) hit('champion', seasonEndDay(won.season), `saison:${won.season}`)
    const sold = (arena.exemplars ?? []).filter((e) => e.sold_at).sort((a, b) => (a.sold_at < b.sold_at ? -1 : 1))
    for (const n of SELL_STEPS) if (sold.length >= n) hit(`sell-${n}`, day(sold[n - 1].sold_at), sold[n - 1].entry_key)
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
    // 1 carte sur 25 600 (0,5 % × 1/128). Un légendaire n'évolue d'aucune espèce : seul le tirage compte.
    if (c.shiny && c.tier === 'l') hit('shiny-legendary', c.date, c.key)
    if (c.shiny && seq.slice(Math.max(0, i - 10), i).some((x) => x.open && x.shiny)) hit('shiny-double', c.date, c.key)
    if (c.source === 'github' && prNumber(c) !== null && prNumber(c) % 1000 === c.species) hit('lucky-number', c.date, c.key)
    if (c.source === 'github' && prNumber(c) !== null && isPalindrome(prNumber(c))) hit('palindrome', c.date, c.key)
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
  for (const n of SHINY_STEPS) progress[`shiny-species-${n}`] = { current: shinyOwned.size, target: n }
  for (const n of [5, 10]) progress[`mt-${n}`] = { current: sessions.size, target: n }
  for (const n of CARD_STEPS) progress[`cards-${n}`] = { current: open.length, target: n }
  for (const n of GEN2_STEPS) progress[`gen2-${n}`] = { current: gen2.size, target: n }
  for (const n of SHOP_STEPS) progress[`shop-${n}`] = { current: bought.length, target: n }
  const soldCount = (arena?.exemplars ?? []).filter((e) => e.sold_at).length
  for (const n of SELL_STEPS) progress[`sell-${n}`] = { current: soldCount, target: n }

  return { unlocked, progress }
}
