import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { LOCAL_DB_URL, withDb, dbAvailable } from './db-test-helper.mjs'
import { REWARD } from '../shared/arena-economy.js'

const disponible = await dbAvailable()

/**
 * Le test qui justifie tout le lot. Les autres vérifient la logique d'un duel ; celui-ci
 * vérifie qu'elle tient quand deux joueurs relèvent le même défi à la même milliseconde.
 *
 * DEUX CONNEXIONS DISTINCTES, et non deux requêtes sur la même : deux requêtes d'un même
 * client sont sérialisées par le protocole avant même d'atteindre Postgres, elles ne
 * courent donc jamais l'une contre l'autre et un tel test passerait sans rien prouver.
 *
 * Ce que la course détruirait sans le `for update` de `arena_accept` : les deux transactions
 * liraient `status = 'open'`, résoudraient toutes deux, et DEUX exemplaires disparaîtraient
 * pour un seul duel — un Pokémon perdu sans contrepartie. C'est la classe de bug de la double
 * dépense de bonbons déjà rencontrée dans ce projet (NOTES.md).
 *
 * Une vingtaine de tentatives, et pas une seule : une course qui ne se produit qu'une fois sur
 * cinq passerait inaperçue sur un seul essai. Chaque tentative a ses propres joueurs, ce qui
 * évite au passage que les crédits et le plafond par paire ne viennent masquer la course.
 */
const TENTATIVES = 20
const JOUEURS = TENTATIVES * 3

/** Trois joueurs par tentative : le défieur, et les deux qui se disputent son défi. */
const uid = (n) => `e0e0e0e0-6666-6666-6666-${String(n).padStart(12, '0')}`
const cle = (n) => `github:concurrence-${n}`

/** Une transaction ouverte sous l'identité d'un joueur, prête à tirer. La prise d'identité est
 *  faite AVANT la course : ce qu'on veut faire partir ensemble, c'est l'appel à `arena_accept`,
 *  pas la mise en place. */
const ouvrirSous = (c, joueur) => c.query(`begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"${joueur}","role":"authenticated"}'`)

/**
 * Une tentative d'acceptation, close par elle-même.
 *
 * Chaque connexion valide ou annule DÈS QUE son appel rend la main, sans attendre l'autre.
 * C'est indispensable : la seconde transaction est bloquée sur le `for update` tant que la
 * première n'a pas fini, donc attendre les deux appels avant de valider quoi que ce soit
 * ferait s'attendre les deux l'une l'autre — le test se figerait, et sur un blocage du test
 * on ne saurait plus rien dire de la fonction.
 */
const tenter = async (c, duel, entree, ids) => {
  try {
    const id = (await c.query('select public.arena_accept($1, $2) as id', [duel, entree]))
      .rows[0].id
    // Les points de saison sont effacés DANS la transaction qui vient de les écrire, avant sa
    // validation : personne ne les voit jamais. C'est la seule table d'arène lisible par tous
    // les joueurs, et ce fichier est le seul à valider ses écritures — une ligne validée y
    // serait visible des autres fichiers de test, qui tournent en parallèle et dont un vérifie
    // que les tables d'arène sont vides. On ne veut pas d'une suite verte ou rouge selon
    // l'ordonnancement. Les points, eux, sont vérifiés par `arena-accept.test.js` ; la course
    // se juge sur l'exemplaire détruit, le pli dû et les pokédollars, tous trois invisibles
    // d'autrui par leurs policies. `reset role` ressort de l'identité du joueur, qui n'a
    // évidemment aucun droit d'écriture ici.
    await c.query('reset role')
    await c.query('delete from public.arena_season_points where user_id = any($1)', [ids])
    await c.query('commit')
    return { ok: true, id }
  } catch (e) {
    // Annulée, jamais validée : sans ce `rollback` la connexion resterait en erreur et la
    // tentative suivante mentirait.
    await c.query('rollback')
    return { ok: false, message: e.message }
  }
}

/** Les lignes laissées par la course, effacées. Ce fichier valide ses écritures : à lui de les
 *  reprendre, sinon les tables d'arène ne seraient plus jamais vides pour personne. */
const nettoyer = (c, ids) => Promise.resolve()
  .then(() => c.query('delete from public.arena_duels where challenger_id = any($1)'
    + ' or opponent_id = any($1)', [ids]))
  .then(() => c.query('delete from public.arena_exemplars where user_id = any($1)', [ids]))
  .then(() => c.query('delete from public.arena_wallet where user_id = any($1)', [ids]))
  .then(() => c.query('delete from public.arena_season_points where user_id = any($1)', [ids]))

describe.skipIf(!disponible)('deux acceptations simultanées du même défi', () => {
  let principal
  let rougeA
  let rougeB
  const ids = Array.from({ length: JOUEURS }, (_, i) => uid(i + 1))

  beforeAll(async () => {
    principal = new pg.Client({ connectionString: LOCAL_DB_URL })
    rougeA = new pg.Client({ connectionString: LOCAL_DB_URL })
    rougeB = new pg.Client({ connectionString: LOCAL_DB_URL })
    await Promise.all([principal.connect(), rougeA.connect(), rougeB.connect()])

    await withDb(async (c) => {
      // Ce test VALIDE ses écritures — c'est le seul moyen que la seconde connexion voie ce
      // que la première a écrit. Il repart donc d'un état propre plutôt que d'annuler à la fin.
      await nettoyer(c, ids)

      await c.query(`
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                email_confirmed_at, created_at, updated_at)
        select ('e0e0e0e0-6666-6666-6666-' || lpad(g :: text, 12, '0')) :: uuid,
               '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'concurrence-' || g || '@test.local', '', now(), now(), now()
        from generate_series(1, $1 :: int) g
        on conflict (id) do nothing
      `, [JOUEURS])

      // Tout le monde engage un rare : l'enjeu vaut alors le rare des deux côtés, et le lot
      // attendu ne dépend pas de qui gagne.
      const rare = (await c.query(
        'select species from public.species_stats where tier = $1 order by species limit 1',
        ['r'])).rows[0].species
      await c.query(`
        insert into public.catches (user_id, species, source, external_id, label, date)
        select ('e0e0e0e0-6666-6666-6666-' || lpad(g :: text, 12, '0')) :: uuid, $2,
               'github', 'concurrence-' || g, 'PR de test', current_date
        from generate_series(1, $1 :: int) g
        on conflict (user_id, source, external_id) do update set species = excluded.species
      `, [JOUEURS, rare])
    })
  })

  afterAll(async () => {
    await withDb((c) => nettoyer(c, ids))
    await Promise.all([principal?.end(), rougeA?.end(), rougeB?.end()])
  })

  it('n’en laisse passer qu’une seule, et ne détruit qu’un seul exemplaire', async () => {
    const bilans = []

    try {
      for (let i = 0; i < TENTATIVES; i++) {
        const defieur = uid(i * 3 + 1)
        const premier = uid(i * 3 + 2)
        const second = uid(i * 3 + 3)

        // Le défi est posté et COMMITTÉ avant la course : les deux prétendants doivent le voir.
        await ouvrirSous(principal, defieur)
        const duel = (await principal.query('select public.arena_engage($1) as id',
          [cle(i * 3 + 1)])).rows[0].id
        await principal.query('commit')

        // Les deux transactions sont déjà ouvertes et sous identité : le seul aller-retour qui
        // reste à faire est l'appel lui-même, et les deux partent ensemble.
        await Promise.all([ouvrirSous(rougeA, premier), ouvrirSous(rougeB, second)])
        const [a, b] = await Promise.all([
          tenter(rougeA, duel, cle(i * 3 + 2), ids),
          tenter(rougeB, duel, cle(i * 3 + 3), ids),
        ])

        const gagnants = [a, b].filter((r) => r.ok)
        const perdants = [a, b].filter((r) => !r.ok)

        // Relu en une seule requête, depuis le rôle propriétaire, sur la connexion qui a posté
        // le défi : elle est hors transaction entre deux tentatives, et voit donc l'état
        // validé. Une requête plutôt que cinq parce que la base est partagée avec les autres
        // fichiers de test, qui tournent en parallèle : les allers-retours inutiles s'y payent
        // en secondes pour tout le monde.
        const trois = [defieur, premier, second]
        const etat = (await principal.query(`
          select d.status, d.opponent_id, d.winner_id, d.stake_tier, d.resolved_at,
                 (select count(*) :: int from public.arena_exemplars e
                  where e.user_id = any($2) and e.destroyed_at is not null) as detruits,
                 (select count(*) :: int from public.arena_packs p where p.duel_id = d.id)
                   as plis,
                 (select coalesce(sum(w.pokedollars), 0) :: int from public.arena_wallet w
                  where w.user_id = any($2)) as dollars
          from public.arena_duels d where d.id = $1
        `, [duel, trois])).rows[0]

        bilans.push({
          reussites: gagnants.length,
          refus: perdants.map((r) => r.message),
          duel: etat,
          detruits: etat.detruits,
          plis: etat.plis,
          dollars: etat.dollars,
          acceptantAttendu: a.ok ? premier : second,
        })
      }
    } finally {
      // Les lignes validées sont reprises même si une tentative a échoué : le constat, lui,
      // est déjà en mémoire, et les assertions se lisent sur lui.
      await nettoyer(principal, ids)
    }

    for (const [i, b] of bilans.entries()) {
      const ou = `tentative ${i + 1}`
      // Exactement une acceptation passe, et l'autre échoue en disant pourquoi — un refus
      // muet ou un « deadlock detected » laisserait le joueur devant un écran cassé.
      expect(b.reussites, ou).toBe(1)
      expect(b.refus, ou).toHaveLength(1)
      expect(b.refus[0], ou).toMatch(/n’est plus ouvert|n'est plus ouvert/)

      // Le duel est résolu une seule fois, et par celui qui a gagné la course.
      expect(b.duel.status, ou).toBe('resolved')
      expect(b.duel.opponent_id, ou).toBe(b.acceptantAttendu)
      expect(b.duel.resolved_at, ou).not.toBeNull()

      // Le cœur du sujet : UN exemplaire détruit, pas deux.
      expect(b.detruits, ou).toBe(1)

      // Et un seul lot payé — un pli dû, des pokédollars crédités une seule fois.
      expect(b.plis, ou).toBe(1)
      expect(b.duel.stake_tier, ou).toBe('r')
      expect(b.dollars, ou).toBe(REWARD.r.dollars)
    }
  }, 120_000)
})
