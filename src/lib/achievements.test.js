import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS, BY_CODE, evaluate } from './achievements.js'
import { entryKey } from '../../shared/entry.js'

const D = '2026-06-01'
const gh = (id, species, { shiny = false, date = D, pr = null } = {}) =>
  ({ source: 'github', external_id: id, species, shiny, date, ref: pr === null ? null : `moi/atlas#${pr} · ${id}` })
const mt = (session, n, species, { shiny = false, date = D } = {}) =>
  ({ source: 'slack', external_id: `monkey-testing:${session}:U1:${n}`, ref: 'monkey-testing', species, shiny, date })
const key = (c) => entryKey(c.source, c.external_id)
/** Tout est ouvert sauf `sealed` (liste d'external_id). */
const run = (catches, { sealed = [], evolutions = [], others = [] } = {}) =>
  evaluate({ catches, claimed: catches.filter((c) => !sealed.includes(c.external_id)).map(key), evolutions, others })
const codes = (r) => Object.keys(r.unlocked).sort()
const evo = (species, from, fromKey, date = D) => ({ species, from, fromKey, date })

describe('catalogue', () => {
  it('compte 65 succès aux codes uniques, chacun avec un palier de carte', () => {
    expect(ACHIEVEMENTS).toHaveLength(65)
    expect(Object.keys(BY_CODE)).toHaveLength(65)
    for (const a of ACHIEVEMENTS) expect(['c', 'u', 'r', 'l']).toContain(a.tier)
  })

  it('ne cache que les coups de dés, les actions, les trios et les exploits', () => {
    const autres = ['starters', 'birds', 'fossils', 'team-rocket', 'eeveelutions', 'beasts', 'underdog', 'giant-slayer', 'noel-elves']
    for (const a of ACHIEVEMENTS) expect(a.hidden).toBe(a.group === 'dice' || a.group === 'actions' || autres.includes(a.code))
  })
})

describe('evaluate — édition Noël', () => {
  const card = (member, date, opened = true, key = `noel:crm:${member}`) =>
    ({ key, member, date, opened_at: opened ? date + 'T10:00:00Z' : null })
  const withTeam = (team) => evaluate({ catches: [], claimed: [], evolutions: [], team })
  const members = ['ada', 'basile', 'chloe']

  it('débloque l’atelier au complet, daté de la carte qui complète', () => {
    const r = withTeam({ members, cards: [card('basile', '2026-12-20'), card('ada', '2026-12-16'), card('chloe', '2026-12-25', true, 'noel:2026'), card('ada', '2026-12-30')] })
    expect(r.unlocked['noel-elves']).toEqual({ date: '2026-12-25', triggerKey: 'noel:2026' })
  })

  it('attend que chaque lutin soit ouvert', () => {
    expect(withTeam({ members, cards: [card('ada', '2026-12-16'), card('basile', '2026-12-20'), card('chloe', '2026-12-21', false)] }).unlocked['noel-elves']).toBeUndefined()
  })

  it('rien sans équipe chargée ni membre', () => {
    expect(withTeam(null).unlocked['noel-elves']).toBeUndefined()
    expect(withTeam({ members: [], cards: [] }).unlocked['noel-elves']).toBeUndefined()
  })
})

describe('evaluate — collection', () => {
  it('rien pour un joueur sans carte', () => {
    expect(codes(run([]))).toEqual([])
  })

  it('premier chromatique, daté de la capture', () => {
    const r = run([gh('a', 19), gh('b', 25, { shiny: true, date: '2026-06-03' })])
    expect(r.unlocked['shiny-1']).toEqual({ date: '2026-06-03', triggerKey: 'github:b' })
  })

  it('une carte scellée ne débloque rien', () => {
    expect(run([gh('b', 25, { shiny: true })], { sealed: ['b'] }).unlocked['shiny-1']).toBeUndefined()
  })

  it('50 espèces : progression puis déblocage à la 50e', () => {
    const cards = Array.from({ length: 50 }, (_, i) => gh(`s${i}`, i + 1, { date: `2026-06-${String(i % 28 + 1).padStart(2, '0')}` }))
    expect(run(cards.slice(0, 49)).progress['species-50']).toEqual({ current: 49, target: 50 })
    expect(run(cards.slice(0, 49)).unlocked['species-50']).toBeUndefined()
    expect(run(cards).unlocked['species-50']).toBeDefined()
  })

  it('une espèce obtenue par évolution compte au dex', () => {
    const r = run([gh('a', 1)], { evolutions: [evo(2, 1, 'github:a')] })
    expect(r.progress['species-50'].current).toBe(2)
  })

  it('une lignée complète, évolutions comprises', () => {
    const r = run([gh('a', 1), gh('b', 1)], { evolutions: [evo(2, 1, 'github:a', '2026-06-02'), evo(3, 2, 'evo:0', '2026-06-05')] })
    expect(r.unlocked['lineage-1']).toEqual({ date: '2026-06-05', triggerKey: 'evo:1' })
  })

  it('une espèce sans évolution ne complète pas de lignée', () => {
    expect(run([gh('a', 128)]).unlocked['lineage-1']).toBeUndefined()
  })

  it('3 espèces chromatiques, un chromatique évolué compris', () => {
    const r = run([gh('a', 1, { shiny: true }), gh('b', 25, { shiny: true })], { evolutions: [evo(2, 1, 'github:a')] })
    expect(r.progress['shiny-species-3'].current).toBe(3)
    expect(r.unlocked['shiny-species-3']).toBeDefined()
  })

  it('les paliers chromatiques vont de 3 à 50 espèces', () => {
    const shinies = Array.from({ length: 50 }, (_, i) => gh(`s${i}`, i + 1, { shiny: true }))
    expect(codes(run(shinies.slice(0, 49))).filter((c) => c.startsWith('shiny-species')))
      .toEqual(['shiny-species-10', 'shiny-species-20', 'shiny-species-3', 'shiny-species-5'])
    expect(run(shinies).unlocked['shiny-species-50']).toBeDefined()
    expect(run(shinies).progress['shiny-species-50']).toEqual({ current: 50, target: 50 })
  })

  it('un trio se complète à la date du troisième, évolution comprise', () => {
    const r = run([gh('a', 1), gh('b', 4, { date: '2026-06-03' }), gh('c', 7, { date: '2026-06-02' })])
    expect(r.unlocked.starters).toEqual({ date: '2026-06-03', triggerKey: 'github:b' })
    const eevee = run([gh('a', 133), gh('b', 133), gh('c', 134)], {
      evolutions: [evo(135, 133, 'github:a', '2026-06-04'), evo(136, 133, 'github:b', '2026-06-08')],
    })
    expect(eevee.unlocked.eeveelutions).toEqual({ date: '2026-06-08', triggerKey: 'evo:1' })
    expect(run([gh('a', 144), gh('b', 145)]).unlocked.birds).toBeUndefined()
  })

  it('ignore une évolution malformée sans décaler les clés evo:i', () => {
    const r = run([gh('a', 1, { shiny: true })], { evolutions: [null, evo(2, 1, 'github:a')] })
    expect(r.unlocked['worth-it'].triggerKey).toBe('evo:1')
  })
})

describe('evaluate — monkey-testing', () => {
  it('une session compte dès une carte ouverte', () => {
    const r = run([mt('s1', 1, 19), mt('s1', 2, 20)], { sealed: ['monkey-testing:s1:U1:2'] })
    expect(r.unlocked['mt-1'].triggerKey).toBe('slack:monkey-testing:s1:U1:1')
  })

  it('5 sessions distinctes pour Habitué, pas 5 cartes', () => {
    const oneSession = Array.from({ length: 5 }, (_, n) => mt('s1', n + 1, 19))
    expect(run(oneSession).progress['mt-5'].current).toBe(1)
    const five = Array.from({ length: 5 }, (_, n) => mt(`s${n}`, 1, 19))
    expect(run(five).unlocked['mt-5']).toBeDefined()
  })

  it('booster doré : 3 rares ou mieux dans la même session seulement', () => {
    expect(run([mt('s1', 1, 1), mt('s1', 2, 4), mt('s1', 3, 144)]).unlocked['golden-booster']).toBeDefined()
    expect(run([mt('s1', 1, 1), mt('s1', 2, 4), mt('s2', 1, 144)]).unlocked['golden-booster']).toBeUndefined()
  })

  it('booster chromatique, pas pour un chromatique GitHub', () => {
    expect(run([mt('s1', 1, 19, { shiny: true })]).unlocked['shiny-booster']).toBeDefined()
    expect(run([gh('a', 19, { shiny: true })]).unlocked['shiny-booster']).toBeUndefined()
  })

  it('double casquette : une carte de chaque source, datée de la seconde', () => {
    const r = run([gh('a', 19, { date: '2026-06-01' }), mt('s1', 1, 19, { date: '2026-06-09' })])
    expect(r.unlocked['two-hats'].date).toBe('2026-06-09')
    expect(run([gh('a', 19)]).unlocked['two-hats']).toBeUndefined()
  })
})

describe('evaluate — coups de dés', () => {
  it('déjà-vu : même espèce d’affilée', () => {
    expect(run([gh('a', 19), gh('b', 19)]).unlocked['deja-vu'].triggerKey).toBe('github:b')
    expect(run([gh('a', 19), gh('x', 25), gh('b', 19)]).unlocked['deja-vu']).toBeUndefined()
  })

  it('déjà-vu : une carte scellée au milieu casse la suite', () => {
    expect(run([gh('a', 19), gh('x', 19), gh('b', 25)], { sealed: ['x'] }).unlocked['deja-vu']).toBeUndefined()
    expect(run([gh('a', 19), gh('x', 25), gh('b', 19)], { sealed: ['x'] }).unlocked['deja-vu']).toBeUndefined()
  })

  it('l’ordre suit la date, puis l’ordre reçu', () => {
    const r = run([gh('b', 19, { date: '2026-06-05' }), gh('x', 25, { date: '2026-06-03' }), gh('a', 19, { date: '2026-06-05' })])
    expect(r.unlocked['deja-vu'].triggerKey).toBe('github:a')
  })

  it('sur la tête : une carte puis sa propre évolution', () => {
    expect(run([gh('a', 1), gh('b', 2)]).unlocked['on-top']).toBeDefined()
    expect(run([gh('a', 2), gh('b', 1)]).unlocked['on-top']).toBeUndefined()
    expect(run([gh('a', 133), gh('b', 135)]).unlocked['on-top']).toBeDefined() // Évoli → Voltali
  })

  it('main chaude : 3 rares ou légendaires d’affilée', () => {
    expect(run([gh('a', 1), gh('b', 4), gh('c', 144)]).unlocked['hot-hand']).toBeDefined()
    expect(run([gh('a', 1), gh('b', 4), gh('n', 19), gh('c', 7)]).unlocked['hot-hand']).toBeUndefined()
  })

  it('chance du débutant : seulement dans les 10 premières cartes, scellées comprises', () => {
    const nine = Array.from({ length: 9 }, (_, i) => gh(`n${i}`, 19))
    expect(run([...nine, gh('l', 144)]).unlocked['beginner-luck']).toBeDefined()
    expect(run([...nine, gh('z', 19), gh('l', 144)]).unlocked['beginner-luck']).toBeUndefined()
  })

  it('doublé chromatique : 10 cartes d’écart au plus', () => {
    const gap = (n) => [gh('s1', 19, { shiny: true }), ...Array.from({ length: n - 1 }, (_, i) => gh(`g${i}`, 25)), gh('s2', 16, { shiny: true })]
    expect(run(gap(10)).unlocked['shiny-double']).toBeDefined()
    expect(run(gap(11)).unlocked['shiny-double']).toBeUndefined()
  })

  it('gros veinard : un légendaire chromatique, ouvert', () => {
    expect(run([gh('a', 19), gh('m', 150, { shiny: true, date: '2026-06-04' })]).unlocked['shiny-legendary'])
      .toEqual({ date: '2026-06-04', triggerKey: 'github:m' })
    expect(run([gh('m', 150)]).unlocked['shiny-legendary']).toBeUndefined()
    expect(run([gh('a', 25, { shiny: true })]).unlocked['shiny-legendary']).toBeUndefined()
    expect(run([gh('m', 150, { shiny: true })], { sealed: ['m'] }).unlocked['shiny-legendary']).toBeUndefined()
  })

  it('doublé chromatique : la description dit la même règle que le code, écart de 10 compris', () => {
    expect(BY_CODE['shiny-double'].desc).toBe('Tirer 2 chromatiques à 10 cartes d’écart au plus.')
  })

  it('numéro gagnant : les 3 derniers chiffres de la PR', () => {
    expect(run([gh('a', 25, { pr: 4025 })]).unlocked['lucky-number']).toBeDefined()
    expect(run([gh('a', 25, { pr: 25 })]).unlocked['lucky-number']).toBeDefined()
    expect(run([gh('a', 25, { pr: 4026 })]).unlocked['lucky-number']).toBeUndefined()
    expect(run([gh('a', 25)]).unlocked['lucky-number']).toBeUndefined() // ref absent
    expect(run([{ ...gh('a', 25), ref: 'pas un numéro' }]).unlocked['lucky-number']).toBeUndefined()
  })

  it('palindrome : un numéro de PR de 3 chiffres ou plus qui se lit dans les deux sens', () => {
    expect(run([gh('a', 25, { pr: 121 })]).unlocked.palindrome).toBeDefined()
    expect(run([gh('a', 25, { pr: 4004 })]).unlocked.palindrome).toBeDefined()
    expect(run([gh('a', 25, { pr: 44 })]).unlocked.palindrome).toBeUndefined()
    expect(run([gh('a', 25, { pr: 123 })]).unlocked.palindrome).toBeUndefined()
    expect(run([gh('a', 25)]).unlocked.palindrome).toBeUndefined()
  })

  it('jumeaux : même espèce, même date qu’un coéquipier', () => {
    const others = [{ species: 19, date: '2026-06-01' }]
    expect(run([gh('a', 19)], { others }).unlocked.twins).toBeDefined()
    expect(run([gh('a', 19, { date: '2026-06-02' })], { others }).unlocked.twins).toBeUndefined()
  })
})

describe('evaluate — actions', () => {
  it('ça valait le coup : faire évoluer un chromatique', () => {
    expect(run([gh('a', 1, { shiny: true })], { evolutions: [evo(2, 1, 'github:a')] }).unlocked['worth-it']).toBeDefined()
    expect(run([gh('a', 1)], { evolutions: [evo(2, 1, 'github:a')] }).unlocked['worth-it']).toBeUndefined()
  })

  it('le grand saut : un même exemplaire, deux évolutions', () => {
    expect(run([gh('a', 1)], { evolutions: [evo(2, 1, 'github:a'), evo(3, 2, 'evo:0')] }).unlocked['big-leap'].triggerKey).toBe('evo:1')
    expect(run([gh('a', 1), gh('b', 2)], { evolutions: [evo(2, 1, 'github:a'), evo(3, 2, 'github:b')] }).unlocked['big-leap']).toBeUndefined()
  })

  it('sitôt dit : évoluer le jour de la capture', () => {
    expect(run([gh('a', 1, { date: '2026-06-01' })], { evolutions: [evo(2, 1, 'github:a', '2026-06-01')] }).unlocked['right-away']).toBeDefined()
    expect(run([gh('a', 1, { date: '2026-06-01' })], { evolutions: [evo(2, 1, 'github:a', '2026-06-02')] }).unlocked['right-away']).toBeUndefined()
  })

  it('trop tard : tirer une espèce après l’avoir obtenue par évolution', () => {
    const cards = [gh('a', 1, { date: '2026-06-01' }), gh('b', 2, { date: '2026-06-09' })]
    expect(run(cards, { evolutions: [evo(2, 1, 'github:a', '2026-06-05')] }).unlocked['too-late'].triggerKey).toBe('github:b')
    expect(run(cards, { evolutions: [evo(2, 1, 'github:a', '2026-06-09')] }).unlocked['too-late']).toBeUndefined()
  })

  it('pêcheur patient : 10 Magicarpe avant toute évolution de Magicarpe', () => {
    const fish = Array.from({ length: 10 }, (_, i) => gh(`m${i}`, 129, { date: `2026-06-${String(i + 1).padStart(2, '0')}` }))
    expect(run(fish).unlocked['patient-fisher'].triggerKey).toBe('github:m9')
    expect(run(fish, { evolutions: [evo(130, 129, 'github:m0', '2026-06-05')] }).unlocked['patient-fisher']).toBeUndefined()
  })

  it('patience récompensée : une évolution vers Léviator', () => {
    expect(run([gh('m', 129)], { evolutions: [evo(130, 129, 'github:m')] }).unlocked.gyarados).toBeDefined()
  })
})

describe('volume, 2e génération et boutique', () => {
  it('compte les cartes ouvertes, pas celles encore scellées', () => {
    const cards = Array.from({ length: 100 }, (_, i) => gh(`v${i}`, 19, { date: `2026-0${1 + Math.floor(i / 30)}-01` }))
    expect(run(cards).unlocked['cards-100']).toBeDefined()
    expect(run(cards, { sealed: ['v99'] }).unlocked['cards-100']).toBeUndefined()
    expect(run(cards).progress['cards-500']).toEqual({ current: 100, target: 500 })
  })

  it('compte les espèces de la 2e génération, évolutions comprises', () => {
    const r = run([gh('a', 152), gh('b', 155)], { evolutions: [evo(156, 155, 'github:b', '2026-06-03')] })
    expect(r.unlocked['gen2-1']).toBeDefined()
    expect(r.progress['gen2-25']).toEqual({ current: 3, target: 25 })
    expect(run([gh('a', 1)]).unlocked['gen2-1']).toBeUndefined()
  })

  it('les trois bêtes et le légendaire de Johto', () => {
    const r = run([gh('a', 243), gh('b', 244, { date: '2026-06-02' }), gh('c', 245, { date: '2026-06-05' })])
    expect(r.unlocked.beasts).toEqual({ date: '2026-06-05', triggerKey: 'github:c' })
    expect(r.unlocked['gen2-legendary']).toBeDefined()
  })

  it('compte les plis achetés en boutique, ouverts ou non', () => {
    const buy = (i, species = 19) => ({ source: 'boutique', external_id: String(i), species, shiny: false, date: `2026-12-${String(i + 1).padStart(2, '0')}` })
    const bought = Array.from({ length: 10 }, (_, i) => buy(i))
    const r = run(bought, { sealed: ['3'] })
    expect(r.unlocked['shop-1'].triggerKey).toBe('boutique:0')
    expect(r.unlocked['shop-10'].date).toBe('2026-12-10')
    expect(r.unlocked['shop-legendary']).toBeUndefined()
    expect(run([buy(0, 150)]).unlocked['shop-legendary']).toBeDefined()
  })
})

describe('arène', () => {
  const ME = 'u-moi'
  let id = 0
  const duel = (won, { me = 'challenger', p = 0.5, foe = 19, status = 'resolved', at = '2026-12-02T10:00:00Z', key = 'github:x' } = {}) => {
    const mine = me === 'challenger'
    return {
      id: ++id, status, resolved_at: at, probability: p,
      challenger_id: mine ? ME : 'u-autre', opponent_id: mine ? 'u-autre' : ME,
      challenger_key: mine ? key : 'autre:1', opponent_key: mine ? 'autre:1' : key,
      challenger_species: mine ? 25 : foe, opponent_species: mine ? foe : 25,
      winner_id: won ? ME : 'u-autre',
    }
  }
  const arena = (duels, extra = {}) => ({ userId: ME, duels, exemplars: [], seasons: [], ...extra })
  const play = (a) => evaluate({ catches: [], claimed: [], evolutions: [], arena: a })

  it('ne compte que les duels contre un collègue', () => {
    expect(play(arena([duel(true, { status: 'computer' })])).unlocked['arena-win-1']).toBeUndefined()
    expect(play(arena([duel(true)])).unlocked['arena-win-1'].date).toBe('2026-12-02')
  })

  it('une défaite coupe la série', () => {
    const t = (d) => `2026-12-0${d}T10:00:00Z`
    const coupee = [duel(true, { at: t(1) }), duel(true, { at: t(2) }), duel(false, { at: t(3) }), duel(true, { at: t(4) })]
    expect(play(arena(coupee)).unlocked['arena-streak-3']).toBeUndefined()
    const suite = [duel(true, { at: t(1) }), duel(true, { at: t(2) }), duel(true, { at: t(3) })]
    expect(play(arena(suite)).unlocked['arena-streak-3'].date).toBe('2026-12-03')
  })

  it('lit la chance du côté du joueur, qu’il ait posté ou relevé le défi', () => {
    expect(play(arena([duel(true, { p: 0.2 })])).unlocked.underdog).toBeDefined()
    expect(play(arena([duel(true, { me: 'opponent', p: 0.2 })])).unlocked.underdog).toBeUndefined()
    expect(play(arena([duel(true, { me: 'opponent', p: 0.8 })])).unlocked.underdog).toBeDefined()
  })

  it('bat un légendaire, de quelque côté qu’il soit', () => {
    expect(play(arena([duel(true, { foe: 150 })])).unlocked['giant-slayer']).toBeDefined()
    expect(play(arena([duel(true, { me: 'opponent', foe: 150 })])).unlocked['giant-slayer']).toBeDefined()
    expect(play(arena([duel(false, { foe: 150 })])).unlocked['giant-slayer']).toBeUndefined()
  })

  it('date le niveau 10 de la dernière victoire de l’exemplaire', () => {
    const a = arena([duel(true, { at: '2026-12-05T09:00:00Z' })], { exemplars: [{ entry_key: 'github:x', level: 10 }] })
    expect(play(a).unlocked['level-10']).toEqual({ date: '2026-12-05', triggerKey: 'github:x' })
  })

  it('podium et titre de champion, datés du dernier jour de la saison', () => {
    const seasons = [
      { season: '2026-S6', podium: [{ user_id: 'u-autre', rank: 1, prize: 0 }, { user_id: ME, rank: 2, prize: 0 }] },
      { season: '2027-S1', podium: [{ user_id: ME, rank: 1, prize: 0 }] },
    ]
    const r = play(arena([], { seasons }))
    expect(r.unlocked.podium).toEqual({ date: '2027-01-31', triggerKey: 'saison:2026-S6' })
    expect(r.unlocked.champion).toEqual({ date: '2027-03-31', triggerKey: 'saison:2027-S1' })
  })

  it('fait champion un premier ex aequo', () => {
    const seasons = [{ season: '2026-S6', podium: [
      { user_id: 'u-autre', rank: 1, prize: 750 }, { user_id: ME, rank: 1, prize: 750 },
    ] }]
    expect(play(arena([], { seasons })).unlocked.champion).toEqual({ date: '2027-01-31', triggerKey: 'saison:2026-S6' })
  })

  it('compte les cartes revendues', () => {
    const exemplars = Array.from({ length: 10 }, (_, i) => ({ entry_key: `github:s${i}`, level: 1, sold_at: `2026-12-${String(i + 1).padStart(2, '0')}T08:00:00Z` }))
    const r = play(arena([], { exemplars }))
    expect(r.unlocked['sell-10']).toEqual({ date: '2026-12-10', triggerKey: 'github:s9' })
    expect(r.progress['sell-100']).toEqual({ current: 10, target: 100 })
  })

  it('ne lit rien de l’arène sans joueur identifié', () => {
    expect(play(null).unlocked['arena-win-1']).toBeUndefined()
  })
})

describe('Rémi pleure', () => {
  it('se débloque au 50e Nidoran ouvert, mâles et femelles confondus', () => {
    const nido = Array.from({ length: 50 }, (_, i) => gh(`n${i}`, i % 2 ? 29 : 32, { date: `2026-0${1 + Math.floor(i / 10)}-15` }))
    expect(run(nido).unlocked['remi-cries']).toEqual({ date: '2026-05-15', triggerKey: 'github:n49' })
    expect(run(nido, { sealed: ['n49'] }).unlocked['remi-cries']).toBeUndefined()
  })
})

