import { describe, it, expect } from 'vitest'
import { playerStats, rankPlayers, teamStats } from './leaderboard.js'
import { WEIGHTS, SHINY_ODDS } from '../../shared/draw.js'

const TODAY = '2026-09-30'
const c = (id, species, { shiny = false, date = '2026-06-01' } = {}) =>
  ({ source: 'github', external_id: id, species, shiny, date })
const row = (login, catches, evolutions = [], isMe = false) =>
  ({ login, avatar_url: null, is_me: isMe, catches, evolutions })

describe('playerStats', () => {
  it('compte les espèces distinctes, évolutions comprises', () => {
    const s = playerStats([c('a', 1), c('b', 1), c('c', 4)], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:a' }], TODAY)
    expect(s.species).toBe(3)
    expect(s.copies).toBe(3)
  })

  it('un shiny évolué compte une seule fois', () => {
    const s = playerStats([c('a', 1, { shiny: true })], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:a' }], TODAY)
    expect(s.shiny).toBe(1)
  })

  it('compte les légendaires et les rares, un rare obtenu par évolution compris', () => {
    const s = playerStats(
      [c('a', 150), c('b', 2)],
      [{ species: 3, from: 2, date: '2026-06-02', fromKey: 'github:b' }],
      TODAY,
    )
    expect(s.legendaries).toBe(1)
    expect(s.rares).toBe(1) // Florizarre (3) est rare, Herbizarre (2) ne l'est pas
  })

  it('une lignée est complète quand toutes ses formes sont là, Évoli inclus', () => {
    const evoli = [c('a', 133), c('b', 134), c('c', 135), c('d', 136)]
    expect(playerStats(evoli, [], TODAY).lineages).toBe(1)
    expect(playerStats(evoli.slice(0, 3), [], TODAY).lineages).toBe(0)
  })

  it('une espèce sans évolution ne fait pas une lignée', () => {
    expect(playerStats([c('a', 143)], [], TODAY).lineages).toBe(0) // Ronflex
  })

  it('compte les captures des 30 derniers jours sur la date de merge', () => {
    const s = playerStats([c('a', 1, { date: '2026-09-29' }), c('b', 4, { date: '2026-08-01' })], [], TODAY)
    expect(s.recent).toBe(1)
  })

  it('compte les captures par palier, pas les évolutions', () => {
    const s = playerStats([c('a', 4), c('b', 10)], [{ species: 5, from: 4, date: '2026-06-02', fromKey: 'github:a' }], TODAY)
    expect(s.tiers).toEqual({ c: 1, u: 0, r: 1, l: 0 })
  })

  it('ne plante pas sur une évolution dont l’origine est inconnue', () => {
    const s = playerStats([c('a', 1)], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:zzz' }], TODAY)
    expect(s.species).toBe(2)
    expect(s.shiny).toBe(0)
  })

  it('traite des évolutions nulles comme un tableau vide', () => {
    expect(playerStats([c('a', 1)], null, TODAY).evolved).toBe(0)
  })

  it('ignore les évolutions malformées d’un autre joueur au lieu de planter', () => {
    const s = playerStats(
      [c('a', 1)],
      [{ species: 999, from: 1, date: '2026-06-02', fromKey: 'github:a' }, { species: 2, from: 1, date: '2026-06-02', fromKey: 'github:a' }, null],
      TODAY,
    )
    expect(s.species).toBe(2)
    expect(s.evolved).toBe(1)
    expect(playerStats([c('a', 1)], {}, TODAY).evolved).toBe(0)
  })
})

describe('rankPlayers', () => {
  it('classe par espèces, puis shiny, puis légendaires, puis login', () => {
    const rows = [
      row('zoe', [c('a', 1), c('b', 4)]),
      row('Anna', [c('a', 1), c('b', 4)]),
      row('bob', [c('a', 1), c('b', 4, { shiny: true })]),
      row('lea', [c('a', 1), c('b', 4), c('c', 7)]),
    ]
    expect(rankPlayers(rows, TODAY).map((p) => [p.rank, p.login])).toEqual([
      [1, 'lea'], [2, 'bob'], [3, 'Anna'], [4, 'zoe'],
    ])
  })

  it('porte login, avatar et is_me', () => {
    const [p] = rankPlayers([{ ...row('lea', [c('a', 1)], [], true), avatar_url: 'x.png' }], TODAY)
    expect(p).toMatchObject({ login: 'lea', avatarUrl: 'x.png', isMe: true })
  })
})

describe('teamStats', () => {
  it('somme les plis et les évolutions, et isole le joueur courant', () => {
    const rows = [
      row('a', [c('1', 1), c('2', 4)], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:1' }]),
      row('me', [c('3', 7)], [], true),
    ]
    const t = teamStats(rows, TODAY)
    expect(t.opened).toEqual({ team: 3, me: 1 })
    expect(t.evolved).toEqual({ team: 1, me: 0 })
  })

  it('calcule les taux par palier avec le nombre, et la théorie depuis WEIGHTS', () => {
    const t = teamStats([row('a', [c('1', 10), c('2', 10), c('3', 4), c('4', 150)])], TODAY)
    const r = t.tiers.find((x) => x.tier === 'r')
    expect(r.team).toEqual({ count: 1, pct: 25 })
    expect(r.theory).toBe(WEIGHTS.find(([tier]) => tier === 'r')[1] * 100)
    expect(t.tiers.map((x) => x.tier)).toEqual(['c', 'u', 'r', 'l'])
  })

  it('donne des taux à zéro sans division par zéro quand personne n’a rien', () => {
    const t = teamStats([], TODAY)
    expect(t.tiers.every((x) => x.team.pct === 0)).toBe(true)
    expect(t.shiny.team).toEqual({ count: 0, oneIn: null })
    expect(t.opened.me).toBeNull()
  })

  it('exprime le shiny en « 1 sur N » et lit la théorie dans SHINY_ODDS', () => {
    const catches = [c('1', 1, { shiny: true }), ...Array.from({ length: 63 }, (_, i) => c(`n${i}`, 1))]
    const t = teamStats([row('a', catches)], TODAY)
    expect(t.shiny.team).toEqual({ count: 1, oneIn: 64 })
    expect(t.shiny.theory).toBe(SHINY_ODDS)
  })

  it('le Pokédex collectif dédoublonne entre joueurs', () => {
    const t = teamStats([row('a', [c('1', 1), c('2', 4)]), row('b', [c('3', 4), c('4', 7)])], TODAY)
    expect(t.collective).toBe(3)
  })

  it('« me » est null partout quand aucune ligne n’est is_me', () => {
    const t = teamStats([row('a', [c('1', 1)])], TODAY)
    expect(t.opened.me).toBeNull()
    expect(t.shiny.me).toBeNull()
    expect(t.tiers[0].me).toBeNull()
  })
})
