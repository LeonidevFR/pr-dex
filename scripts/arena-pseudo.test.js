import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const LEO = 'e1e1e1e1-0000-0000-0000-000000000001'
const AUTRE = 'e2e2e2e2-0000-0000-0000-000000000002'

const creer = (c, id, email) => c.query(`
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          $2, '', now(), now(), now())
  on conflict (id) do nothing
`, [id, email])

const commeUtilisateur = (uid, fn) => withDb(async (c) => {
  await c.query('begin')
  try {
    await c.query('set local role authenticated')
    await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

describe.skipIf(!disponible)('pseudonyme', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      await creer(c, LEO, 'leo@test.local')
      await creer(c, AUTRE, 'autre@test.local')
      await c.query('update public.profiles set pseudo = null where user_id in ($1, $2)', [LEO, AUTRE])
    })
  })

  it('laisse un joueur choisir le sien', async () => {
    const rows = await commeUtilisateur(LEO, async (c) => {
      await c.query(`update public.profiles set pseudo = 'Leo' where user_id = '${LEO}'`)
      const r = await c.query(`select pseudo from public.profiles where user_id = '${LEO}'`)
      return r.rows
    })
    expect(rows).toEqual([{ pseudo: 'Leo' }])
  })

  it('l’empêche de renommer quelqu’un d’autre', async () => {
    const touchees = await commeUtilisateur(LEO, async (c) => {
      const r = await c.query(`update public.profiles set pseudo = 'vole' where user_id = '${AUTRE}'`)
      return r.rowCount
    })
    expect(touchees).toBe(0)
  })

  // Le pseudo sert à choisir qui l'on affronte : `Leo` et `leo` côte à côte dans la liste des
  // défis, c'est l'usurpation que l'unicité prétend fermer.
  it('refuse un pseudonyme qui ne diffère que par la casse ou les espaces', async () => {
    await withDb(async (c) => {
      await c.query('begin')
      await c.query(`update public.profiles set pseudo = 'Leo' where user_id = '${LEO}'`)
      await expect(
        c.query(`update public.profiles set pseudo = ' leo ' where user_id = '${AUTRE}'`),
      ).rejects.toThrow()
      await c.query('rollback')
    })
  })
})
