import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const U = 'ee55ee55-0000-0000-0000-000000000005'

/**
 * Le classement d'équipe lit les évolutions, et l'arène les a déménagées : de la colonne jsonb
 * `state.evolutions`, que le client écrivait lui-même, vers `public.evolutions`, que le serveur
 * valide. Rien ne vérifiait cette lecture côté base.
 *
 * Ce trou s'est payé : la connexion Slack redéfinit `leaderboard_players` pour nommer les
 * comptes sans login GitHub, et sa version — postérieure — relisait `state.evolutions`. La
 * bascule de l'arène était écrasée en silence, sans qu'un seul test rougisse. La fonction est
 * réécrite entière à chaque fois : la dernière migration appliquée gagne, et une migration qui
 * touche à la même fonction doit passer après.
 */
describe.skipIf(!disponible)('leaderboard_players', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      await c.query(`
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                email_confirmed_at, created_at, updated_at, raw_user_meta_data)
        values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                'lbp@classement.local', '', now(), now(), now(), '{"user_name":"lbp-dev"}'::jsonb)
        on conflict (id) do nothing
      `, [U])
      await c.query(`
        insert into public.catches (user_id, source, external_id, label, species, shiny, date)
        values ($1, 'github', 'lbp-1', 'pr-dex#1 — une PR', 16, false, current_date)
        on conflict do nothing
      `, [U])
      await c.query(`update public.state set claimed = '["github:lbp-1"]'::jsonb,
                     evolutions = '[]'::jsonb where user_id = $1`, [U])
      await c.query(`
        insert into public.evolutions (user_id, from_species, to_species, from_key, day)
        values ($1, 16, 17, 'github:lbp-1', '2026-10-14')
        on conflict do nothing
      `, [U])
    })
  })

  const moi = () => withDb(async (c) =>
    (await c.query('select * from public.leaderboard_players() where login = $1', ['lbp-dev'])).rows[0])

  it('rend les évolutions depuis public.evolutions', async () => {
    const r = await moi()
    expect(r.evolutions).toEqual([
      { id: expect.any(Number), from_species: 16, to_species: 17, from_key: 'github:lbp-1' },
    ])
  })

  // Le nommage de la connexion Slack doit survivre à la bascule : un compte sans login GitHub
  // se nomme par son nom Slack, et ne redevient pas « inconnu ».
  it('garde le nommage des comptes sans login GitHub', async () => {
    const src = await withDb(async (c) =>
      (await c.query("select prosrc from pg_proc where proname = 'leaderboard_players'")).rows[0].prosrc)
    expect(src).toContain("raw_user_meta_data ->> 'full_name'")
    expect(src).toContain("raw_user_meta_data ->> 'picture'")
    // `evos.evolutions` contient la même suite de lettres : on vise la colonne de `state`,
    // nommée par son alias, et non n'importe quelle occurrence du mot.
    expect(src).not.toMatch(/\bs\.evolutions\b/)
  })

  it('ne rend que les joueurs dont une carte est ouverte', async () => {
    const r = await moi()
    expect(r.catches).toEqual([
      { source: 'github', external_id: 'lbp-1', species: 16, shiny: false, date: expect.any(String) },
    ])
  })
})
