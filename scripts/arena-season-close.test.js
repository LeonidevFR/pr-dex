import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const A = 'd1000000-0000-0000-0000-000000000001'
const B = 'd2000000-0000-0000-0000-000000000002'
const C = 'd3000000-0000-0000-0000-000000000003'
const D = 'd4000000-0000-0000-0000-000000000004'
const PASSEE = '2019-S1'

const solde = (c, u) => c.query(
  'select coalesce(pokedollars, 0)::int as n from public.arena_wallet where user_id = $1', [u],
).then((r) => r.rows[0]?.n ?? 0)

describe.skipIf(!disponible)('clôture de saison', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      for (const [u, p] of [[A, 'saisA'], [B, 'saisB'], [C, 'saisC'], [D, 'saisD']]) {
        await c.query(`
          insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                  email_confirmed_at, created_at, updated_at)
          values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  $2 || '@saison.local', '', now(), now(), now())
          on conflict (id) do nothing
        `, [u, p])
      }
      await c.query('delete from public.arena_seasons where season = $1', [PASSEE])
      await c.query('delete from public.arena_season_points where season = $1', [PASSEE])
      await c.query('delete from public.arena_wallet where user_id = any($1)', [[A, B, C, D]])
      await c.query(`
        insert into public.arena_season_points (user_id, season, points)
        values ($1, $5, 300), ($2, $5, 200), ($3, $5, 100), ($4, $5, 10)
      `, [A, B, C, D, PASSEE])
    })
  })

  it('consigne le podium d’une saison terminée', async () => {
    const n = await withDb((c) => c.query('select public.arena_close_finished_seasons() as n')
      .then((r) => r.rows[0].n))
    expect(n).toBeGreaterThanOrEqual(1)

    const row = await withDb((c) => c.query(
      'select first_id, second_id, third_id from public.arena_seasons where season = $1', [PASSEE],
    ).then((r) => r.rows[0]))
    expect(row.first_id).toBe(A)
    expect(row.second_id).toBe(B)
    expect(row.third_id).toBe(C)
  })

  // Modestes et partagés à dessein : à cinq joueurs presque tout le monde touche quelque chose,
  // et le meilleur ne creuse pas un écart matériel saison après saison.
  it('verse le podium, et rien au quatrième', async () => {
    await withDb(async (c) => {
      expect(await solde(c, A)).toBe(1000)
      expect(await solde(c, B)).toBe(500)
      expect(await solde(c, C)).toBe(250)
      expect(await solde(c, D)).toBe(0)
    })
  })

  // Le travail planifié peut manquer un passage : une clôture rejouée ne doit pas payer deux fois.
  it('ne clôture jamais deux fois la même saison', async () => {
    const avant = await withDb((c) => solde(c, A))
    await withDb((c) => c.query('select public.arena_close_finished_seasons()'))
    expect(await withDb((c) => solde(c, A))).toBe(avant)
  })

  it('laisse la saison en cours ouverte', async () => {
    await withDb(async (c) => {
      const courante = (await c.query('select public.arena_season(now()) as s')).rows[0].s
      await c.query(`
        insert into public.arena_season_points (user_id, season, points) values ($1, $2, 50)
        on conflict (user_id, season) do update set points = 50
      `, [D, courante])
      await c.query('select public.arena_close_finished_seasons()')
      const { rows } = await c.query('select 1 from public.arena_seasons where season = $1', [courante])
      expect(rows).toHaveLength(0)
    })
  })
})
