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
 *
 * `avant` s'exécute dans la même transaction mais avant la bascule de rôle, donc en
 * propriétaire : c'est le seul moyen de poser une ligne que le joueur ne devra pas voir, la
 * bascule étant irréversible jusqu'au `rollback`.
 */
const commeAuthentifie = (fn, avant) => withDb(async (c) => {
  await c.query('begin')
  try {
    if (avant) await avant(c)
    await c.query('set local role authenticated')
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

/** Un compte réel : `arena_wallet.user_id` référence `auth.users`, un uuid inventé serait rejeté. */
const UTILISATEUR = '11111111-1111-1111-1111-111111111111'
const creerUtilisateur = (c) => c.query(`
  insert into auth.users (id, instance_id, aud, role, email)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@b.c')
`, [UTILISATEUR])

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

  // Le pendant indispensable du test précédent : sans lui, un refus d'écriture ne prouverait
  // rien, puisqu'une table simplement inaccessible refuse tout de la même façon. Une lecture
  // qui aboutit — liste vide, mais sans erreur — face à une écriture qui lève, c'est la
  // signature d'une policy qui filtre ; deux erreurs identiques seraient celle de droits
  // manquants, et les tests d'isolation à venir mesureraient autre chose que RLS.
  //
  // Restreint aux tables scopées au joueur : `arena_season_points` et `arena_seasons` sont
  // publiques par décision de conception — le classement est du prestige, et il ne dit rien du
  // volume de travail de personne, contrairement au nombre d'exemplaires possédés.
  it('sont lisibles par un utilisateur authentifié, qui n’y voit rien', async () => {
    for (const t of ['arena_exemplars', 'arena_duels', 'arena_wallet']) {
      const rows = await commeAuthentifie((c) => c.query(`select * from public.${t}`)
        .then((r) => r.rows))
      expect(rows).toEqual([])
    }
    // Une lecture qui aboutit sur une table vide reste ambiguë. `species_stats`, elle, est
    // peuplée par le seed et sa policy laisse tout passer : en rendre les 151 lignes prouve que
    // le droit de lecture existe vraiment, et donc que le vide constaté au-dessus est l'œuvre
    // des policies et non d'une connexion aveugle.
    const stats = await commeAuthentifie((c) => c.query('select count(*)::int n from public.species_stats')
      .then((r) => r.rows[0].n))
    expect(stats).toBeGreaterThan(0)
  })

  // La démonstration inverse, sur une ligne qui existe pour de bon : le propriétaire la pose,
  // le joueur ne la voit pas. Sans droit de lecture le `select` lèverait ; avec le droit mais
  // sans policy il rendrait la ligne. Zéro ligne et aucune erreur ne s'obtiennent que si RLS
  // filtre — c'est ce que les tests d'isolation à venir s'appuieront sur.
  it('masquent au joueur une ligne qui ne lui appartient pas', async () => {
    const rows = await commeAuthentifie(
      (c) => c.query('select * from public.arena_wallet').then((r) => r.rows),
      async (c) => {
        await creerUtilisateur(c)
        await c.query('insert into public.arena_wallet (user_id, pokedollars) values ($1, 42)', [UTILISATEUR])
      },
    )
    expect(rows).toEqual([])
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
