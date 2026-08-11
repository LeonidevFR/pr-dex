import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const TABLES = [
  'arena_exemplars', 'arena_duels', 'arena_wallet', 'arena_season_points', 'arena_seasons',
]

/**
 * Exécute `fn` sous le rôle `authenticated`, dans une transaction annulée à la fin.
 *
 * La transaction explicite n'est pas décorative : `set local` ne vaut que pour la durée d'une
 * transaction, et sans elle le rôle est silencieusement ignoré — les requêtes passent alors
 * en propriétaire de table, RLS contournée, et un test censé prouver qu'une écriture est
 * refusée réussirait l'écriture tout en passant au vert. Le `rollback` garantit en prime
 * qu'un test ne laisse jamais de ligne derrière lui.
 */
const commeAuthentifie = (fn) => withDb(async (c) => {
  await c.query('begin')
  try {
    await c.query('set local role authenticated')
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

describe.skipIf(!disponible)('tables de l’arène', () => {
  it('existent toutes, avec RLS activé', async () => {
    const rows = await withDb((c) => c.query(`
      select relname, relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and relname = any($1) order by relname
    `, [TABLES]).then((r) => r.rows))
    expect(rows.map((r) => r.relname)).toEqual([...TABLES].sort())
    for (const r of rows) expect(r.relrowsecurity).toBe(true)
  })

  // C'est LA garantie du mode : dès qu'un duel engage quelqu'un d'autre, le joueur ne doit
  // plus pouvoir écrire lui-même. `state` reste modifiable par son propriétaire — au pire on
  // y triche contre soi-même — mais un niveau ou un exemplaire détruit engagent un adversaire.
  it('n’exposent aucune policy d’écriture, à personne', async () => {
    const rows = await withDb((c) => c.query(`
      select tablename, policyname, cmd from pg_policies
      where schemaname = 'public' and tablename = any($1) and cmd <> 'SELECT'
    `, [TABLES]).then((r) => r.rows))
    expect(rows).toEqual([])
  })

  it('refusent l’écriture d’un utilisateur authentifié, table par table', async () => {
    for (const t of TABLES) {
      await expect(
        commeAuthentifie((c) => c.query(`insert into public.${t} default values`)),
        // Le motif n'est pas cosmétique : `default values` viole aussi un `not null` sur quatre
        // de ces cinq tables, donc un `rejects.toThrow()` nu passerait au vert même sous le rôle
        // propriétaire, sans rien prouver. Seul le refus d'accès distingue le joueur de
        // l'écrivain légitime — « permission denied » quand la table n'est pas exposée aux rôles
        // de la Data API, « row-level security » quand elle l'est.
      ).rejects.toThrow(/permission denied|row-level security/)
    }
  })

  it('interdisent un niveau hors des bornes du jeu', async () => {
    await withDb(async (c) => {
      await expect(c.query(`
        insert into public.arena_exemplars (user_id, entry_key, level)
        values ('00000000-0000-0000-0000-000000000000', 'github:x', 11)
      `)).rejects.toThrow()
    })
  })

  it('interdisent un portefeuille négatif', async () => {
    await withDb(async (c) => {
      await expect(c.query(`
        insert into public.arena_wallet (user_id, pokedollars)
        values ('00000000-0000-0000-0000-000000000000', -1)
      `)).rejects.toThrow()
    })
  })
})
