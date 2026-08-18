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
      for (const [id, pseudo] of [[MOI, 'moi'], [LUI, 'lui']]) {
        await c.query(
          `insert into auth.users (id, instance_id, aud, role, email)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
          [id, `${pseudo}@example.test`],
        )
        // Un déclencheur crée déjà le profil à l'inscription : on complète la ligne existante
        // plutôt que d'en insérer une seconde, sinon la clé primaire proteste.
        await c.query(
          `insert into public.profiles (user_id, pseudo) values ($1, $2)
           on conflict (user_id) do update set pseudo = excluded.pseudo`,
          [id, pseudo],
        )
      }
      return await fn(c)
    } finally {
      await c.query('rollback')
    }
  })
}

const dossier = async (c, pseudo) => (await c.query(
  'select * from public.arena_public_profile where pseudo = $1', [pseudo],
)).rows[0]

const capture = (c, uid, species, n) => c.query(
  `insert into public.catches (user_id, source, external_id, label, date, species, shiny)
   values ($1, 'github', $2, 'PR', current_date, $3, false)`,
  [uid, `sha-${uid}-${n}`, species],
)

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
      expect(colonnes).toEqual(['losses', 'pseudo', 'species', 'user_id', 'wins'])
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
      expect((await dossier(c, 'moi')).species).toBe(2)
    })
  })

  it('compte les victoires des deux camps du duel', async () => {
    await scene(async (c) => {
      await duel(c, { challenger: MOI, opponent: LUI, status: 'resolved', winner: MOI })
      await duel(c, { challenger: LUI, opponent: MOI, status: 'resolved', winner: MOI })
      expect((await dossier(c, 'moi')).wins).toBe(2)
      expect((await dossier(c, 'lui')).losses).toBe(2)
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
      const d = await dossier(c, 'moi')
      expect(d.losses).toBe(1)
      expect(d.wins).toBe(0)
    })
  })

  // Un défi encore ouvert n'est pas une défaite : il n'a simplement pas été joué.
  it('ne compte pas les défis ouverts', async () => {
    await scene(async (c) => {
      await duel(c, { challenger: MOI, opponent: null, status: 'open', winner: null })
      const d = await dossier(c, 'moi')
      expect(d.wins + d.losses).toBe(0)
    })
  })

  // Sans pseudonyme, on n'est pas dans l'arène : rien à publier.
  it('n’expose que les joueurs qui se sont nommés', async () => {
    await scene(async (c) => {
      await c.query('update public.profiles set pseudo = null where user_id = $1', [LUI])
      expect(await dossier(c, 'lui')).toBeUndefined()
      expect(await dossier(c, 'moi')).toBeDefined()
    })
  })

  it('rend un dossier vide, et non aucune ligne, pour qui n’a rien joué', async () => {
    await scene(async (c) => {
      const d = await dossier(c, 'moi')
      expect(d).toMatchObject({ pseudo: 'moi', species: 0, wins: 0, losses: 0 })
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
