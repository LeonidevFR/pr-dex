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
  it('compte 28 succès aux codes uniques, chacun avec un palier de carte', () => {
    expect(ACHIEVEMENTS).toHaveLength(28)
    expect(Object.keys(BY_CODE)).toHaveLength(28)
    for (const a of ACHIEVEMENTS) expect(['c', 'u', 'r', 'l']).toContain(a.tier)
  })

  it('ne cache que les coups de dés et les actions', () => {
    for (const a of ACHIEVEMENTS) expect(a.hidden).toBe(a.group === 'dice' || a.group === 'actions')
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
