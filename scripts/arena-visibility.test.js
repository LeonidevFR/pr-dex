import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const colonnes = (c, vue) => c.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = $1 order by column_name
`, [vue]).then((r) => r.rows.map((x) => x.column_name))

describe.skipIf(!disponible)('ce qu’un adversaire a le droit de voir', () => {
  it('donne un pseudonyme aux profils', async () => {
    const cols = await withDb((c) => colonnes(c, 'profiles'))
    expect(cols).toContain('pseudo')
  })

  it('refuse deux pseudonymes identiques', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(`
        select conname from pg_constraint
        where conrelid = 'public.profiles' :: regclass and contype = 'u'
      `)
      expect(rows.length).toBeGreaterThan(0)
    })
  })

  // La mise d'un défi ouvert n'est pas seulement masquée à l'écran : elle ne doit pas figurer
  // dans la vue, sinon un appel direct à l'API la révélerait et le pari disparaîtrait.
  it('n’expose jamais la mise d’un défi ouvert', async () => {
    const cols = await withDb((c) => colonnes(c, 'arena_open_challenges'))
    expect(cols).not.toContain('challenger_key')
    expect(cols).not.toContain('opponent_key')
    expect(cols).toEqual(['challenger_id', 'created_at', 'id', 'pseudo'])
  })

  // Le nombre d'espèces plafonne à 151 et sature vite ; le nombre d'exemplaires, lui, ne
  // plafonne jamais — c'est un compteur de PR mergées.
  it('expose les espèces d’autrui, jamais son nombre d’exemplaires', async () => {
    const cols = await withDb((c) => colonnes(c, 'arena_public_dex'))
    expect(cols).toEqual(['species', 'user_id'])
  })

  it('ne rend qu’une ligne par espèce et par joueur', async () => {
    const { rows } = await withDb((c) => c.query(`
      select pg_get_viewdef('public.arena_public_dex' :: regclass) as def
    `))
    expect(rows[0].def.toLowerCase()).toContain('distinct')
  })

  // Un défi sans pseudonyme reste un défi : il doit rester relevable. La jointure externe est
  // la seule qui le garantisse — une jointure interne ferait disparaître de la liste un défi
  // pourtant bien ouvert, et sa mise resterait immobilisée sans que personne puisse la relever.
  it('garde un défi ouvert dans la liste même sans pseudonyme', async () => {
    const def = await withDb((c) => c.query(`
      select pg_get_viewdef('public.arena_open_challenges' :: regclass) as def
    `)).then((r) => r.rows[0].def.toLowerCase())
    expect(def).toContain('left join')
  })

  // Sans `grant`, un joueur est refusé au niveau des droits et la vue ne sert à rien : la
  // policy n'est même jamais évaluée. Le piège a déjà mordu sur les tables de l'arène.
  it('accorde la lecture des trois vues au rôle authenticated', async () => {
    const { rows } = await withDb((c) => c.query(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT'
        and table_name in ('arena_players', 'arena_open_challenges', 'arena_public_dex')
      order by table_name
    `))
    expect(rows.map((r) => r.table_name))
      .toEqual(['arena_open_challenges', 'arena_players', 'arena_public_dex'])
  })
})
