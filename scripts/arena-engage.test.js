import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'
import { COMPUTER_REWARD, coveredTier, TIER_ORDER } from '../shared/arena-economy.js'

const disponible = await dbAvailable()

// Identifiants propres à ce fichier. Les autres fichiers d'arène ont chacun les leurs pour la
// même raison : ces comptes survivent au test, et deux fichiers sur le même uuid laisseraient
// l'ordre d'exécution décider lequel casse.
const ENGAGEANT = 'e0e0e0e0-4444-4444-4444-444444444441'
const DEMUNI = 'e0e0e0e0-4444-4444-4444-444444444442'

const creerJoueur = (c, id, email) => c.query(`
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          $2, '', now(), now(), now())
  on conflict (id) do nothing
`, [id, email])

/**
 * `arena_engage` ÉCRIT — un duel, parfois un portefeuille. Chaque test tourne donc dans une
 * transaction annulée à la fin : sans cela, le solde de crédits du joueur (déduit des duels de
 * la semaine) dépendrait du nombre de fois où la suite a tourné, et les tests deviendraient
 * verts ou rouges selon leur historique.
 */
const enTransaction = (fn) => withDb(async (c) => {
  await c.query('begin')
  try {
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

/**
 * Prend l'identité d'un joueur pour la suite de la transaction, exactement comme le fait
 * PostgREST. `arena_engage` lit l'appelant dans `auth.uid()` et nulle part ailleurs : sans ces
 * deux `set local`, la fonction s'exécuterait sans appelant et les tests ne diraient rien de
 * ce qui se passe en production.
 */
const devenir = async (c, uid) => {
  await c.query('set local role authenticated')
  await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
}

/** Ressort de l'identité du joueur pour relire ce que la fonction a écrit : RLS masque au
 *  joueur ses propres duels ouverts, à dessein (leur mise est dans la ligne). */
const redevenirProprietaire = (c) => c.query('reset role')

const engager = (c, cle, ia = false) =>
  c.query('select public.arena_engage($1, $2) as id', [cle, ia]).then((r) => r.rows[0].id)

/** Le message d'un refus, et non le simple fait qu'il y en ait eu un. Un test qui accepte
 *  n'importe quelle erreur passe pour la mauvaise raison — ce lot en a fait l'expérience. */
const refus = async (c, cle, ia = false) => {
  try {
    await engager(c, cle, ia)
    return null
  } catch (e) {
    return e.message
  }
}

/** Une capture, donc un exemplaire possédé : `catches` est la seule source de vérité sur ce
 *  qu'un joueur possède, et c'est elle que la fonction interroge. */
const capturer = (c, uid, externalId, species) => c.query(`
  insert into public.catches (user_id, species, source, external_id, label, date)
  values ($1, $2, 'github', $3, 'PR de test', current_date)
  on conflict (user_id, source, external_id) do update set species = excluded.species
`, [uid, species, externalId])

describe.skipIf(!disponible)('engager un exemplaire', () => {
  // Les espèces sont choisies dans la base plutôt qu'en dur : le palier d'une espèce est une
  // donnée du générateur, et un test qui le suppose casserait le jour où la grille bouge.
  let COMMUN
  let RARE
  let LEGENDAIRE

  beforeAll(async () => {
    await withDb(async (c) => {
      await creerJoueur(c, ENGAGEANT, 'engage@test.local')
      await creerJoueur(c, DEMUNI, 'engage-demuni@test.local')

      const espece = async (tier) => (await c.query(
        'select species from public.species_stats where tier = $1 order by species limit 1',
        [tier])).rows[0].species
      COMMUN = await espece('c')
      RARE = await espece('r')
      LEGENDAIRE = await espece('l')

      await capturer(c, ENGAGEANT, 'engage-rare', RARE)
      await capturer(c, ENGAGEANT, 'engage-rare-2', RARE)
      await capturer(c, ENGAGEANT, 'engage-commun', COMMUN)
      await capturer(c, ENGAGEANT, 'engage-detruit', RARE)
      await capturer(c, ENGAGEANT, 'engage-legendaire', LEGENDAIRE)

      await c.query(`
        insert into public.arena_exemplars (user_id, entry_key, destroyed_at)
        values ($1, 'github:engage-detruit', now())
        on conflict (user_id, entry_key) do update set destroyed_at = excluded.destroyed_at
      `, [ENGAGEANT])

      // Les duels de la semaine consomment les crédits : on repart d'une table propre, sinon
      // le joueur commencerait la suite sans crédit dès la deuxième exécution.
      await c.query(
        'delete from public.arena_duels where challenger_id = any($1) or opponent_id = any($1)',
        [[ENGAGEANT, DEMUNI]])
    })
  })

  it('poste un défi ouvert et le duel porte la mise du joueur', async () => {
    const duel = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      const id = await engager(c, 'github:engage-rare')
      await redevenirProprietaire(c)
      const { rows } = await c.query(
        'select id, challenger_id, challenger_key, status, stake_tier, opponent_id, resolved_at'
        + ' from public.arena_duels where id = $1', [id])
      return rows[0]
    })
    expect(duel.status).toBe('open')
    expect(duel.challenger_id).toBe(ENGAGEANT)
    expect(duel.challenger_key).toBe('github:engage-rare')
    expect(duel.stake_tier).toBe('r')
    expect(duel.opponent_id).toBeNull()
    expect(duel.resolved_at).toBeNull()
  })

  // La mise ne doit pas seulement être masquée à l'affichage : elle ne doit être lisible par
  // aucun chemin. La vue est le seul accès à un défi ouvert, elle n'en a donc pas la colonne.
  it('n’expose la mise d’un défi ouvert à personne', async () => {
    const vu = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      const id = await engager(c, 'github:engage-rare')
      const { rows: defis } = await c.query(
        'select * from public.arena_open_challenges where id = $1', [id])
      // Depuis l'identité du joueur, la table elle-même ne rend rien : la policy exclut les
      // duels ouverts, y compris les siens.
      const { rows: table } = await c.query(
        'select id from public.arena_duels where id = $1', [id])
      return { defis, table }
    })
    expect(vu.defis).toHaveLength(1)
    expect(Object.keys(vu.defis[0])).not.toContain('stake_tier')
    expect(vu.table).toEqual([])
  })

  it('consomme un crédit', async () => {
    const { avant, apres } = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      const lire = async () => (await c.query('select public.arena_credits($1) as n',
        [ENGAGEANT])).rows[0].n
      const avant = await lire()
      await engager(c, 'github:engage-rare')
      return { avant, apres: await lire() }
    })
    expect(apres).toBe(avant - 1)
  })

  // La propriété se vérifie contre `catches` et jamais contre un paramètre : un paramètre est
  // ce que le client prétend, `catches` est ce que le joueur possède.
  it('refuse un exemplaire qu’on ne possède pas', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      return refus(c, 'github:jamais-capture')
    })
    expect(message).toMatch(/exemplaire non possédé/)
  })

  // Même clé, autre joueur : c'est le cas qui distingue « la clé existe » de « la clé est à
  // moi ». Une vérification qui oublierait `user_id` passerait le test précédent et pas
  // celui-ci.
  it('refuse l’exemplaire d’un autre joueur', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, DEMUNI)
      return refus(c, 'github:engage-rare')
    })
    expect(message).toMatch(/exemplaire non possédé/)
  })

  // Sans cela un joueur miserait deux fois le même Pokémon et n'en perdrait qu'un.
  it('refuse d’engager deux fois le même exemplaire tant que le défi est ouvert', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      await engager(c, 'github:engage-rare')
      return refus(c, 'github:engage-rare')
    })
    expect(message).toMatch(/exemplaire déjà engagé/)
  })

  // Le second engagement porte sur un AUTRE exemplaire de la même espèce : le verrou porte sur
  // l'exemplaire, pas sur l'espèce.
  it('laisse engager un autre exemplaire de la même espèce', async () => {
    const deux = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      const a = await engager(c, 'github:engage-rare')
      const b = await engager(c, 'github:engage-rare-2')
      return [a, b]
    })
    expect(deux[0]).not.toBe(deux[1])
  })

  it('refuse un exemplaire détruit', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      return refus(c, 'github:engage-detruit')
    })
    expect(message).toMatch(/exemplaire détruit/)
  })

  it('refuse quand il ne reste aucun crédit', async () => {
    const message = await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      await redevenirProprietaire(c)
      // Cinq duels dans la semaine courante : le plafond de crédits est atteint quel que soit
      // le jour où la suite tourne.
      await c.query(`
        insert into public.arena_duels (challenger_id, challenger_key, status, created_at)
        select $1, 'github:brulage-' || g, 'computer',
               greatest(public.arena_week_start(now()) :: timestamp
                        at time zone 'Europe/Paris', now() - interval '1 second')
        from generate_series(1, 5) g
      `, [ENGAGEANT])
      await devenir(c, ENGAGEANT)
      return refus(c, 'github:engage-rare')
    })
    expect(message).toMatch(/aucun crédit/)
  })

  // Chaque refus a son message : quatre refus indistinguables laisseraient un test passer
  // parce que la fonction échoue, et non parce qu'elle refuse ce qu'elle doit refuser.
  it('distingue ses quatre refus par leur message', async () => {
    const messages = await enTransaction(async (c) => {
      const collecte = []
      for (const [uid, cle] of [[ENGAGEANT, 'github:jamais-capture'],
                                [ENGAGEANT, 'github:engage-detruit']]) {
        await c.query('savepoint essai')
        await devenir(c, uid)
        collecte.push(await refus(c, cle))
        await c.query('rollback to savepoint essai')
      }
      return collecte
    })
    expect(new Set(messages).size).toBe(messages.length)
  })

  it('refuse un appel sans utilisateur authentifié', async () => {
    const message = await enTransaction(async (c) => {
      // Rôle propriétaire, aucune claim : `auth.uid()` est nul. La fonction ne doit jamais
      // se rabattre sur un paramètre pour savoir qui appelle.
      await c.query(`set local request.jwt.claims = '{}'`)
      return refus(c, 'github:engage-rare')
    })
    expect(message).toMatch(/appel non authentifié/)
  })
})

describe.skipIf(!disponible)('engager contre l’ordinateur', () => {
  let RARE
  let LEGENDAIRE

  /** Joue un duel contre l'ordinateur et rend tout ce qu'il a laissé derrière lui. */
  const duelContreIA = (cle) => enTransaction(async (c) => {
    await devenir(c, ENGAGEANT)
    const id = await engager(c, cle, true)
    await redevenirProprietaire(c)
    const duel = (await c.query('select * from public.arena_duels where id = $1', [id])).rows[0]
    const sou = (await c.query('select pokedollars from public.arena_wallet where user_id = $1',
      [ENGAGEANT])).rows[0]
    const points = (await c.query(
      'select coalesce(sum(points), 0) :: int as n from public.arena_season_points where user_id = $1',
      [ENGAGEANT])).rows[0].n
    const plis = (await c.query(
      'select count(*) :: int as n from public.arena_packs where user_id = $1',
      [ENGAGEANT])).rows[0].n
    const exemplaire = (await c.query(
      'select level, destroyed_at from public.arena_exemplars where user_id = $1 and entry_key = $2',
      [ENGAGEANT, cle])).rows[0] ?? null
    // Le combattant de l'ordinateur se retire du même seed que celui qui a servi à le tirer :
    // la fonction ne prend que ce seed, donc rien de la mise du joueur.
    const adversaire = (await c.query(
      'select * from public.arena_computer_pick($1, 10)', ['duel:' + id])).rows[0]
    return { duel, dollars: sou ? sou.pokedollars : 0, points, plis, exemplaire, adversaire }
  })

  beforeAll(async () => {
    await withDb(async (c) => {
      await creerJoueur(c, ENGAGEANT, 'engage@test.local')
      const espece = async (tier) => (await c.query(
        'select species from public.species_stats where tier = $1 order by species limit 1',
        [tier])).rows[0].species
      RARE = await espece('r')
      LEGENDAIRE = await espece('l')
      await capturer(c, ENGAGEANT, 'engage-rare', RARE)
      await capturer(c, ENGAGEANT, 'engage-legendaire', LEGENDAIRE)
      await c.query(
        'delete from public.arena_duels where challenger_id = any($1) or opponent_id = any($1)',
        [[ENGAGEANT]])
      await c.query('delete from public.arena_wallet where user_id = $1', [ENGAGEANT])
    })
  })

  it('résout le duel immédiatement', async () => {
    const { duel } = await duelContreIA('github:engage-rare')
    expect(duel.status).toBe('computer')
    expect(duel.resolved_at).not.toBeNull()
    expect(duel.opponent_id).toBeNull()   // l'ordinateur n'est pas un compte
    expect(Number(duel.probability)).toBeGreaterThan(0)
    expect(Number(duel.roll)).toBeGreaterThanOrEqual(0)
  })

  // Le cinquième du tarif humain, au palier de l'ENJEU — le plus petit de sa mise et de celle
  // du joueur —, et rien d'autre. La valeur attendue est recalculée depuis les constantes
  // partagées, pas recopiée : c'est le même barème que le front affichera.
  it('crédite le cinquième du tarif humain, au palier de l’enjeu', async () => {
    const r = await duelContreIA('github:engage-rare')
    const enjeu = coveredTier('r', r.adversaire.foe_tier)
    expect(r.duel.stake_tier).toBe(enjeu)
    const gagne = r.duel.winner_id !== null
    expect(r.dollars).toBe(gagne ? COMPUTER_REWARD[enjeu] : 0)
  })

  it('ne donne ni point de classement, ni pli, ni niveau, et ne détruit rien', async () => {
    const r = await duelContreIA('github:engage-rare')
    expect(r.points).toBe(0)
    expect(r.plis).toBe(0)
    // Aucune ligne créée, ou une ligne restée au niveau 1 : dans les deux cas, aucun niveau
    // gagné. Sans cette règle on monterait un champion sans jamais rien risquer.
    expect(r.exemplaire?.level ?? 1).toBe(1)
    expect(r.exemplaire?.destroyed_at ?? null).toBeNull()
  })

  // Le combattant se tire dans une distribution ordinaire, indépendante de la mise. Engager un
  // légendaire ne doit donc jamais valoir plus qu'engager un rare : c'est le palier de l'IA qui
  // plafonne l'enjeu, et le terrain ordinaire ne contient pas de légendaire.
  it('ne paye pas davantage parce qu’on a engagé un légendaire', async () => {
    const plafond = Math.max(...await Promise.all(
      Array.from({ length: 12 }, async () => {
        const r = await duelContreIA('github:engage-legendaire')
        expect(TIER_ORDER.indexOf(r.duel.stake_tier))
          .toBeLessThanOrEqual(TIER_ORDER.indexOf('l'))
        return COMPUTER_REWARD[r.duel.stake_tier]
      })))
    expect(plafond).toBeLessThanOrEqual(COMPUTER_REWARD.r)
  })

  // Le palier tiré par l'ordinateur ne dépend que du seed du duel : la même graine rend le même
  // adversaire, et aucune graine ne dépend de ce que le joueur a engagé.
  it('tire son combattant sans regarder la mise du joueur', async () => {
    const tirages = await withDb(async (c) => {
      const lu = []
      for (let i = 0; i < 200; i++) {
        lu.push((await c.query('select * from public.arena_computer_pick($1, 10)',
          ['duel:' + i])).rows[0])
      }
      return lu
    })
    // Deux appels sur la même graine rendent le même combattant.
    const bis = await withDb((c) => c.query(
      'select * from public.arena_computer_pick($1, 10)', ['duel:0']).then((r) => r.rows[0]))
    expect(bis).toEqual(tirages[0])
    // Un terrain ordinaire : du peu commun et du rare en majorité, aucun légendaire.
    const paliers = tirages.map((t) => t.foe_tier)
    expect(paliers).not.toContain('l')
    expect(new Set(paliers)).toEqual(new Set(['c', 'u', 'r']))
    const ordinaires = paliers.filter((t) => t === 'u' || t === 'r').length
    expect(ordinaires / paliers.length).toBeGreaterThan(0.5)
    // Niveaux dans la borne demandée, et espèces bien du palier annoncé.
    for (const t of tirages) expect(t.foe_level).toBeGreaterThanOrEqual(1)
    for (const t of tirages) expect(t.foe_level).toBeLessThanOrEqual(10)
  })
})

describe.skipIf(!disponible)('la table des plis', () => {
  it('n’est écrite par personne, et n’est lue que par son propriétaire', async () => {
    await enTransaction(async (c) => {
      await devenir(c, ENGAGEANT)
      // La lecture est accordée — c'est la policy qui filtre, pas l'absence de droit.
      await expect(c.query('select * from public.arena_packs')).resolves.toBeTruthy()
    })
    for (const ecriture of [
      `insert into public.arena_packs (user_id, tier, duel_id) values ('${ENGAGEANT}', 'r', 1)`,
      `update public.arena_packs set claimed_at = now()`,
      `delete from public.arena_packs`,
    ]) {
      const message = await enTransaction(async (c) => {
        await devenir(c, ENGAGEANT)
        return c.query(ecriture).then(() => null, (e) => e.message)
      })
      expect(message).toMatch(/permission denied|violates row-level security/)
    }
  })

})

describe.skipIf(!disponible)('droits d’exécution de la fonction', () => {
  it('n’est pas appelable par un visiteur non connecté', async () => {
    const message = await enTransaction(async (c) => {
      await c.query('set local role anon')
      return c.query('select public.arena_engage($1, $2)', ['github:engage-rare', false])
        .then(() => null, (e) => e.message)
    })
    expect(message).toMatch(/permission denied/)
  })
})
