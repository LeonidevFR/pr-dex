import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const CHALLENGER = 'ee000000-0000-0000-0000-000000000001'

/**
 * Un défi ouvert immobilise l'exemplaire engagé : tant qu'il n'est pas résolu, son propriétaire
 * ne peut ni le faire évoluer ni l'engager ailleurs. La péremption n'est donc pas une règle de
 * jeu mais un garde-fou — sans elle, un défi que personne ne relève gèlerait un Pokémon pour
 * toujours, alors que son propriétaire a déjà dépensé un crédit.
 */
describe.skipIf(!disponible)('péremption des défis', () => {
  const CLE = 'github:exp-1'

  beforeAll(async () => {
    await withDb(async (c) => {
      await c.query(`
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                email_confirmed_at, created_at, updated_at)
        values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                'expiry@test.local', '', now(), now(), now())
        on conflict (id) do nothing
      `, [CHALLENGER])
      await c.query('delete from public.arena_duels where challenger_id = $1', [CHALLENGER])
      await c.query('delete from public.arena_wallet where user_id = $1', [CHALLENGER])
      await c.query(`
        insert into public.catches (user_id, source, external_id, label, date, species, shiny)
        values ($1, 'github', 'exp-1', 'défi périmé', current_date, 6, false)
        on conflict do nothing
      `, [CHALLENGER])
    })
  })

  const poser = (age) => withDb(async (c) => {
    await c.query('delete from public.arena_duels where challenger_id = $1', [CHALLENGER])
    const { rows } = await c.query(`
      insert into public.arena_duels (challenger_id, challenger_key, status, created_at)
      values ($1, $2, 'open', now() - $3::interval) returning id
    `, [CHALLENGER, CLE, age])
    return rows[0].id
  })

  const perimer = () => withDb((c) =>
    c.query('select public.arena_resolve_expired() as n').then((r) => r.rows[0].n))

  const duel = (id) => withDb((c) =>
    c.query('select * from public.arena_duels where id = $1', [id]).then((r) => r.rows[0]))

  // On regarde CE défi, jamais le compteur global : d'autres fichiers de tests posent leurs
  // propres duels, et une assertion sur le total dépendrait de l'ordre d'exécution.
  it('laisse tranquille un défi encore frais', async () => {
    const id = await poser('2 hours')
    await perimer()
    expect((await duel(id)).status).toBe('open')
  })

  it('résout contre l’ordinateur un défi vieux de plus de vingt-quatre heures', async () => {
    const id = await poser('25 hours')
    expect(await perimer()).toBeGreaterThanOrEqual(1)
    const d = await duel(id)
    expect(d.status).toBe('computer')
    expect(d.resolved_at).not.toBeNull()
    expect(d.opponent_key).toMatch(/^ordinateur:/)
  })

  // Le duel doit rester vérifiable : un joueur qui retrouve un défi résolu en son absence a le
  // droit de savoir sur quoi il s'est joué, pas seulement qu'il a perdu.
  it('conserve les puissances, la probabilité et le tirage', async () => {
    const id = await poser('30 hours')
    await perimer()
    const d = await duel(id)
    expect(Number(d.challenger_power)).toBeGreaterThan(0)
    expect(Number(d.opponent_power)).toBeGreaterThan(0)
    expect(Number(d.probability)).toBeGreaterThanOrEqual(0.10)
    expect(Number(d.probability)).toBeLessThanOrEqual(0.90)
    expect(Number(d.roll)).toBeGreaterThanOrEqual(0)
    expect(Number(d.roll)).toBeLessThan(1)
    expect(d.stake_tier).toMatch(/^[curl]$/)
  })

  // L'ordinateur ne possède rien : il ne peut ni détruire un exemplaire — un Pokémon
  // disparaîtrait du monde sans contrepartie — ni offrir un pli, qui apparaîtrait depuis rien.
  it('ne détruit aucun exemplaire et ne doit aucun pli', async () => {
    await poser('40 hours')
    await perimer()
    const { detruits, plis } = await withDb(async (c) => {
      const d = await c.query(
        'select count(*)::int as n from public.arena_exemplars where user_id = $1 and destroyed_at is not null',
        [CHALLENGER])
      const p = await c.query('select count(*)::int as n from public.arena_packs where user_id = $1',
        [CHALLENGER])
      return { detruits: d.rows[0].n, plis: p.rows[0].n }
    })
    expect(detruits).toBe(0)
    expect(plis).toBe(0)
  })

  it('n’accorde jamais de point de classement', async () => {
    await poser('40 hours')
    await perimer()
    const n = await withDb((c) => c.query(
      'select coalesce(sum(points), 0)::int as n from public.arena_season_points where user_id = $1',
      [CHALLENGER]).then((r) => r.rows[0].n))
    expect(n).toBe(0)
  })

  // Le crédit a été dépensé à l'engagement ; la péremption ne doit pas en reprendre un second,
  // sans quoi un défi ignoré par l'équipe coûterait deux jours de jeu au lieu d'un.
  it('ne résout un même défi qu’une seule fois', async () => {
    const id = await poser('48 hours')
    await perimer()
    const apres = await duel(id)
    // Le second passage ne doit plus le voir : c'est le statut qui le prouve, pas le compteur.
    await perimer()
    const encore = await duel(id)
    expect(apres.status).toBe('computer')
    expect(encore.resolved_at).toEqual(apres.resolved_at)
  })

  it('libère l’exemplaire, qui redevient engageable', async () => {
    await poser('48 hours')
    await perimer()
    const ouverts = await withDb((c) => c.query(
      `select count(*)::int as n from public.arena_duels
       where challenger_id = $1 and challenger_key = $2 and status = 'open'`,
      [CHALLENGER, CLE]).then((r) => r.rows[0].n))
    expect(ouverts).toBe(0)
  })
})
