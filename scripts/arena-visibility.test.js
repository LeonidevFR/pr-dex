import { describe, it, expect, beforeAll } from 'vitest'
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

  // L'unicité vit dans un index d'expression (`lower(trim(pseudo))`), pas dans une contrainte :
  // Postgres refuse de promouvoir un index sur expression en contrainte `unique`. `pg_indexes`
  // est donc la bonne table catalogue à interroger, pas `pg_constraint`.
  it('refuse deux pseudonymes identiques, même à la casse ou aux espaces près', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(`
        select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'profiles' and indexdef ilike '%unique%'
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

/**
 * Le secret de la mise protège le pari contre l'adversaire, pas contre soi-même : l'exemplaire
 * engagé est immobilisé tant que le défi tient, et son propriétaire doit pouvoir dire lequel.
 */
describe.skipIf(!disponible)('son propre défi ouvert', () => {
  const MOI = 'fa000000-0000-0000-0000-000000000001'
  const AUTRE = 'fb000000-0000-0000-0000-000000000002'

  const commeUtilisateur = (uid, sql) => withDb(async (c) => {
    await c.query('begin')
    try {
      await c.query('set local role authenticated')
      await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
      return (await c.query(sql)).rows
    } finally {
      await c.query('rollback')
    }
  })

  let id
  beforeAll(async () => {
    await withDb(async (c) => {
      for (const [u, mail] of [[MOI, 'moi-open'], [AUTRE, 'autre-open']]) {
        await c.query(`
          insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                  email_confirmed_at, created_at, updated_at)
          values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  $2 || '@test.local', '', now(), now(), now())
          on conflict (id) do nothing
        `, [u, mail])
      }
      const r = await c.query(`
        insert into public.arena_duels (challenger_id, challenger_key, status)
        values ($1, 'github:secret-1', 'open') returning id
      `, [MOI])
      id = r.rows[0].id
    })
  })

  it('laisse son auteur lire sa propre mise', async () => {
    const rows = await commeUtilisateur(MOI,
      `select challenger_key from public.arena_duels where id = ${id}`)
    expect(rows).toEqual([{ challenger_key: 'github:secret-1' }])
  })

  it('la cache toujours à l’adversaire', async () => {
    const rows = await commeUtilisateur(AUTRE,
      `select challenger_key from public.arena_duels where id = ${id}`)
    expect(rows).toEqual([])
  })

  it('le laisse néanmoins voir le défi dans la liste, sans la mise', async () => {
    const rows = await commeUtilisateur(AUTRE,
      `select id from public.arena_open_challenges where id = ${id}`)
    expect(rows).toEqual([{ id: String(id) === id ? id : Number(id) }])
  })
})
