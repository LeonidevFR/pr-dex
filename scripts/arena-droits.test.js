import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

// Propre à ce fichier : aucun compte n'est créé, les appels sont refusés avant de lire quoi que ce soit.
const DAVE = 'd0d0d0d0-4444-4444-4444-444444444444'
const EVE = 'e0e0e0e0-5555-5555-5555-555555555555'

/** Rejoue un appel sous un rôle donné, comme PostgREST, dans une transaction annulée. */
const comme = async (c, role, uid, sql) => {
  await c.query('begin')
  try {
    await c.query(`set local role ${role}`)
    if (uid) await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"${role}"}'`)
    return (await c.query(sql)).rows
  } finally {
    await c.query('rollback')
  }
}

/**
 * Supabase accorde par défaut tous les droits aux rôles publics : ces tests vérifient que la
 * migration des droits de l'arène les a bien retirés, là où un oubli serait exploitable.
 */
describe.skipIf(!disponible)('droits de l’arène', () => {
  it('réserve les tâches planifiées à la clé de service', async () => {
    await withDb(async (c) => {
      for (const sql of [
        "select public.arena_resolve_expired(interval '0')",
        'select public.arena_close_finished_seasons()',
        'select public.dex_backfill_evolutions()',
      ]) {
        await expect(comme(c, 'authenticated', DAVE, sql), sql).rejects.toThrow(/permission denied/)
        await expect(comme(c, 'anon', null, sql), sql).rejects.toThrow(/permission denied/)
      }
    })
  })

  it('ne laisse lire ni les bonbons ni le stock d’un autre joueur', async () => {
    await withDb(async (c) => {
      for (const sql of [`select public.dex_candies('${EVE}', 1)`, `select public.dex_stock('${EVE}', 1)`]) {
        await expect(comme(c, 'authenticated', DAVE, sql), sql).rejects.toThrow(/permission denied/)
      }
    })
  })

  it('ne rend les crédits qu’à leur propriétaire', async () => {
    await withDb(async (c) => {
      const [{ n }] = await comme(c, 'authenticated', DAVE, `select public.arena_credits('${DAVE}') as n`)
      expect(typeof n).toBe('number')
      await expect(comme(c, 'authenticated', DAVE, `select public.arena_credits('${EVE}')`))
        .rejects.toThrow(/crédits d'un autre joueur/)
    })
  })

  it('n’accorde aucune écriture ni troncature sur les tables de l’arène', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('arena_wallet', 'arena_exemplars', 'arena_duels',
          'arena_packs', 'evolutions', 'species_stats', 'arena_shop', 'arena_seasons', 'arena_season_podium', 'arena_season_points', 'arena_opening')
          and (has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
               or has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'))
      `)
      expect(rows).toEqual([])
    })
  })
})
