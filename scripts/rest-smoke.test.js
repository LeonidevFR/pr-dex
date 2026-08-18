import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { withDb, dbAvailable } from './db-test-helper.mjs'

/**
 * La couture que rien d'autre n'exerce : le front parlant à PostgREST.
 *
 * La démonstration ne fait partir aucune requête — son client est une fixture. Les tests de base
 * appellent les fonctions Postgres directement en SQL. Entre les deux, `supabaseData.js` traduit
 * chaque intention en appel REST, et cette traduction n'était vérifiée nulle part : un nom de
 * paramètre de RPC mal orthographié, un `grant` oublié sur une vue, un `.maybeSingle()` qui ne
 * rend pas ce qu'on croit — chacune de ces fautes passe les deux suites et casse au premier clic
 * en production.
 *
 * On fait donc tourner LE VRAI client contre la pile locale. La clé anonyme de Supabase n'est
 * qu'un JWT signé avec le secret de l'instance : on en forge un au nom d'un joueur de test, et
 * le client s'authentifie sans passer par OAuth.
 */
const disponible = await dbAvailable()

const API = 'http://127.0.0.1:54321'
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const JOUEUR = 'aabbccdd-0000-0000-0000-00000000fume'.replace('fume', '0001')

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Un jeton d'accès valide pour ce joueur, signé comme le ferait GoTrue. */
function jeton(sub) {
  const entete = b64({ alg: 'HS256', typ: 'JWT' })
  const charge = b64({
    sub, role: 'authenticated', aud: 'authenticated',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  })
  const signature = createHmac('sha256', SECRET).update(`${entete}.${charge}`).digest('base64url')
  return `${entete}.${charge}.${signature}`
}

/** Les captures du joueur de test, ouvertes — c'est l'ouverture qui crédite les bonbons. */
const CHENIPAN = 10
const CHRYSACIER = 11

let client

beforeAll(async () => {
  if (!disponible) return

  await withDb(async (c) => {
    await c.query(`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'fumee@test.local', '', now(), now(), now())
      on conflict (id) do nothing
    `, [JOUEUR])

    // On repart d'une ardoise propre : ces lignes survivent au test, et une deuxième exécution
    // trouverait sinon des crédits déjà dépensés et des exemplaires déjà évolués.
    await c.query('delete from public.evolutions where user_id = $1', [JOUEUR])
    await c.query('delete from public.arena_duels where challenger_id = $1 or opponent_id = $1', [JOUEUR])
    await c.query('delete from public.arena_packs where user_id = $1', [JOUEUR])
    await c.query('delete from public.arena_exemplars where user_id = $1', [JOUEUR])
    await c.query('delete from public.catches where user_id = $1', [JOUEUR])

    const cles = []
    for (let i = 0; i < 6; i++) {
      const ext = `fumee-${i}`
      await c.query(`
        insert into public.catches (user_id, species, source, external_id, label, date)
        values ($1, $2, 'github', $3, 'PR de fumée', current_date)
      `, [JOUEUR, CHENIPAN, ext])
      cles.push(`github:${ext}`)
    }

    await c.query(`
      insert into public.state (user_id, claimed, spent, evolutions)
      values ($1, $2::jsonb, '{}'::jsonb, '[]'::jsonb)
      on conflict (user_id) do update set claimed = excluded.claimed, evolutions = '[]'::jsonb
    `, [JOUEUR, JSON.stringify(cles)])

    await c.query(`
      insert into public.arena_wallet (user_id, pokedollars) values ($1, 5000)
      on conflict (user_id) do update set pokedollars = 5000
    `, [JOUEUR])

    await c.query('update public.profiles set pseudo = null where user_id = $1', [JOUEUR])
  })

  // Le vrai client, monté sur la pile locale. La clé anonyme étant un JWT, celui du joueur
  // en tient lieu : `auth.uid()` vaut alors son identifiant côté base.
  vi.stubEnv('VITE_SUPABASE_URL', API)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', jeton(JOUEUR))
  vi.resetModules()
  const { createSupabaseClient } = await import('../src/lib/supabaseData.js')
  client = createSupabaseClient(JOUEUR)
})

describe.skipIf(!disponible)('le front parle à PostgREST', () => {
  it('vérifie l’accès, comme à la connexion', async () => {
    await expect(client.checkAccess()).resolves.toBe(true)
  })

  it('lit les captures et l’état', async () => {
    expect(await client.readCatches()).toHaveLength(6)
    const { state } = await client.readState()
    expect(state.claimed).toHaveLength(6)
  })

  /**
   * Chaque lecture de l'arène rend une forme précise que le composable consomme sans la
   * vérifier. Une colonne renommée ou un `grant` oublié se verrait ici, et nulle part ailleurs
   * avant la production.
   */
  it('lit l’arène : crédits, portefeuille, exemplaires', async () => {
    const arene = await client.readArena()
    expect(arene).toMatchObject({ pokedollars: 5000 })
    expect(typeof arene.credits).toBe('number')
    expect(Array.isArray(arene.exemplars)).toBe(true)
  })

  it('lit le catalogue, le classement et les saisons closes', async () => {
    expect((await client.readShop()).length).toBeGreaterThan(0)
    expect(Array.isArray(await client.readLeaderboard('2099-S1'))).toBe(true)
    expect(Array.isArray(await client.readSeasons())).toBe(true)
  })

  // Le pseudonyme est la seule écriture directe du front : tout le reste passe par une RPC.
  it('pose un pseudonyme, et le relit', async () => {
    await client.setPseudo('fumee')
    expect(await client.readPseudo()).toBe('fumee')
  })

  it('lit son dossier public une fois nommé', async () => {
    const dossier = await client.readMyProfile(JOUEUR)
    expect(dossier).toMatchObject({ pseudo: 'fumee' })
    expect(typeof dossier.species).toBe('number')
  })

  /**
   * Le parcours qui compte : engager, se relire, et retrouver son défi. Les noms de paramètres
   * d'une RPC ne se vérifient qu'ici — en SQL on les écrit à la main, et une faute de frappe
   * côté client passerait inaperçue jusqu'au premier clic.
   */
  it('engage un exemplaire et retrouve son défi en attente', async () => {
    const id = await client.engage('github:fumee-0', false)
    expect(id).toBeTruthy()

    const miens = await client.readMyOpen()
    expect(miens.map((d) => d.challenger_key)).toContain('github:fumee-0')

    // Le défi ouvert ne doit exposer sa mise à personne, pas même par ce chemin.
    const ouverts = await client.readOpenChallenges()
    for (const d of ouverts) expect(Object.keys(d)).not.toContain('challenger_key')
  })

  it('affronte l’ordinateur et relit le duel résolu', async () => {
    const id = await client.engage('github:fumee-1', true)
    const duel = await client.readDuel(id)
    expect(duel).toMatchObject({ id, status: 'computer' })
    expect(typeof duel.probability).toBe('number')
  })

  it('retrouve ses duels récents', async () => {
    const duels = await client.readMyDuels()
    expect(duels.length).toBeGreaterThan(0)
  })

  it('achète un pli et voit sa caisse baisser', async () => {
    const avant = (await client.readArena()).pokedollars
    await client.buy('gen1-c')
    expect((await client.readArena()).pokedollars).toBeLessThan(avant)
  })

  it('refuse un achat hors budget, en le disant', async () => {
    await expect(client.buy('gen1-l-inedit')).rejects.toThrow(/pokédollars/)
  })

  /**
   * L'évolution est la RPC la plus récente, donc la moins éprouvée : trois paramètres nommés,
   * dont un texte et un entier. C'est le cas type d'une faute qui ne se voit qu'à l'exécution.
   */
  it('fait évoluer un exemplaire et relit la lignée', async () => {
    const id = await client.evolve('github:fumee-2', CHRYSACIER, '2026-08-18')
    expect(id).toBeTruthy()

    const evolutions = await client.readEvolutions()
    expect(evolutions.map((e) => e.from_key)).toContain('github:fumee-2')
    expect(evolutions.at(-1)).toMatchObject({ to_species: CHRYSACIER })
  })

  it('refuse d’évoluer deux fois le même exemplaire, en le disant', async () => {
    await expect(client.evolve('github:fumee-2', CHRYSACIER, '2026-08-18'))
      .rejects.toThrow(/déjà évolué/)
  })

  it('refuse d’engager un exemplaire consommé, en le disant', async () => {
    await expect(client.engage('github:fumee-2', true)).rejects.toThrow(/déjà évolué/)
  })

  it('lit ses exemplaires détruits', async () => {
    expect(Array.isArray(await client.readDestroyed())).toBe(true)
  })

  // Le profil d'un inconnu doit rendre « rien », pas une erreur : c'est ce que l'écran attend
  // pour afficher « personne ne joue sous ce nom ».
  it('rend un profil vide pour un pseudonyme inconnu', async () => {
    expect(await client.readPublicProfile('personne-sous-ce-nom')).toBeNull()
  })
})
