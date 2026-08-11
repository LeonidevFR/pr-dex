import { describe, it, expect } from 'vitest'
import {
  FORMS, LEVEL_MAX, TIER_POWER, formOf, power, winProbability,
} from '../shared/battle.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const CLES = [
  'github:a3f8c21e9b', 'github:sha0', 'github:sha1', 'github:sha2',
  'arene:1', 'arene:2', 'boutique:7', 'github:0123456789abcdef',
]
const JOURS = ['2026-08-11', '2026-08-12', '2026-09-01', '2027-01-01']

describe.skipIf(!disponible)('parité de la forme du jour', () => {
  it('rend le même indice de forme que le JavaScript', async () => {
    const paires = CLES.flatMap((k) => JOURS.map((j) => [k, j]))
    const attendus = paires.map(([k, j]) => FORMS.indexOf(formOf(k, j)))
    const obtenus = await withDb(async (c) => {
      // `with ordinality` plutôt que de se fier à l'ordre de sortie de `unnest` : la
      // comparaison porte sur des tableaux position par position, elle n'a de sens que si
      // la ligne n de la requête correspond bien à la paire n du JavaScript.
      const { rows } = await c.query(
        `select arena_form_index(a, b) as i
         from unnest($1::text[], $2::text[]) with ordinality as t(a, b, n)
         order by n`,
        [paires.map((p) => p[0]), paires.map((p) => p[1])],
      )
      return rows.map((r) => r.i)
    })
    expect(obtenus).toEqual(attendus)
  })

  it('rend le même facteur que le JavaScript pour les cinq formes', async () => {
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select arena_form_factor(i) as f from generate_series(0, 4) i order by i')
      return rows.map((r) => Number(r.f))
    })
    expect(obtenus).toEqual(FORMS.map((f) => f.factor))
  })
})

describe.skipIf(!disponible)('parité de la puissance', () => {
  const ESPECES = [1, 4, 6, 16, 19, 20, 83, 129, 130, 145, 150]

  it('rend la même puissance que le JavaScript, tous niveaux et toutes formes', async () => {
    const cas = ESPECES.flatMap((s) =>
      [1, 3, 7, LEVEL_MAX].flatMap((l) => [0, 2, 4].map((f) => [s, l, f])))
    const attendus = cas.map(([s, l, f]) => power({ species: s, level: l, form: FORMS[f] }))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_power(s, l, f) as p
         from unnest($1::int[], $2::int[], $3::int[]) with ordinality as t(s, l, f, n)
         order by n`,
        [cas.map((x) => x[0]), cas.map((x) => x[1]), cas.map((x) => x[2])],
      )
      return rows.map((r) => Number(r.p))
    })
    // Égalité stricte et non `toBeCloseTo` : les deux côtés calculent en IEEE 754 sur les
    // mêmes valeurs, dans le même ordre — une différence, fût-elle au dernier bit, veut dire
    // que le SQL ne fait pas la même chose que le JavaScript, et il faut le savoir.
    expect(obtenus).toEqual(attendus)
  })

  it('reprend les coefficients de rareté à l’identique', async () => {
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select t as tier, arena_tier_power(t) as p from unnest($1::text[]) t',
        [['c', 'u', 'r', 'l']])
      return Object.fromEntries(rows.map((r) => [r.tier, Number(r.p)]))
    })
    expect(obtenus).toEqual(TIER_POWER)
  })
})

describe.skipIf(!disponible)('parité de la probabilité de victoire', () => {
  it('rend la même probabilité, bornage compris', async () => {
    const paires = [[400, 400], [355, 614], [253, 725], [1, 10000], [10000, 1], [515, 614]]
    const attendus = paires.map(([a, b]) => winProbability(a, b))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_win_probability(a, b) as p
         from unnest($1::float8[], $2::float8[]) with ordinality as t(a, b, n)
         order by n`,
        [paires.map((p) => p[0]), paires.map((p) => p[1])],
      )
      return rows.map((r) => Number(r.p))
    })
    // Douze décimales et non l'égalité stricte, seul endroit du combat où la parité au bit
    // près est hors d'atteinte : `^` appelle le `pow()` de la glibc, correctement arrondi,
    // là où le `**` de V8 s'en écarte d'un ulp sur certaines entrées. L'écart relatif
    // plafonne à 4,3e-16 — il ne changerait un vainqueur que si le tirage tombait dans cette
    // fenêtre. Partout ailleurs dans ce fichier, la comparaison reste stricte.
    for (let i = 0; i < attendus.length; i++) expect(obtenus[i]).toBeCloseTo(attendus[i], 12)
  })

  // Les cinq duels de référence de la spec § 3 : ce sont eux qui fixent l'équilibre du mode.
  it('reproduit les probabilités de référence de la spec', async () => {
    const duels = [[19, 145], [4, 6], [16, 6], [83, 20], [6, 6]]
    const attendus = duels.map(([a, b]) =>
      winProbability(power({ species: a }), power({ species: b })))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_win_probability(arena_power(a, 1, 2), arena_power(b, 1, 2)) as p
         from unnest($1::int[], $2::int[]) with ordinality as t(a, b, n)
         order by n`,
        [duels.map((d) => d[0]), duels.map((d) => d[1])])
      return rows.map((r) => Number(r.p))
    })
    for (let i = 0; i < attendus.length; i++) expect(obtenus[i]).toBeCloseTo(attendus[i], 12)
  })
})
