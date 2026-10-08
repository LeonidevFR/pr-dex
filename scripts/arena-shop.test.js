import { describe, it, expect, beforeAll } from 'vitest'
import { SHOP } from '../shared/arena-economy.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const ACHETEUR = 'ba000000-0000-0000-0000-000000000001'

const commeAcheteur = (fn) => withDb(async (c) => {
  await c.query('begin')
  try {
    await c.query('set local role authenticated')
    await c.query(`set local request.jwt.claims = '{"sub":"${ACHETEUR}","role":"authenticated"}'`)
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

const crediter = (n) => withDb((c) => c.query(`
  insert into public.arena_wallet (user_id, pokedollars) values ($1, $2)
  on conflict (user_id) do update set pokedollars = $2
`, [ACHETEUR, n]))

describe.skipIf(!disponible)('boutique', () => {
  beforeAll(async () => {
    await withDb((c) => c.query(`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'boutique@test.local', '', now(), now(), now())
      on conflict (id) do nothing
    `, [ACHETEUR]))
  })

  // Les prix vivent dans `shared/arena-economy.js`, que le front lit pour afficher, et dans la
  // base, que la fonction d'achat lit pour débiter. Les deux doivent dire la même chose : un
  // écart afficherait un prix et en prélèverait un autre.
  it('propose exactement le catalogue du module JavaScript, aux mêmes prix', async () => {
    const rows = await withDb((c) =>
      c.query('select slug, gen, tier, fresh, price from public.arena_shop order by slug')
        .then((r) => r.rows))
    const attendu = [...SHOP].sort((a, b) => a.slug.localeCompare(b.slug))
    expect(rows).toHaveLength(attendu.length)
    rows.forEach((r, i) => {
      expect(r.slug).toBe(attendu[i].slug)
      expect(r.price).toBe(attendu[i].price)
      expect(r.tier).toBe(attendu[i].tier)
      expect(r.gen).toBe(attendu[i].gen)
      expect(r.fresh).toBe(attendu[i].fresh)
    })
  })

  it('débite le portefeuille et inscrit un pli dû', async () => {
    await crediter(5000)
    const { solde, pack } = await commeAcheteur(async (c) => {
      const { rows } = await c.query("select public.arena_buy('gen1-r') as id")
      const p = await c.query('select tier, gen, fresh, duel_id from public.arena_packs where id = $1',
        [rows[0].id])
      const w = await c.query('select pokedollars from public.arena_wallet where user_id = $1', [ACHETEUR])
      return { solde: w.rows[0].pokedollars, pack: p.rows[0] }
    })
    // Dérivé du catalogue : un prix recopié ici se serait démodé au premier réglage.
    expect(solde).toBe(5000 - SHOP.find((a) => a.slug === 'gen1-r').price)
    expect(pack).toEqual({ tier: 'r', gen: 1, fresh: false, duel_id: null })
  })

  it('marque la génération et l’exigence d’inédit du pli acheté', async () => {
    await crediter(20000)
    const pack = await commeAcheteur(async (c) => {
      const { rows } = await c.query("select public.arena_buy('gen2-r-inedit') as id")
      return (await c.query('select tier, gen, fresh from public.arena_packs where id = $1', [rows[0].id])).rows[0]
    })
    expect(pack).toEqual({ tier: 'r', gen: 2, fresh: true })
  })

  // Payer sans recevoir, ou recevoir sans payer, sont deux façons également fâcheuses de perdre
  // la confiance d'un joueur : le refus doit être total.
  it('refuse l’achat sans le solde, sans rien débiter ni rien devoir', async () => {
    await crediter(100)
    await expect(commeAcheteur((c) => c.query("select public.arena_buy('gen1-l')")))
      .rejects.toThrow(/il manque/)
    const { solde, plis } = await withDb(async (c) => ({
      solde: (await c.query('select pokedollars from public.arena_wallet where user_id = $1', [ACHETEUR])).rows[0].pokedollars,
      plis: (await c.query('select count(*)::int n from public.arena_packs where user_id = $1', [ACHETEUR])).rows[0].n,
    }))
    expect(solde).toBe(100)
    expect(plis).toBe(0)
  })

  it('refuse un article qui n’existe pas', async () => {
    await crediter(99999)
    await expect(commeAcheteur((c) => c.query("select public.arena_buy('gen9-mythique')")))
      .rejects.toThrow(/article inconnu/)
  })

  it('n’est pas appelable sans compte', async () => {
    await expect(withDb(async (c) => {
      await c.query('begin')
      try {
        await c.query('set local role authenticated')
        return await c.query("select public.arena_buy('gen1-c')")
      } finally { await c.query('rollback') }
    })).rejects.toThrow(/connecté/)
  })
})
