import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

// Identifiants propres à ce fichier, et non les `1111…` du brief : `arena-tables.test.js`
// crée ce dernier compte dans une transaction annulée, alors qu'ici les comptes persistent
// au-delà du test. Deux fichiers sur le même uuid, et l'ordre d'exécution décide qui casse.
const ALICE = 'a1a1a1a1-1111-1111-1111-111111111111'
const BOB = 'b0b0b0b0-2222-2222-2222-222222222222'
// Carol n'a pas de pseudonyme : elle sert de tiers aux duels — quelqu'un qui n'est ni le
// challenger ni l'adversaire — et vérifie au passage que `arena_players` écarte bien les
// profils sans pseudo.
const CAROL = 'ca201ca2-3333-3333-3333-333333333333'

/**
 * Rejoue une requête comme le ferait PostgREST pour un utilisateur donné.
 *
 * La transaction explicite n'est pas décorative : `set local` ne vaut que pour la durée d'une
 * transaction, et sans elle le rôle et les claims seraient silencieusement ignorés — les
 * requêtes passeraient alors en superutilisateur et TOUS les tests d'isolation seraient verts
 * pour la pire des raisons.
 */
const commeUtilisateur = async (c, uid, sql) => {
  await c.query('begin')
  try {
    await c.query('set local role authenticated')
    await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
    const r = await c.query(sql)
    return r.rows
  } finally {
    await c.query('rollback')
  }
}

describe.skipIf(!disponible)('isolation entre deux joueurs', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      // Insérer dans `auth.users` déclenche `on_auth_user_created`, qui crée les lignes
      // `profiles` et `state`. On ne les crée donc pas à la main : le test emprunte le même
      // chemin qu'une vraie inscription, trigger compris.
      for (const [id, pseudo] of [[ALICE, 'alice'], [BOB, 'bob'], [CAROL, null]]) {
        await c.query(`
          insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                  email_confirmed_at, created_at, updated_at)
          values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  $2 || '@test.local', '', now(), now(), now())
          on conflict (id) do nothing
        `, [id, pseudo ?? 'carol'])
        if (pseudo) {
          await c.query('update public.profiles set pseudo = $2 where user_id = $1', [id, pseudo])
        }
      }

      await c.query(`
        insert into public.arena_wallet (user_id, pokedollars) values ($1, 500), ($2, 900)
        on conflict (user_id) do update set pokedollars = excluded.pokedollars
      `, [ALICE, BOB])

      await c.query(`
        insert into public.arena_exemplars (user_id, entry_key, level)
        values ($1, 'github:alice-1', 3), ($2, 'github:bob-1', 7)
        on conflict (user_id, entry_key) do update set level = excluded.level
      `, [ALICE, BOB])

      await c.query(`
        insert into public.catches (user_id, species, source, external_id, label, date)
        values ($1, 25, 'github', 'alice-pr-1', 'PR 1', current_date),
               ($1, 25, 'github', 'alice-pr-2', 'PR 2', current_date),
               ($2, 6, 'github', 'bob-pr-1', 'PR 3', current_date)
        on conflict do nothing
      `, [ALICE, BOB])

      // Les duels portent une identité : on repart d'une table propre pour ces trois joueurs
      // plutôt que d'accumuler des lignes à chaque exécution.
      await c.query('delete from public.arena_duels where challenger_id = any($1)',
        [[ALICE, BOB, CAROL]])
      await c.query(`
        insert into public.arena_duels (challenger_id, challenger_key, opponent_id, opponent_key,
                                        status, winner_id, stake_tier, resolved_at)
        values ($1, 'github:alice-1', $2, 'github:bob-1', 'resolved', $1, 'r', now())
      `, [ALICE, BOB])
      await c.query(`
        insert into public.arena_duels (challenger_id, challenger_key, status, stake_tier)
        values ($1, 'github:alice-1', 'open', 'l')
      `, [ALICE])
    })
  })

  // Garde-fou du harnais lui-même, et non de la base : si `set local role` disparaissait du
  // helper, toutes les autres assertions passeraient au vert sous le rôle propriétaire, RLS
  // contournée. Ce test-ci rougirait le premier.
  it('exécute bien les requêtes sous l’identité demandée', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, ALICE, 'select current_user :: text as role, auth.uid() :: text as uid'))
    expect(rows).toEqual([{ role: 'authenticated', uid: ALICE }])
  })

  it('laisse chacun lire son propre portefeuille', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, ALICE, 'select pokedollars from public.arena_wallet'))
    expect(rows).toEqual([{ pokedollars: 500 }])
  })

  it('cache le portefeuille de l’autre, sans erreur ni fuite', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, BOB, `select user_id from public.arena_wallet where user_id = '${ALICE}'`))
    expect(rows).toEqual([])
  })

  // Le niveau d'un exemplaire adverse est un renseignement de combat : le voir avant de
  // choisir son défi reviendrait à choisir ses victoires.
  it('cache les exemplaires de l’autre', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, BOB, 'select user_id, entry_key, level from public.arena_exemplars'))
    expect(rows).toEqual([{ user_id: BOB, entry_key: 'github:bob-1', level: 7 }])
  })

  it('rend les pseudonymes de tout le monde', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, ALICE, 'select pseudo from public.arena_players order by pseudo'))
    expect(rows.map((r) => r.pseudo)).toEqual(['alice', 'bob'])
  })

  // La vue traverse RLS à dessein : on publie les espèces d'autrui. Ce qu'elle ne doit pas
  // publier, c'est le nombre d'exemplaires — Alice a deux Pikachu, la vue n'en montre qu'un.
  it('publie les espèces d’autrui, sans en révéler le nombre', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, BOB,
        `select species from public.arena_public_dex where user_id = '${ALICE}'`))
    expect(rows).toEqual([{ species: 25 }])
  })

  // Un duel ouvert n'est lisible par personne en direct, pas même par celui qui l'a lancé :
  // sa mise est dans la ligne, et un appel direct à l'API la révélerait.
  it('ne laisse lire aucun duel ouvert, pas même le sien', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, ALICE, `select id from public.arena_duels where status = 'open'`))
    expect(rows).toEqual([])
  })

  it('rend un duel résolu à ses deux participants et à eux seuls', async () => {
    await withDb(async (c) => {
      const lu = (uid) => commeUtilisateur(c, uid,
        `select status from public.arena_duels where status = 'resolved'`)
      expect(await lu(ALICE)).toEqual([{ status: 'resolved' }])
      expect(await lu(BOB)).toEqual([{ status: 'resolved' }])
      expect(await lu(CAROL)).toEqual([])
    })
  })

  // Une policy `select` sans policy d'écriture ne suffirait pas si le `grant` était trop
  // large : c'est le refus effectif qu'on mesure ici, sur ses PROPRES lignes — là où une
  // policy permissive mal écrite laisserait passer.
  it('refuse toute écriture, même sur ses propres lignes', async () => {
    await withDb(async (c) => {
      await expect(
        commeUtilisateur(c, ALICE, 'update public.arena_wallet set pokedollars = 99999'),
      ).rejects.toThrow()
      await expect(
        commeUtilisateur(c, ALICE,
          `insert into public.arena_exemplars (user_id, entry_key) values ('${ALICE}', 'x:1')`),
      ).rejects.toThrow()
      await expect(
        commeUtilisateur(c, ALICE, 'delete from public.arena_wallet'),
      ).rejects.toThrow()
    })
  })
})
