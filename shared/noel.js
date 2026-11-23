import { fnv1a } from './draw.js'

/**
 * L'easter egg de Noël : des cartes à l'effigie de l'équipe, décoratives. Elles ne vivent pas
 * dans `catches` mais dans `team_cards` : l'arène, la revente, le classement, les bonbons et les
 * succès lisent `catches`, et une carte équipe ne doit compter dans aucun d'eux.
 */

export const TEAM_ODDS = 15
const SEASON_START = '12-15'
const SEASON_END = '01-06'
const CHRISTMAS = '12-25'

/**
 * Rien de l'édition ne se montre avant le début de la première saison : ni étagère, ni popup,
 * ni bandeau. Après, l'étagère reste — une collection ne disparaît pas le 7 janvier.
 */
export const FIRST_SEASON_START = '2026-12-15'
export const noelStarted = (today) => today >= FIRST_SEASON_START

/** Saison qui contient `date` (`AAAA-MM-JJ`), désignée par l'année de son mois de décembre, ou null. */
export function noelSeasonOf(date) {
  const md = date.slice(5)
  const year = Number(date.slice(0, 4))
  if (md >= SEASON_START) return year
  if (md <= SEASON_END) return year - 1
  return null
}

/** Le booster garanti s'offre du 25 décembre à la fin de la saison. */
export function christmasGift(today) {
  const season = noelSeasonOf(today)
  if (season === null || today < `${season}-${CHRISTMAS}`) return null
  return { key: `noel:${season}`, date: `${season}-${CHRISTMAS}` }
}

/**
 * Un tirage de la saison donne en plus une carte équipe une fois sur `TEAM_ODDS`. Le seed est la
 * clé d'exemplaire, comme pour le Pokémon, avec son propre sel : les deux tirages sont
 * indépendants.
 */
export function teamBonus(seed, date) {
  return noelSeasonOf(date) !== null && fnv1a(seed + ':noel') % TEAM_ODDS === 0
}

/**
 * Le membre tiré, parmi les membres triés par identifiant : l'ordre de lecture en base ne change
 * pas le résultat. Ajouter un membre redistribue les tirages à venir, jamais ceux déjà stockés.
 */
export function pickMember(seed, members) {
  if (!members.length) return null
  const ids = members.map((m) => m.id).sort()
  return ids[fnv1a(seed + ':membre') % ids.length]
}
