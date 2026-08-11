import { describe, it, expect } from 'vitest'
import { STATS } from '../shared/species-stats.js'
import { DEX } from '../shared/species.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

describe.skipIf(!disponible)('species_stats en base', () => {
  it('couvre exactement les 151 espèces, aux mêmes valeurs que le module JavaScript', async () => {
    const rows = await withDb((c) =>
      c.query('select species, stats from public.species_stats order by species').then((r) => r.rows))
    expect(rows).toHaveLength(151)
    for (const { species, stats } of rows) expect(stats).toBe(STATS[species])
  })

  // Le palier ne vient pas de PokéAPI mais de la planche : c'est le générateur du seed qui le
  // recopie depuis `DEX`. Un décalage entre les deux ferait combattre un légendaire au
  // coefficient d'un commun, sans que rien ne le signale.
  it('porte le palier de la planche pour chaque espèce', async () => {
    const rows = await withDb((c) =>
      c.query('select species, tier from public.species_stats order by species').then((r) => r.rows))
    for (const { species, tier } of rows) expect(tier).toBe(DEX[species].tier)
  })

  // Un joueur n'a aucune raison d'écrire dans cette table, et la RPC du lot 2b la lira sous
  // son propre droit : personne d'autre que la migration ne doit pouvoir y toucher.
  //
  // `set local role` ne vaut que pour la transaction en cours : hors d'un `begin` explicite,
  // chaque requête `withDb` ouvre et referme sa propre transaction implicite, et le rôle
  // retombe à `postgres` (propriétaire de la table, RLS ignorée) avant la requête suivante.
  // Chaque tentative ouvre donc sa propre transaction, toujours annulée par un `rollback`
  // pour ne rien laisser en base même si l'écriture passait à tort.
  it('n’accepte aucune écriture d’un utilisateur authentifié', async () => {
    await withDb(async (c) => {
      await c.query('begin')
      await c.query('set local role authenticated')
      await expect(c.query('insert into public.species_stats values (999, 1)')).rejects.toThrow()
      await c.query('rollback')

      await c.query('begin')
      await c.query('set local role authenticated')
      await expect(c.query('update public.species_stats set stats = 1')).rejects.toThrow()
      await c.query('rollback')
    })
  })
})
