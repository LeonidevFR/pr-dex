import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const DEV = 'e1e1e1e1-0000-0000-0000-000000000001'
const TESTEUR = 'e2e2e2e2-0000-0000-0000-000000000002'

const creer = (c, id, email, meta) => c.query(`
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_user_meta_data)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          $2, '', now(), now(), now(), $3::jsonb)
  on conflict (id) do update set raw_user_meta_data = excluded.raw_user_meta_data
`, [id, email, JSON.stringify(meta)])

/**
 * Qui est qui dans l'arène.
 *
 * L'arène a d'abord demandé un pseudonyme — une colonne, un index unique sur `lower(trim(...))`,
 * un écran pour le choisir, un état « sans nom » à gérer partout. Tout cela dupliquait une
 * identité que l'application possédait déjà, et que `public.identities` tient avec la contrainte
 * d'unicité `(source, handle)` que le pseudonyme réinventait à la main.
 *
 * `slug` adresse la fiche, `login` la nomme. Les deux coïncident pour un dev ; pour un testeur
 * venu de Slack, l'URL porte son identifiant de membre et l'écran son nom.
 */
describe.skipIf(!disponible)('identités d’arène', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      await creer(c, DEV, 'dev@identites.local', { user_name: 'leo-dev', avatar_url: 'https://x/a.png' })
      await creer(c, TESTEUR, 'testeur@identites.local', { name: 'Marion Test' })
      await c.query('delete from public.identities where user_id in ($1, $2)', [DEV, TESTEUR])
      await c.query(`
        insert into public.identities (user_id, source, handle)
        values ($1, 'github', 'leo-dev'), ($1, 'slack', 'U0DEV'), ($2, 'slack', 'U0MARION')
      `, [DEV, TESTEUR])
    })
  })

  const lire = (uid) => withDb(async (c) =>
    (await c.query('select slug, login, avatar_url from public.arena_identities where user_id = $1', [uid])).rows[0])

  it('adresse un dev par son login GitHub, même s’il a aussi un compte Slack', async () => {
    expect(await lire(DEV)).toEqual({ slug: 'leo-dev', login: 'leo-dev', avatar_url: 'https://x/a.png' })
  })

  /**
   * Un testeur sans GitHub existe : le monkey-testing distribue des boosters par Slack. Son URL
   * porte l'identifiant de membre — laid, mais stable et unique — et l'écran son nom, celui que
   * le classement d'équipe lui donne déjà. Le nom Slack n'est ni stable ni unique : il ne peut
   * pas servir d'adresse.
   */
  it('adresse un testeur Slack par son identifiant de membre, et le nomme par son nom', async () => {
    expect(await lire(TESTEUR)).toEqual({ slug: 'U0MARION', login: 'Marion Test', avatar_url: null })
  })

  // L'unicité n'est plus défendue par l'arène : elle est tenue par la table des identités, pour
  // toute l'application. Deux joueurs ne peuvent pas porter le même login GitHub.
  it('tient l’unicité par la table des identités', async () => {
    await withDb(async (c) => {
      await c.query('begin')
      await expect(
        c.query(`insert into public.identities (user_id, source, handle)
                 values ($1, 'github', 'leo-dev')`, [TESTEUR]),
      ).rejects.toThrow(/identities_source_handle_key/)
      await c.query('rollback')
    })
  })

  // Un compte sans aucune identité ne s'adresse pas : la fiche publique l'écarte plutôt que de
  // publier une URL que personne ne peut ouvrir.
  it('n’adresse pas un compte sans identité', async () => {
    const rows = await withDb(async (c) =>
      (await c.query(`select 1 from public.arena_players p
                      join auth.users u on u.id = p.user_id
                      where u.email = 'sans@identites.local'`)).rows)
    expect(rows).toEqual([])
  })
})
