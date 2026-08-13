import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const A = 'aa11aa11-0000-0000-0000-000000000001'
const B = 'bb22bb22-0000-0000-0000-000000000002'
const C = 'cc33cc33-0000-0000-0000-000000000003'
/**
 * Une saison que le code d'exécution ne peut jamais produire. Ce test affirmait le contenu
 * EXACT du classement d'une saison réelle ; or `arena_accept` inscrit des points dans la saison
 * en cours, et un test de duel qui tourne en parallèle y ajoutait un quatrième joueur — le
 * classement devenait juste, l'assertion fausse. Le rang étant calculé par partition de saison,
 * une saison à soi isole complètement le cas.
 */
const SAISON = '1999-S1'

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

describe.skipIf(!disponible)('classement de saison', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      for (const [u, p] of [[A, 'lb-ada'], [B, 'lb-bob'], [C, 'lb-cyd']]) {
        await c.query(`
          insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                  email_confirmed_at, created_at, updated_at)
          values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  $2 || '@classement.local', '', now(), now(), now())
          on conflict (id) do nothing
        `, [u, p])
        await c.query('update public.profiles set pseudo = $2 where user_id = $1', [u, p])
      }
      await c.query('delete from public.arena_season_points where season = $1', [SAISON])
      await c.query(`
        insert into public.arena_season_points (user_id, season, points)
        values ($1, $4, 120), ($2, $4, 120), ($3, $4, 40)
      `, [A, B, C, SAISON])
    })
  })

  it('classe par points décroissants et nomme chacun', async () => {
    const rows = await commeUtilisateur(A,
      `select pseudo, points, rank from public.arena_leaderboard
       where season = '${SAISON}' order by rank, pseudo`)
    expect(rows.map((r) => r.pseudo)).toEqual(['lb-ada', 'lb-bob', 'lb-cyd'])
    expect(rows.map((r) => Number(r.rank))).toEqual([1, 1, 3])
  })

  // Le classement est public par décision de conception : c'est du prestige, et il ne dit rien
  // du volume de travail de personne — contrairement au nombre d'exemplaires possédés.
  it('est lisible par tous les joueurs, pas seulement par les classés', async () => {
    const rows = await commeUtilisateur(C, `select count(*)::int as n from public.arena_leaderboard`)
    expect(rows[0].n).toBeGreaterThanOrEqual(3)
  })

  // Ce que la vue ne doit jamais exposer : la taille d'une collection est un compteur de PR
  // mergées, et le publier dans une entreprise revient à publier un classement de productivité.
  it('n’expose que le pseudonyme et les points', async () => {
    const cols = await withDb((c) => c.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'arena_leaderboard' order by column_name
    `).then((r) => r.rows.map((x) => x.column_name)))
    expect(cols).toEqual(['points', 'pseudo', 'rank', 'season', 'user_id'])
  })

  it('sépare les saisons', async () => {
    await withDb((c) => c.query(`
      insert into public.arena_season_points (user_id, season, points) values ($1, '2020-S1', 999)
      on conflict (user_id, season) do update set points = 999
    `, [A]))
    const rows = await commeUtilisateur(A,
      `select points from public.arena_leaderboard where season = '${SAISON}' and user_id = '${A}'`)
    expect(Number(rows[0].points)).toBe(120)
  })
})
