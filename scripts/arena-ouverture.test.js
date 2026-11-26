import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const JOUEUR = 'f0f0f0f0-6666-6666-6666-666666666666'

/**
 * Rejoue un appel comme PostgREST le ferait pour un joueur connecté, avec une date d'ouverture
 * donnée, dans une transaction annulée.
 */
const commeJoueur = async (c, ouverture, sql) => {
  await c.query('begin')
  try {
    await c.query('update public.arena_opening set opens_at = $1', [ouverture])
    await c.query('set local role authenticated')
    await c.query(`set local request.jwt.claims = '{"sub":"${JOUEUR}","role":"authenticated"}'`)
    return (await c.query(sql)).rows
  } finally {
    await c.query('rollback')
  }
}

/**
 * Le front cache l'arène avant le 1er décembre ; la base doit la fermer aussi, sans quoi la fiche
 * d'espèce ou un appel direct à l'API jouaient des duels comptés dans une saison antérieure.
 */
describe.skipIf(!disponible)('ouverture de l’arène', () => {
  it('refuse d’engager, de relever, d’acheter et de vendre avant l’ouverture', async () => {
    await withDb(async (c) => {
      for (const sql of [
        "select public.arena_engage('github:x', false)",
        "select public.arena_accept(1, 'github:x')",
        "select public.arena_buy('gen1-c')",
        "select public.dex_sell(array['github:x'])",
      ]) {
        await expect(commeJoueur(c, '2999-01-01', sql), sql).rejects.toThrow(/ouvre le 1er décembre/)
      }
    })
  })

  it('laisse passer une fois la date atteinte', async () => {
    await withDb(async (c) => {
      // Appelé comme le font les fonctions du serveur : un joueur n'a pas le droit de l'exécuter.
      await c.query('begin')
      try {
        await c.query("update public.arena_opening set opens_at = '2000-01-01'")
        await expect(c.query('select public.arena_assert_open()')).resolves.toBeDefined()
      } finally {
        await c.query('rollback')
      }
    })
  })

  // Sans ligne, le verrou retombe sur la date du lancement : fermé plutôt qu'ouvert.
  it('reste fermé si la date d’ouverture a disparu', async () => {
    await withDb(async (c) => {
      await c.query('begin')
      try {
        await c.query('delete from public.arena_opening')
        const { rows } = await c.query("select now() < timestamptz '2026-12-01 00:00:00 Europe/Paris' as avant")
        if (rows[0].avant) await expect(c.query('select public.arena_assert_open()')).rejects.toThrow(/ouvre le 1er décembre/)
        else await expect(c.query('select public.arena_assert_open()')).resolves.toBeDefined()
      } finally {
        await c.query('rollback')
      }
    })
  })

  // La migration écrit la date du lancement, en heure de Paris et non en UTC.
  it('ouvre le 1er décembre 2026 à minuit, heure de Paris', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query("select pg_get_functiondef('public.arena_assert_open()'::regprocedure) as def")
      expect(rows[0].def).toContain("'2026-12-01 00:00:00 Europe/Paris'")
    })
  })
})
