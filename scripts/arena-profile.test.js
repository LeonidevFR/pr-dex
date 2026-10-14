import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

/** Deux joueurs et un observateur : c'est le minimum pour vérifier ce que chacun voit. */
const MOI = '11111111-1111-1111-1111-111111111111'
const LUI = '22222222-2222-2222-2222-222222222222'

/**
 * Chaque cas repart d'une transaction annulée : les tests s'exécutent sous le rôle
 * propriétaire, donc toute écriture serait permanente sans ce `rollback`.
 */
async function scene(fn) {
  return withDb(async (c) => {
    await c.query('begin')
    try {
      for (const [id, login] of [[MOI, 'moi'], [LUI, 'lui']]) {
        await c.query(
          `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                   $2, jsonb_build_object('user_name', $3::text))`,
          [id, `${login}@example.test`, login],
        )
        // On s'adresse par le compte : c'est la ligne `identities` qui rend un joueur visible
        // dans l'arène, là où une colonne `profiles.pseudo` le faisait avant.
        await c.query(
          `insert into public.identities (user_id, source, handle) values ($1, 'github', $2)
           on conflict (user_id, source) do update set handle = excluded.handle`,
          [id, login],
        )
      }
      return await fn(c)
    } finally {
      await c.query('rollback')
    }
  })
}

const fiche = async (c, slug) => (await c.query(
  'select * from public.arena_public_profile where slug = $1', [slug],
)).rows[0]

/**
 * Une capture, ouverte par défaut. La fiche ne compte que les cartes OUVERTES : compter les
 * autres divulgâcherait les plis en attente — l'écart entre deux compteurs dirait combien
 * d'inédits dorment dans la file d'ouverture.
 */
const capture = async (c, uid, species, n, { ouvert = true } = {}) => {
  const cle = `sha-${uid}-${n}`
  await c.query(
    `insert into public.catches (user_id, source, external_id, label, date, species, shiny)
     values ($1, 'github', $2, 'PR', current_date, $3, false)`,
    [uid, cle, species],
  )
  if (ouvert) {
    await c.query(
      `update public.state set claimed = claimed || to_jsonb('github:' || $2 :: text)
       where user_id = $1`, [uid, cle])
  }
}

const duel = (c, { challenger, opponent, status, winner }) => c.query(
  `insert into public.arena_duels (challenger_id, challenger_key, opponent_id, opponent_key, status, winner_id)
   values ($1, 'github:a', $2, 'github:b', $3, $4)`,
  [challenger, opponent, status, winner],
)

/**
 * Le dossier public d'un joueur. La vue n'est pas une commodité d'affichage : c'est la
 * garantie technique de la règle de visibilité. Un écran peut oublier de cacher une colonne ;
 * une colonne absente de la vue ne peut pas fuir.
 */
describe.skipIf(!disponible)('arena_public_profile', () => {
  /**
   * La règle de la spec § 5, tenue au niveau du schéma. Le nombre d'exemplaires est un
   * compteur brut de PR mergées : le publier dans une entreprise reviendrait à afficher un
   * classement de productivité.
   */
  it('ne porte aucune colonne interdite', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'arena_public_profile'`,
      )
      const colonnes = rows.map((r) => r.column_name).sort()
      expect(colonnes).toEqual(['avatar_url', 'login', 'losses', 'slug', 'species', 'user_id', 'wins'])
      for (const interdite of ['copies', 'exemplars', 'pokedollars', 'credits', 'destroyed']) {
        expect(colonnes).not.toContain(interdite)
      }
    })
  })

  // Des espèces distinctes, pas des captures : douze Magicarpe font une espèce.
  it('compte les espèces, jamais les exemplaires', async () => {
    await scene(async (c) => {
      await capture(c, MOI, 129, 1)
      await capture(c, MOI, 129, 2)
      await capture(c, MOI, 129, 3)
      await capture(c, MOI, 25, 4)
      expect((await fiche(c, 'moi')).species).toBe(2)
    })
  })

  /**
   * Le compteur du Pokédex affichait 44 espèces quand la fiche en annonçait 47 : l'écart disait
   * sans ambiguïté que trois inédits dormaient dans la file d'ouverture. Un chiffre ne doit
   * jamais apprendre ce qu'un rituel est là pour révéler.
   */
  it('ne compte pas une carte encore fermée', async () => {
    await scene(async (c) => {
      await capture(c, MOI, 25, 1)
      await capture(c, MOI, 150, 2, { ouvert: false })
      expect((await fiche(c, 'moi')).species).toBe(1)
    })
  })

  /**
   * La vue ne lisait que les captures. Un Mackogneur obtenu par évolution comptait donc dans la
   * collection de son propriétaire et pas dans le chiffre que ses collègues lisaient.
   */
  it('compte aussi les espèces obtenues par évolution', async () => {
    await scene(async (c) => {
      await capture(c, MOI, 66, 1) // Machoc capturé
      await c.query(
        `insert into public.evolutions (user_id, from_species, to_species, from_key, day)
         values ($1, 66, 67, 'github:sha-1', '2026-09-01')`,
        [MOI],
      )
      expect((await fiche(c, 'moi')).species).toBe(2) // Machoc vu, Machopeur obtenu
    })
  })

  // L'union ne doit pas compter deux fois une espèce qu'on a capturée ET obtenue par évolution.
  it('ne compte qu’une fois une espèce à la fois capturée et évoluée', async () => {
    await scene(async (c) => {
      await capture(c, MOI, 66, 1)
      await capture(c, MOI, 67, 2)
      await c.query(
        `insert into public.evolutions (user_id, from_species, to_species, from_key, day)
         values ($1, 66, 67, 'github:sha-1', '2026-09-01')`,
        [MOI],
      )
      expect((await fiche(c, 'moi')).species).toBe(2)
    })
  })

  it('compte les victoires des deux camps du duel', async () => {
    await scene(async (c) => {
      await duel(c, { challenger: MOI, opponent: LUI, status: 'resolved', winner: MOI })
      await duel(c, { challenger: LUI, opponent: MOI, status: 'resolved', winner: MOI })
      expect((await fiche(c, 'moi')).wins).toBe(2)
      expect((await fiche(c, 'lui')).losses).toBe(2)
    })
  })

  /**
   * Une défaite contre la maison n'a pas de vainqueur : `arena_resolve_expired` laisse
   * `winner_id` à NULL quand le joueur tombe face à l'ordinateur. Sans `is distinct from`, la
   * comparaison rendrait NULL et cette défaite-là ne serait jamais comptée — le palmarès
   * afficherait des joueurs qui ne perdent jamais.
   */
  it('compte la défaite contre l’ordinateur, qui n’a pas de vainqueur', async () => {
    await scene(async (c) => {
      await duel(c, { challenger: MOI, opponent: null, status: 'computer', winner: null })
      const d = await fiche(c, 'moi')
      expect(d.losses).toBe(1)
      expect(d.wins).toBe(0)
    })
  })

  // Un défi encore ouvert n'est pas une défaite : il n'a simplement pas été joué.
  it('ne compte pas les défis ouverts', async () => {
    await scene(async (c) => {
      await duel(c, { challenger: MOI, opponent: null, status: 'open', winner: null })
      const d = await fiche(c, 'moi')
      expect(d.wins + d.losses).toBe(0)
    })
  })

  // Sans compte reconnu, on ne s'adresse pas : rien à publier.
  it('n’expose que les joueurs qu’une identité désigne', async () => {
    await scene(async (c) => {
      await c.query('delete from public.identities where user_id = $1', [LUI])
      expect(await fiche(c, 'lui')).toBeUndefined()
      expect(await fiche(c, 'moi')).toBeDefined()
    })
  })

  it('rend une fiche vide, et non aucune ligne, pour qui n’a rien joué', async () => {
    await scene(async (c) => {
      const d = await fiche(c, 'moi')
      expect(d).toMatchObject({ slug: 'moi', login: 'moi', species: 0, wins: 0, losses: 0 })
    })
  })

  it('est lisible par un joueur connecté', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(
        `select has_table_privilege('authenticated', 'public.arena_public_profile', 'select') as ok`,
      )
      expect(rows[0].ok).toBe(true)
    })
  })
})
