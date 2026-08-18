import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'
import { REWARD, coveredTier, PAIR_WEEKLY_CAP } from '../shared/arena-economy.js'
import { levelGain, LEVEL_MAX } from '../shared/battle.js'

const disponible = await dbAvailable()

// Identifiants propres à ce fichier, comme dans les autres fichiers d'arène : ces comptes
// survivent au test, et deux fichiers sur le même uuid laisseraient l'ordre d'exécution
// décider lequel casse.
const DEFIEUR = 'e0e0e0e0-5555-5555-5555-555555555551'
const PRENEUR = 'e0e0e0e0-5555-5555-5555-555555555552'
const TIERS = 'e0e0e0e0-5555-5555-5555-555555555553'

const creerJoueur = (c, id, email) => c.query(`
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          $2, '', now(), now(), now())
  on conflict (id) do nothing
`, [id, email])

/**
 * `arena_accept` écrit partout : duel, exemplaires, portefeuille, points, plis. Chaque test
 * tourne donc dans une transaction annulée à la fin — sans cela, le solde de crédits et le
 * plafond hebdomadaire par paire dépendraient du nombre de fois où la suite a tourné.
 */
const enTransaction = (fn) => withDb(async (c) => {
  await c.query('begin')
  try {
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

/** Prend l'identité d'un joueur, exactement comme le fait PostgREST : la fonction lit
 *  l'appelant dans `auth.uid()` et nulle part ailleurs. */
const devenir = async (c, uid) => {
  await c.query('set local role authenticated')
  await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
}

/** Ressort de l'identité du joueur pour relire ce que la fonction a écrit : RLS masque à
 *  chacun les lignes d'autrui, à dessein. */
const redevenirProprietaire = (c) => c.query('reset role')

const capturer = (c, uid, externalId, species) => c.query(`
  insert into public.catches (user_id, species, source, external_id, label, date)
  values ($1, $2, 'github', $3, 'PR de test', current_date)
  on conflict (user_id, source, external_id) do update set species = excluded.species
`, [uid, species, externalId])

const engager = (c, cle) =>
  c.query('select public.arena_engage($1) as id', [cle]).then((r) => r.rows[0].id)

const relever = (c, duel, cle) =>
  c.query('select public.arena_accept($1, $2) as id', [duel, cle]).then((r) => r.rows[0].id)

/** Le message d'un refus, et non le simple fait qu'il y en ait eu un : un test qui accepte
 *  n'importe quelle erreur passe pour la mauvaise raison. */
const refus = async (c, duel, cle) => {
  try {
    await relever(c, duel, cle)
    return null
  } catch (e) {
    return e.message
  }
}

/** Tout ce qu'un duel résolu a laissé derrière lui, des deux côtés. C'est cet état complet
 *  qui est vérifié : la moitié des règles du § 4 porte sur ce que le PERDANT ne reçoit pas. */
const lireEtat = async (c, id, cleDefieur, clePreneur) => {
  const duel = (await c.query('select * from public.arena_duels where id = $1', [id])).rows[0]
  const cote = async (uid, cle) => ({
    dollars: (await c.query(
      'select coalesce(sum(pokedollars), 0) :: int as n from public.arena_wallet where user_id = $1',
      [uid])).rows[0].n,
    points: (await c.query(
      'select coalesce(sum(points), 0) :: int as n from public.arena_season_points'
      + ' where user_id = $1', [uid])).rows[0].n,
    plis: (await c.query(
      'select tier from public.arena_packs where user_id = $1 and duel_id = $2', [uid, id])).rows,
    exemplaire: (await c.query(
      'select level, wins, destroyed_at from public.arena_exemplars'
      + ' where user_id = $1 and entry_key = $2', [uid, cle])).rows[0] ?? null,
  })
  return { duel, defieur: await cote(DEFIEUR, cleDefieur), preneur: await cote(PRENEUR, clePreneur) }
}

/** Un duel complet : le défieur poste, le preneur relève, on relit tout depuis le rôle
 *  propriétaire. Les niveaux de départ sont posés à la demande — c'est le seul moyen de
 *  tester le plafond de niveau sans savoir d'avance qui va gagner. */
const duelComplet = async (c, {
  cleDefieur = 'accept-defieur-rare',
  clePreneur = 'accept-preneur-rare',
  niveaux = null,
} = {}) => {
  const kd = 'github:' + cleDefieur
  const kp = 'github:' + clePreneur
  if (niveaux) {
    await c.query(`
      insert into public.arena_exemplars (user_id, entry_key, level)
      values ($1, $2, $5), ($3, $4, $5)
      on conflict (user_id, entry_key) do update set level = excluded.level
    `, [DEFIEUR, kd, PRENEUR, kp, niveaux])
  }
  await devenir(c, DEFIEUR)
  const id = await engager(c, kd)
  await devenir(c, PRENEUR)
  await relever(c, id, kp)
  await redevenirProprietaire(c)
  return lireEtat(c, id, kd, kp)
}

/**
 * Des duels déjà joués cette semaine entre deux joueurs, posés directement en table.
 *
 * Ils sont datés d'un instant À VENIR de la semaine courante, et c'est délibéré : le plafond
 * par paire regarde la semaine entière, tandis que les crédits ne comptent que les duels
 * antérieurs à l'instant de l'appel (`created_at <= at`, cf. `arena_credits`). Ces duels
 * pèsent donc sur le plafond sans consommer de crédit — sans quoi le test ne dirait rien un
 * lundi ou un mardi, jours où le preneur n'a de toute façon qu'un ou deux crédits et où le
 * refus viendrait du crédit et non du plafond. Un test dont le sens dépend du jour de la
 * semaine ne vaut pas mieux que pas de test.
 */
const duelsAnterieurs = async (c, a, b, combien) => {
  await redevenirProprietaire(c)
  await c.query(`
    insert into public.arena_duels (challenger_id, challenger_key, opponent_id, opponent_key,
                                    status, winner_id, stake_tier, created_at, resolved_at)
    select $1, 'github:paire-' || g, $2, 'github:paire-adv-' || g, 'resolved', $1, 'r',
           now() + interval '1 second', now() + interval '1 second'
    from generate_series(1, $3 :: int) g
  `, [a, b, combien])
}

describe.skipIf(!disponible)('relever un défi', () => {
  let COMMUN
  let RARE

  beforeAll(async () => {
    await withDb(async (c) => {
      await creerJoueur(c, DEFIEUR, 'accept-defieur@test.local')
      await creerJoueur(c, PRENEUR, 'accept-preneur@test.local')
      await creerJoueur(c, TIERS, 'accept-tiers@test.local')

      const espece = async (tier) => (await c.query(
        'select species from public.species_stats where tier = $1 order by species limit 1',
        [tier])).rows[0].species
      COMMUN = await espece('c')
      RARE = await espece('r')

      await capturer(c, DEFIEUR, 'accept-defieur-rare', RARE)
      await capturer(c, DEFIEUR, 'accept-defieur-rare-2', RARE)
      await capturer(c, DEFIEUR, 'accept-defieur-rare-3', RARE)
      await capturer(c, DEFIEUR, 'accept-defieur-commun', COMMUN)
      await capturer(c, PRENEUR, 'accept-preneur-rare', RARE)
      await capturer(c, PRENEUR, 'accept-preneur-rare-2', RARE)
      await capturer(c, PRENEUR, 'accept-preneur-rare-3', RARE)
      await capturer(c, PRENEUR, 'accept-preneur-commun', COMMUN)
      await capturer(c, PRENEUR, 'accept-preneur-detruit', RARE)
      await capturer(c, TIERS, 'accept-tiers-rare', RARE)

      // L'état laissé par une exécution précédente fausserait crédits et plafond par paire.
      const gens = [DEFIEUR, PRENEUR, TIERS]
      await c.query(
        'delete from public.arena_duels where challenger_id = any($1) or opponent_id = any($1)',
        [gens])
      await c.query('delete from public.arena_exemplars where user_id = any($1)', [gens])
      await c.query('delete from public.arena_wallet where user_id = any($1)', [gens])
      await c.query('delete from public.arena_season_points where user_id = any($1)', [gens])

      await c.query(`
        insert into public.arena_exemplars (user_id, entry_key, destroyed_at)
        values ($1, 'github:accept-preneur-detruit', now())
      `, [PRENEUR])
    })
  })

  // Les deux puissances, la probabilité et le tirage sont CONSERVÉS : c'est ce qui rend le
  // résumé de combat vérifiable plutôt que croyable, à quelqu'un qui vient de perdre un
  // Pokémon.
  /**
   * Le résumé de combat doit montrer le Pokémon de l'adversaire, or la collection d'autrui n'est
   * pas lisible — RLS le garantit. L'espèce, le niveau et la forme des deux camps sont donc figés
   * dans le duel à la résolution.
   *
   * Et le croisement compte : dans `arena_accept`, l'appelant est le PRENEUR, pas le challengeur.
   * Une inversion ici afficherait à chacun le Pokémon de l'autre, sans jamais lever d'erreur.
   */
  it('fige l’espèce et le niveau de chaque camp du bon côté', async () => {
    const { duel } = await enTransaction((c) => duelComplet(c))
    const attendu = await enTransaction(async (c) => {
      const d = await c.query(
        `select c.species from public.catches c
         where c.user_id = $1 and c.source || ':' || c.external_id = $2`,
        [DEFIEUR, duel.challenger_key])
      const p = await c.query(
        `select c.species from public.catches c
         where c.user_id = $1 and c.source || ':' || c.external_id = $2`,
        [PRENEUR, duel.opponent_key])
      return { defieur: d.rows[0]?.species, preneur: p.rows[0]?.species }
    })

    expect(duel.challenger_species).toBe(attendu.defieur)
    expect(duel.opponent_species).toBe(attendu.preneur)
    expect(duel.challenger_level).toBeGreaterThanOrEqual(1)
    expect(duel.opponent_level).toBeGreaterThanOrEqual(1)
    expect(duel.challenger_form).toBeGreaterThanOrEqual(0)
    expect(duel.challenger_form).toBeLessThanOrEqual(4)
    expect(duel.opponent_form).toBeGreaterThanOrEqual(0)
    expect(duel.opponent_form).toBeLessThanOrEqual(4)
  })

  it('résout le duel et conserve les deux puissances, la probabilité et le tirage', async () => {
    const { duel } = await enTransaction((c) => duelComplet(c))
    expect(duel.status).toBe('resolved')
    expect(duel.resolved_at).not.toBeNull()
    expect(duel.opponent_id).toBe(PRENEUR)
    expect(duel.opponent_key).toBe('github:accept-preneur-rare')
    expect([DEFIEUR, PRENEUR]).toContain(duel.winner_id)
    expect(Number(duel.challenger_power)).toBeGreaterThan(0)
    expect(Number(duel.opponent_power)).toBeGreaterThan(0)
    expect(Number(duel.probability)).toBeGreaterThan(0)
    expect(Number(duel.probability)).toBeLessThan(1)
    expect(Number(duel.roll)).toBeGreaterThanOrEqual(0)
    expect(Number(duel.roll)).toBeLessThan(1)
  })

  // L'arène entre humains ne crée ni ne détruit : elle déplace. Un détruit d'un côté, un pli
  // de l'autre.
  it('détruit l’exemplaire du perdant et laisse celui du vainqueur intact', async () => {
    const etat = await enTransaction((c) => duelComplet(c))
    const gagnant = etat.duel.winner_id === DEFIEUR ? etat.defieur : etat.preneur
    const perdant = etat.duel.winner_id === DEFIEUR ? etat.preneur : etat.defieur
    expect(perdant.exemplaire.destroyed_at).not.toBeNull()
    expect(gagnant.exemplaire.destroyed_at).toBeNull()
  })

  // Le barème du § 3 se lit sur le rapport des puissances DÉJÀ calculées pour le combat : un
  // seul calcul qui sert deux fois. Le test rejoue ce barème en JavaScript, depuis les
  // puissances conservées — s'il y avait une seconde formule côté SQL, elle divergerait ici.
  it('monte le vainqueur du niveau prévu par le barème', async () => {
    const etat = await enTransaction((c) => duelComplet(c))
    const cd = Number(etat.duel.challenger_power)
    const cp = Number(etat.duel.opponent_power)
    const gagneDefieur = etat.duel.winner_id === DEFIEUR
    const attendu = 1 + levelGain(gagneDefieur ? cd : cp, gagneDefieur ? cp : cd)
    const gagnant = gagneDefieur ? etat.defieur : etat.preneur
    expect(gagnant.exemplaire.level).toBe(attendu)
    expect(gagnant.exemplaire.wins).toBe(1)
  })

  // Trois exploits font un champion, jamais plus. Les deux camps partent à 10 : quel que soit
  // le vainqueur, le plafond est le seul résultat possible.
  it('plafonne le niveau du vainqueur à 10', async () => {
    const etat = await enTransaction((c) => duelComplet(c, { niveaux: LEVEL_MAX }))
    const gagnant = etat.duel.winner_id === DEFIEUR ? etat.defieur : etat.preneur
    expect(gagnant.exemplaire.level).toBe(LEVEL_MAX)
  })

  // « On ne gagne pas plus que ce que l'adversaire a engagé. » Rare contre rare : l'enjeu est
  // rare, et le lot est celui du § 4, recalculé depuis les constantes partagées.
  it('paye le vainqueur au palier de l’enjeu — pokédollars, points et un pli', async () => {
    const etat = await enTransaction((c) => duelComplet(c))
    expect(etat.duel.stake_tier).toBe('r')
    const gagnant = etat.duel.winner_id === DEFIEUR ? etat.defieur : etat.preneur
    expect(gagnant.dollars).toBe(REWARD.r.dollars)
    expect(gagnant.points).toBe(REWARD.r.points)
    expect(gagnant.plis).toEqual([{ tier: 'r' }])
  })

  // Un rare face à un commun ne rapporte que le commun : la règle du poker, celle qui
  // supprime d'un seul mouvement l'écrasement du Roucool et l'exploit du Roucool.
  it('retient le plus petit des deux engagements comme enjeu', async () => {
    const etat = await enTransaction((c) =>
      duelComplet(c, { clePreneur: 'accept-preneur-commun' }))
    const enjeu = coveredTier('r', 'c')
    expect(etat.duel.stake_tier).toBe(enjeu)
    const gagnant = etat.duel.winner_id === DEFIEUR ? etat.defieur : etat.preneur
    expect(gagnant.dollars).toBe(REWARD[enjeu].dollars)
    expect(gagnant.points).toBe(REWARD[enjeu].points)
    expect(gagnant.plis).toEqual([{ tier: enjeu }])
  })

  // Le perdant a déjà perdu son Pokémon : il ne reçoit rien d'autre, et surtout pas un lot de
  // consolation qui rendrait la défaite indolore.
  it('ne donne rien au perdant', async () => {
    const etat = await enTransaction((c) => duelComplet(c))
    const perdant = etat.duel.winner_id === DEFIEUR ? etat.preneur : etat.defieur
    expect(perdant.dollars).toBe(0)
    expect(perdant.points).toBe(0)
    expect(perdant.plis).toEqual([])
    expect(perdant.exemplaire.level).toBe(1)
    expect(perdant.exemplaire.wins).toBe(0)
  })

  it('refuse de relever son propre défi', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      return refus(c, id, 'github:accept-defieur-rare-2')
    })
    expect(message).toMatch(/son propre défi/)
  })

  // Le cas exact que le verrou sérialise : la seconde acceptation voit un duel déjà résolu.
  it('refuse un défi déjà résolu', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await devenir(c, PRENEUR)
      await relever(c, id, 'github:accept-preneur-rare')
      return refus(c, id, 'github:accept-preneur-rare-2')
    })
    expect(message).toMatch(/n’est plus ouvert|n'est plus ouvert/)
  })

  it('refuse un défi inexistant', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, PRENEUR)
      return refus(c, 999999999, 'github:accept-preneur-rare')
    })
    expect(message).toMatch(/défi introuvable/)
  })

  it('refuse un exemplaire qu’on ne possède pas', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await devenir(c, PRENEUR)
      // La clé existe, mais chez le défieur : la propriété se vérifie avec `user_id`.
      return refus(c, id, 'github:accept-defieur-rare-2')
    })
    expect(message).toMatch(/exemplaire non possédé/)
  })

  it('refuse un exemplaire détruit', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await devenir(c, PRENEUR)
      return refus(c, id, 'github:accept-preneur-detruit')
    })
    expect(message).toMatch(/exemplaire détruit/)
  })

  // Relever avec un exemplaire déjà posé sur un autre défi le miserait deux fois pour n'en
  // perdre qu'un.
  it('refuse un exemplaire déjà engagé ailleurs', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await devenir(c, PRENEUR)
      await engager(c, 'github:accept-preneur-rare')
      return refus(c, id, 'github:accept-preneur-rare')
    })
    expect(message).toMatch(/exemplaire déjà engagé/)
  })

  it('refuse quand il ne reste aucun crédit', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await redevenirProprietaire(c)
      // Cinq duels du preneur dans la semaine courante : le plafond est atteint quel que soit
      // le jour où la suite tourne.
      await c.query(`
        insert into public.arena_duels (challenger_id, challenger_key, status, created_at)
        select $1, 'github:brulage-accept-' || g, 'computer',
               greatest(public.arena_week_start(now()) :: timestamp
                        at time zone 'Europe/Paris', now() - interval '1 second')
        from generate_series(1, 5) g
      `, [PRENEUR])
      await devenir(c, PRENEUR)
      return refus(c, id, 'github:accept-preneur-rare')
    })
    expect(message).toMatch(/aucun crédit/)
  })

  // Deux duels par semaine et par paire. Le plafond vient de `shared/arena-economy.js` — un
  // chiffre en dur ici mentirait le jour où la règle bouge.
  it('laisse jouer le deuxième duel de la semaine contre la même personne', async () => {
    const message = await enTransaction(async (c) => {
      await duelsAnterieurs(c, DEFIEUR, PRENEUR, PAIR_WEEKLY_CAP - 1)
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await devenir(c, PRENEUR)
      return refus(c, id, 'github:accept-preneur-rare')
    })
    expect(message).toBeNull()
  })

  it('refuse le troisième duel de la semaine contre la même personne', async () => {
    const message = await enTransaction(async (c) => {
      await duelsAnterieurs(c, DEFIEUR, PRENEUR, PAIR_WEEKLY_CAP)
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await devenir(c, PRENEUR)
      return refus(c, id, 'github:accept-preneur-rare')
    })
    expect(message).toMatch(/deux duels par semaine/)
  })

  // Le plafond porte sur la PAIRE et non sur le joueur : après deux duels contre le même
  // adversaire, on peut encore en jouer contre un autre.
  it('laisse jouer contre quelqu’un d’autre une fois la paire épuisée', async () => {
    const message = await enTransaction(async (c) => {
      await duelsAnterieurs(c, DEFIEUR, PRENEUR, PAIR_WEEKLY_CAP)
      await devenir(c, TIERS)
      const id = await engager(c, 'github:accept-tiers-rare')
      await devenir(c, PRENEUR)
      return refus(c, id, 'github:accept-preneur-rare-3')
    })
    expect(message).toBeNull()
  })

  // Chaque refus a son message : des refus indistinguables laisseraient un test passer parce
  // que la fonction échoue, et non parce qu'elle refuse ce qu'elle doit refuser.
  it('distingue ses refus par leur message', async () => {
    const messages = await enTransaction(async (c) => {
      const collecte = []
      for (const [uid, cle] of [[DEFIEUR, 'github:accept-defieur-rare-2'],
                                [PRENEUR, 'github:accept-preneur-jamais-capture'],
                                [PRENEUR, 'github:accept-preneur-detruit']]) {
        await c.query('savepoint essai')
        await devenir(c, DEFIEUR)
        const id = await engager(c, 'github:accept-defieur-rare')
        await devenir(c, uid)
        collecte.push(await refus(c, id, cle))
        await c.query('rollback to savepoint essai')
      }
      return collecte
    })
    expect(messages.every((m) => m !== null)).toBe(true)
    expect(new Set(messages).size).toBe(messages.length)
  })

  it('refuse un appel sans utilisateur authentifié', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEFIEUR)
      const id = await engager(c, 'github:accept-defieur-rare')
      await redevenirProprietaire(c)
      // Rôle propriétaire, aucune claim : `auth.uid()` est nul. La fonction ne doit jamais se
      // rabattre sur un paramètre pour savoir qui appelle.
      await c.query(`set local request.jwt.claims = '{}'`)
      return refus(c, id, 'github:accept-preneur-rare')
    })
    expect(message).toMatch(/appel non authentifié/)
  })

  it('n’est pas appelable par un visiteur non connecté', async () => {
    const message = await enTransaction(async (c) => {
      await c.query('set local role anon')
      return c.query('select public.arena_accept($1, $2)', [1, 'github:accept-preneur-rare'])
        .then(() => null, (e) => e.message)
    })
    expect(message).toMatch(/permission denied/)
  })
})

/**
 * La forme est figée à l'engagement, pas à la résolution.
 *
 * Elle change à minuit et entre dans le calcul de puissance. Un défi posté lundi à 23 h et
 * relevé mardi à 22 h se résolvait sur la forme de MARDI pour les deux camps : le challengeur
 * avait misé en voyant celle de lundi, et se retrouvait à combattre avec une autre sans avoir
 * rien fait ni pu s'en douter. Chacun combat désormais avec la forme qu'il avait sous les yeux.
 */
describe.skipIf(!disponible)('la forme du challengeur ne bouge plus après l’engagement', () => {
  it('résout un défi de la veille sur la forme de la veille', async () => {
    await withDb(async (c) => {
      await c.query('begin')
      try {
        const hier = '2026-08-13'
        const aujourdhui = '2026-08-14'
        // Une clé dont la forme DIFFÈRE entre les deux jours : sur cinq formes possibles, une
        // clé prise au hasard en donne la même une fois sur cinq, et le cas ne prouverait alors
        // rien. On la cherche plutôt que de la supposer.
        const { rows: candidates } = await c.query(
          `select k, public.arena_form_index(k, $1) as hier, public.arena_form_index(k, $2) as auj
           from unnest(array['github:a','github:b','github:c','github:d','github:e']) as k
           where public.arena_form_index(k, $1) <> public.arena_form_index(k, $2)
           limit 1`,
          [hier, aujourdhui],
        )
        expect(candidates).toHaveLength(1)
        const { k: cle, hier: formeHier } = candidates[0]
        const f = [{ hier: formeHier }]

        // Résolu avec le jour d'hier pour le camp gauche : c'est la forme d'hier qui doit servir.
        const { rows } = await c.query(
          `select left_power from public.arena_resolve($1, 6, 1, $2, 'x', 9, 1, $3, 'graine')`,
          [cle, hier, aujourdhui],
        )
        const { rows: attendu } = await c.query(
          'select public.arena_power(6, 1, $1) as p', [f[0].hier],
        )
        expect(Number(rows[0].left_power)).toBeCloseTo(Number(attendu[0].p), 10)
      } finally {
        await c.query('rollback')
      }
    })
  })
})
