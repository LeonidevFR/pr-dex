import { ref } from 'vue'
import { useDex } from '../composables/useDex.js'
import { DEX, familyOf, familyLine, hasEvoInFamily, TIER_LABEL } from '../../shared/species.js'
import { entryKey } from '../../shared/entry.js'

const TIERS = ['c', 'u', 'r', 'l']
const DAY_MS = 24 * 60 * 60 * 1000

// Date pivot en 'YYYY-MM-DD' : les dates de capture sont des chaînes de ce format, une
// comparaison lexicale suffit et évite tout fuseau horaire.
function thirtyDaysBefore(today) {
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Les colonnes d'un joueur, calculées par le même `useDex` que son propre dex — c'est ce qui
 * garantit qu'un classement ne peut pas contredire le compteur /151 qu'il voit chez lui.
 * `catches` ne contient que des captures ouvertes (la base filtre), donc `claimed` est
 * simplement l'ensemble de leurs clés. `spent` reste vide : aucune colonne n'en dépend.
 */
export function playerStats(catches, evolutions, today) {
  // `state.evolutions` est écrit par son propriétaire, sans validation côté base : une entrée
  // malformée chez un seul joueur ne doit pas casser le panneau de toute l'équipe. Jusqu'ici
  // un état corrompu ne gênait que celui qui l'avait écrit ; c'est le premier écran où il
  // atteint les autres. On ne garde que ce que `useDex` sait lire.
  const evos = (Array.isArray(evolutions) ? evolutions : []).filter((e) => e && DEX[e.species])
  const state = ref({ claimed: catches.map((c) => entryKey(c.source, c.external_id)), spent: {}, evolutions: evos })
  const dex = useDex(ref(catches), state)

  const owned = new Set(Object.keys(dex.bySpecies.value).map(Number))
  const ofTier = (t) => [...owned].filter((id) => DEX[id].tier === t).length

  // Une lignée par famille, comptée une fois même si plusieurs de ses membres sont là.
  // Les familles sans évolution sont exclues : une capture les « compléterait ».
  const families = new Set([...owned].map(familyOf).filter(hasEvoInFamily))
  const lineages = [...families].filter((fam) => familyLine(fam).flat().every((id) => owned.has(id))).length

  const since = thirtyDaysBefore(today)
  const tiers = { c: 0, u: 0, r: 0, l: 0 }
  for (const c of catches) tiers[DEX[c.species].tier]++

  return {
    species: owned.size,
    // Compté sur les captures, pas sur le dex : un shiny évolué y apparaîtrait deux fois.
    shiny: catches.filter((c) => c.shiny).length,
    legendaries: ofTier('l'),
    rares: ofTier('r'),
    lineages,
    copies: catches.length,
    recent: catches.filter((c) => c.date > since).length,
    evolved: evos.length,
    tiers,
    speciesIds: [...owned],
  }
}

const byRank = (a, b) =>
  b.species - a.species ||
  b.shiny - a.shiny ||
  b.legendaries - a.legendaries ||
  a.login.localeCompare(b.login, 'fr', { sensitivity: 'base' })

/** Les lignes de `leaderboard_players()` → le classement affiché, rang compris. */
export function rankPlayers(rows, today) {
  return rows
    .map((r) => ({ login: r.login, avatarUrl: r.avatar_url ?? null, isMe: Boolean(r.is_me), ...playerStats(r.catches, r.evolutions, today) }))
    .sort(byRank)
    .map((p, i) => ({ rank: i + 1, ...p }))
}

const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0)
const oneIn = (shiny, total) => (shiny ? Math.round(total / shiny) : null)

/**
 * L'onglet Stats : les chiffres du joueur courant seul, `null` s'il n'a aucune ligne (donc
 * aucune capture ouverte). Les parts par palier se calculent sur les captures seules :
 * faire évoluer un Salamèche (rare) en Reptincel (peu commun) ne doit pas les déplacer.
 */
export function myStats(rows, today) {
  const me = rankPlayers(rows, today).find((p) => p.isMe)
  if (!me) return null
  return {
    opened: me.copies,
    species: me.species,
    tiers: TIERS.map((t) => ({ tier: t, label: TIER_LABEL[t], count: me.tiers[t], pct: pct(me.tiers[t], me.copies) })),
    shiny: { count: me.shiny, oneIn: oneIn(me.shiny, me.copies) },
    evolved: me.evolved,
  }
}

/**
 * Les trois chiffres d'en-tête de la vue Équipe. Le Pokédex collectif compte les espèces vues
 * par au moins un joueur : c'est l'objectif commun, celui où personne n'est dernier.
 */
export function teamTotals(rows, today) {
  const players = rankPlayers(rows, today)
  return {
    collective: new Set(players.flatMap((p) => p.speciesIds)).size,
    opened: players.reduce((n, p) => n + p.copies, 0),
    shiny: players.reduce((n, p) => n + p.shiny, 0),
  }
}
