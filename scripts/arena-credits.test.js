import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const JOUEUR = 'c1c1c1c1-0000-0000-0000-000000000001'
const DEPENSIER = 'c1c1c1c1-0000-0000-0000-000000000002'
const PARTENAIRE = 'c1c1c1c1-0000-0000-0000-000000000003'

// Les duels survivent d'une exécution à l'autre : chaque groupe repart d'une table propre pour
// son joueur, sinon le solde testé dépendrait du nombre de fois où `npm test` a tourné.
const viderDuels = (c, id) => c.query(
  'delete from public.arena_duels where challenger_id = $1 or opponent_id = $1', [id])

const creerJoueur = (c, id, email) => c.query(`
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          $2, '', now(), now(), now())
  on conflict (id) do nothing
`, [id, email])

const credits = (joueur, jour) => withDb((c) =>
  c.query('select arena_credits($1, $2::timestamptz) as n', [joueur, jour])
    .then((r) => r.rows[0].n))

describe.skipIf(!disponible)('crédits d’engagement', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      await creerJoueur(c, JOUEUR, 'credits@test.local')
      await viderDuels(c, JOUEUR)
    })
  })

  // Les dates sont comparées sous leur forme texte rendue par la base : le pilote `pg` traduit
  // un `date` en objet Date JavaScript, dont la représentation dépend du fuseau de la machine
  // qui lance les tests — un poste réglé à l'ouest de Greenwich lirait « dimanche 9 » là où la
  // base a bien répondu lundi 10.
  it('place le début de semaine au lundi', async () => {
    const rows = await withDb((c) => c.query(`
      select arena_week_start('2026-08-11'::timestamptz) :: text as mardi,
             arena_week_start('2026-08-10'::timestamptz) :: text as lundi,
             arena_week_start('2026-08-16'::timestamptz) :: text as dimanche
    `).then((r) => r.rows[0]))
    expect(rows.mardi).toBe('2026-08-10')
    expect(rows.lundi).toBe('2026-08-10')
    expect(rows.dimanche).toBe('2026-08-10')
  })

  // 1 crédit par jour ouvré écoulé, week-end compris dans la semaine mais sans en ajouter.
  it('accorde un crédit par jour ouvré écoulé', async () => {
    expect(await credits(JOUEUR, '2026-08-10T12:00:00Z')).toBe(1)  // lundi
    expect(await credits(JOUEUR, '2026-08-12T12:00:00Z')).toBe(3)  // mercredi
    expect(await credits(JOUEUR, '2026-08-14T12:00:00Z')).toBe(5)  // vendredi
  })

  // Les horodatages du dimanche sont écrits en heure de Paris (+02:00 en août) : à minute près
  // de la bascule, « dimanche 23h » et « lundi 1h » sont le même instant UTC mais deux semaines
  // différentes, et c'est bien la semaine parisienne que la règle décrit.
  it('plafonne à cinq, week-end compris', async () => {
    expect(await credits(JOUEUR, '2026-08-15T12:00:00+02:00')).toBe(5)  // samedi
    expect(await credits(JOUEUR, '2026-08-16T23:00:00+02:00')).toBe(5)  // dimanche 23h, Paris
  })

  it('repart à un le lundi suivant', async () => {
    expect(await credits(JOUEUR, '2026-08-17T09:00:00+02:00')).toBe(1)
  })

  // La bascule est parisienne, pas UTC : une minute après minuit à Paris, la semaine a tourné
  // même s'il est encore dimanche 22h à Greenwich.
  it('bascule à minuit heure de Paris, pas à minuit UTC', async () => {
    expect(await credits(JOUEUR, '2026-08-16T23:00:00Z')).toBe(1)  // = lundi 01h à Paris
  })
})

describe.skipIf(!disponible)('crédits d’engagement — consommation', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      await creerJoueur(c, DEPENSIER, 'credits-depensier@test.local')
      await creerJoueur(c, PARTENAIRE, 'credits-partenaire@test.local')
      await viderDuels(c, DEPENSIER)
      // Un défi posté et un défi relevé : la règle ne distingue pas les deux, chacun coûte un
      // crédit. Les deux tombent le lundi de la semaine testée.
      await c.query(`
        insert into public.arena_duels (challenger_id, challenger_key, created_at)
        values ($1, 'pikachu:1', '2026-08-10T10:00:00+02:00')
      `, [DEPENSIER])
      await c.query(`
        insert into public.arena_duels (challenger_id, challenger_key, opponent_id, opponent_key,
                                        created_at)
        values ($2, 'bulbizarre:1', $1, 'salameche:1', '2026-08-10T11:00:00+02:00')
      `, [DEPENSIER, PARTENAIRE])
    })
  })

  it('retranche les duels engagés dans la semaine', async () => {
    // Vendredi : 5 jours ouvrés acquis, 2 duels consommés.
    expect(await credits(DEPENSIER, '2026-08-14T12:00:00+02:00')).toBe(3)
  })

  it('ne compte pas les duels des semaines précédentes', async () => {
    // Lundi suivant : la semaine a tourné, les duels de mercredi ne pèsent plus.
    expect(await credits(DEPENSIER, '2026-08-17T09:00:00+02:00')).toBe(1)
  })

  it('ne compte pas les duels postérieurs à l’instant demandé', async () => {
    // Lundi 9h, avant les deux duels de 10h et 11h : le solde d'un instant passé ne doit pas
    // être rétroactivement amputé par ce qui s'est produit après lui.
    expect(await credits(DEPENSIER, '2026-08-10T09:00:00+02:00')).toBe(1)
  })

  it('ne descend jamais sous zéro', async () => {
    // Lundi 12h : 1 seul jour ouvré acquis pour 2 duels — le solde s'arrête à zéro.
    expect(await credits(DEPENSIER, '2026-08-10T12:00:00+02:00')).toBe(0)
  })
})
