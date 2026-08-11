import { describe, it, expect } from 'vitest'
import { seasonOf } from '../shared/arena-economy.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

/**
 * Le front doit savoir quelle saison lire sans faire un aller-retour pour le demander, d'où une
 * seconde implémentation. C'est le deuxième endroit du projet où une règle vit en double —
 * après la forme du jour — et il mérite le même garde-fou : une divergence afficherait le
 * classement d'une saison pendant que le serveur en alimenterait une autre.
 */
describe.skipIf(!disponible)('parité des saisons entre JavaScript et SQL', () => {
  it('accorde les deux implémentations sur deux années de bascules', async () => {
    const dates = []
    for (let mois = 0; mois < 24; mois++) {
      const d = new Date(Date.UTC(2026, mois, 1, 12))
      dates.push(d.toISOString())
      // Le dernier jour du mois : c'est là que les bornes se trompent, jamais au milieu.
      dates.push(new Date(Date.UTC(2026, mois + 1, 0, 12)).toISOString())
    }

    const attendus = dates.map((d) => seasonOf(d))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select public.arena_season(d::timestamptz) as s from unnest($1::text[]) with ordinality as t(d, n) order by n',
        [dates],
      )
      return rows.map((r) => r.s)
    })
    expect(obtenus).toEqual(attendus)
  })
})
