import { describe, it, expect } from 'vitest'
import { FORMS, formOf } from '../shared/battle.js'
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
