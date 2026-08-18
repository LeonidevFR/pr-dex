import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'
import { DEX, familyOf, CANDY_PER_CATCH } from '../shared/species.js'

const disponible = await dbAvailable()

const MOI = 'ee110000-0000-0000-0000-000000000001'
const AUTRE = 'ee220000-0000-0000-0000-000000000002'

/** Chenipan → Chrysacier → Papilusion : la lignée la moins chère, donc la plus commode à tester. */
const CHENIPAN = 10
const CHRYSACIER = 11
const PAPILUSION = 12

async function scene(fn) {
  return withDb(async (c) => {
    await c.query('begin')
    try {
      for (const id of [MOI, AUTRE]) {
        await c.query(
          `insert into auth.users (id, instance_id, aud, role, email)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
          [id, `${id}@evo.test`],
        )
      }
      return await fn(c)
    } finally {
      await c.query('rollback')
    }
  })
}

/** Une capture ouverte : c'est l'ouverture qui crédite les bonbons, pas l'arrivée du pli. */
async function capture(c, uid, species, n) {
  const cle = `github:${uid.slice(0, 6)}-${n}`
  await c.query(
    `insert into public.catches (user_id, source, external_id, label, date, species, shiny)
     values ($1, 'github', $2, 'PR', current_date, $3, false)`,
    [uid, cle.split(':')[1], species],
  )
  await c.query(
    `insert into public.state (user_id, claimed) values ($1, to_jsonb(array[$2::text]))
     on conflict (user_id) do update set claimed = public.state.claimed || to_jsonb(array[$2::text])`,
    [uid, cle],
  )
  return cle
}

const evoluer = (c, uid, cle, cible) => c.query(
  `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true),
          public.dex_evolve($2, $3, '2026-08-14') as id`,
  [uid, cle, cible],
).then((r) => r.rows[0].id)

const bonbons = (c, uid, fam) => c.query(
  'select public.dex_candies($1, $2) as n', [uid, fam],
).then((r) => Number(r.rows[0].n))

/**
 * Les évolutions passent côté serveur. Elles vivaient dans une colonne jsonb que le client
 * réécrivait en entier : le serveur ne les inspectait pas, si bien qu'il acceptait d'engager un
 * exemplaire déjà consommé — un duel sans rien à perdre — et refusait de laisser combattre un
 * Pokémon obtenu par évolution, faute de savoir qu'il existe.
 */
describe.skipIf(!disponible)('dex_evolve', () => {
  it('fait évoluer un exemplaire et consigne la lignée', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 3; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      const id = await evoluer(c, MOI, cles[0], CHRYSACIER)

      const { rows } = await c.query('select * from public.evolutions where id = $1', [id])
      expect(rows[0]).toMatchObject({
        user_id: MOI, from_species: CHENIPAN, to_species: CHRYSACIER, from_key: cles[0],
      })
    })
  })

  // Les bonbons sont communs à la famille : trois Chenipan et deux Chrysacier alimentent la
  // même réserve, et une évolution y puise.
  it('décompte les bonbons de la famille, pas de l’espèce', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 4; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      const fam = familyOf(CHENIPAN)

      expect(await bonbons(c, MOI, fam)).toBe(4 * CANDY_PER_CATCH)
      await evoluer(c, MOI, cles[0], CHRYSACIER)
      expect(await bonbons(c, MOI, fam)).toBe(4 * CANDY_PER_CATCH - DEX[CHENIPAN].cost)
    })
  })

  it('refuse quand les bonbons manquent', async () => {
    await scene(async (c) => {
      const cle = await capture(c, MOI, CHENIPAN, 0)
      await expect(evoluer(c, MOI, cle, CHRYSACIER)).rejects.toThrow(/bonbons insuffisants/)
    })
  })

  /**
   * La contrainte d'unicité sur `(user_id, from_key)` : un exemplaire ne se consomme qu'une
   * fois, et c'est la base qui le garantit — même si deux appareils tentent l'évolution au même
   * instant, ce qu'aucune vérification côté client ne peut empêcher.
   */
  it('refuse d’évoluer deux fois le même exemplaire', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 6; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      await evoluer(c, MOI, cles[0], CHRYSACIER)
      await expect(evoluer(c, MOI, cles[0], CHRYSACIER)).rejects.toThrow(/déjà évolué/)
    })
  })

  it('refuse une cible qui n’est pas dans la lignée', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 3; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      await expect(evoluer(c, MOI, cles[0], PAPILUSION)).rejects.toThrow(/n'évolue pas en/)
    })
  })

  it('refuse un exemplaire qui n’est pas à soi', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 3; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      await expect(evoluer(c, AUTRE, cles[0], CHRYSACIER)).rejects.toThrow(/exemplaire inconnu/)
    })
  })

  /**
   * Le premier des deux défauts que cette migration corrige : la ligne `catches` d'un exemplaire
   * détruit subsiste, et l'évolution lui rendait une clé neuve — la perte s'annulait.
   */
  it('refuse un exemplaire détruit à l’arène', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 3; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      await c.query(
        `insert into public.arena_exemplars (user_id, entry_key, level, wins, destroyed_at)
         values ($1, $2, 1, 0, now())`,
        [MOI, cles[0]],
      )
      await expect(evoluer(c, MOI, cles[0], CHRYSACIER)).rejects.toThrow(/détruit/)
    })
  })

  // Un exemplaire engagé est immobilisé, pas disponible : l'évoluer le ferait disparaître de
  // sous le duel qui l'attend.
  it('refuse un exemplaire engagé dans un défi ouvert', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 3; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      await c.query(
        `insert into public.arena_duels (challenger_id, challenger_key, status)
         values ($1, $2, 'open')`,
        [MOI, cles[0]],
      )
      await expect(evoluer(c, MOI, cles[0], CHRYSACIER)).rejects.toThrow(/engagé/)
    })
  })

  /**
   * Le second défaut : l'arène cherchait l'espèce dans `catches`, où une évolution n'a pas de
   * ligne. Les formes évoluées — souvent les plus belles bêtes — étaient exclues du jeu sans que
   * personne l'ait décidé.
   */
  it('reconnaît un Pokémon obtenu par évolution, et le laisse évoluer encore', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 8; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      const id = await evoluer(c, MOI, cles[0], CHRYSACIER)

      const { rows } = await c.query('select public.dex_species_of($1, $2) as s', [MOI, `evo:${id}`])
      expect(rows[0].s).toBe(CHRYSACIER)

      // Et la chaîne continue : Chrysacier évolue à son tour.
      const suivant = await evoluer(c, MOI, `evo:${id}`, PAPILUSION)
      expect(suivant).toBeTruthy()
    })
  })

  it('n’accorde aucune écriture directe sur la table', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(
        `select has_table_privilege('authenticated', 'public.evolutions', $1) as ok`, ['insert'],
      )
      expect(rows[0].ok).toBe(false)
    })
  })
})

/**
 * Les lignées recopiées en base doivent dire exactement ce que dit `shared/species.js`. Une
 * divergence laisserait le serveur refuser une évolution que l'écran propose, ou l'inverse.
 */
describe.skipIf(!disponible)('parité des lignées', () => {
  it('accorde coût, famille et cibles sur les 251 espèces', async () => {
    const rows = await withDb((c) => c.query(
      'select species, family, cost, targets from public.species_evo order by species',
    ).then((r) => r.rows))

    expect(rows).toHaveLength(Object.keys(DEX).length)
    for (const r of rows) {
      const s = DEX[r.species]
      const cibles = s.to ? (Array.isArray(s.to) ? s.to : [s.to]) : []
      expect({ id: r.species, fam: r.family, cost: r.cost, to: r.targets }).toEqual({
        id: s.id, fam: familyOf(s.id), cost: s.cost ?? null, to: cibles,
      })
    }
  })
})

/**
 * La reprise des évolutions déjà faites.
 *
 * C'est la seule partie de cette migration qui touche à des données réelles : trois semaines
 * d'évolutions vivent dans `state.evolutions`, une colonne jsonb écrite par le client. Elles
 * sont transposées telles quelles, sans rien revalider — elles ont été faites sous l'ancien
 * régime, et le passé ne se rejuge pas.
 */
describe.skipIf(!disponible)('reprise des évolutions', () => {
  const etat = (c, uid, evolutions) => c.query(
    `insert into public.state (user_id, claimed, evolutions) values ($1, '[]'::jsonb, $2::jsonb)
     on conflict (user_id) do update set evolutions = excluded.evolutions`,
    [uid, JSON.stringify(evolutions)],
  )

  const reprises = (c, uid) => c.query(
    'select * from public.evolutions where user_id = $1 order by id', [uid],
  ).then((r) => r.rows)

  it('transpose une évolution du format actuel', async () => {
    await scene(async (c) => {
      await etat(c, MOI, [{ species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:x', date: '2026-07-01' }])
      await c.query('select public.dex_backfill_evolutions()')
      expect(await reprises(c, MOI)).toMatchObject([{
        from_species: CHENIPAN, to_species: CHRYSACIER, from_key: 'github:x', day: '2026-07-01',
      }])
    })
  })

  // `fromSha` est le nom qu'avait `fromKey` avant le passage à Supabase : d'anciennes entrées
  // le portent encore, et les perdre reviendrait à rendre des exemplaires déjà consommés.
  it('lit aussi l’ancien nom du champ', async () => {
    await scene(async (c) => {
      await etat(c, MOI, [{ species: CHRYSACIER, from: CHENIPAN, fromSha: 'github:vieux' }])
      await c.query('select public.dex_backfill_evolutions()')
      expect((await reprises(c, MOI))[0].from_key).toBe('github:vieux')
    })
  })

  /**
   * L'ordre du tableau est la seule chose que l'ancien format garantissait, et il porte du sens :
   * la clé `evo:<id>` d'un Pokémon obtenu par évolution en dépend, et une évolution en chaîne
   * peut désigner comme source un exemplaire produit par une évolution précédente.
   */
  it('conserve l’ordre de la chaîne', async () => {
    await scene(async (c) => {
      await etat(c, MOI, [
        { species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:a' },
        { species: PAPILUSION, from: CHRYSACIER, fromKey: 'github:b' },
        { species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:c' },
      ])
      await c.query('select public.dex_backfill_evolutions()')
      expect((await reprises(c, MOI)).map((r) => r.from_key)).toEqual(['github:a', 'github:b', 'github:c'])
    })
  })

  it('ne duplique rien si on la rejoue', async () => {
    await scene(async (c) => {
      await etat(c, MOI, [{ species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:x' }])
      await c.query('select public.dex_backfill_evolutions()')
      const n = await c.query('select public.dex_backfill_evolutions() as n').then((r) => r.rows[0].n)
      expect(n).toBe(0)
      expect(await reprises(c, MOI)).toHaveLength(1)
    })
  })

  it('sépare les joueurs', async () => {
    await scene(async (c) => {
      await etat(c, MOI, [{ species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:x' }])
      await etat(c, AUTRE, [{ species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:x' }])
      await c.query('select public.dex_backfill_evolutions()')
      expect(await reprises(c, MOI)).toHaveLength(1)
      expect(await reprises(c, AUTRE)).toHaveLength(1)
    })
  })

  /**
   * Le contrôle qu'on lira en production : autant de lignes reprises que d'entrées dans les
   * états. Un écart signalerait une entrée sans clé d'exemplaire — écrite par une version
   * antérieure — et demanderait un examen à la main.
   */
  it('reprend exactement autant de lignes qu’il y a d’entrées', async () => {
    await scene(async (c) => {
      await etat(c, MOI, [
        { species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:a' },
        { species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:b' },
      ])
      await etat(c, AUTRE, [{ species: CHRYSACIER, from: CHENIPAN, fromKey: 'github:c' }])
      await c.query('select public.dex_backfill_evolutions()')

      // Compté sur les seuls joueurs de ce cas, et non sur toute la base : d'autres tests y
      // écrivent, et surtout l'application elle-même écrira des évolutions NEUVES, absentes des
      // états. Le contrôle global n'est juste qu'à un seul instant — juste après la reprise, en
      // production — et c'est ainsi qu'il est décrit dans la migration.
      const { rows } = await c.query(`
        select (select count(*) from public.evolutions where user_id = any($1)) :: int as reprises,
               (select coalesce(sum(jsonb_array_length(evolutions)), 0)
                  from public.state where user_id = any($1)) :: int as attendues
      `, [[MOI, AUTRE]])
      expect(rows[0].reprises).toBe(rows[0].attendues)
    })
  })
})

/**
 * Le gain promis par cette bascule : l'arène cherchait l'espèce dans `catches`, où une évolution
 * n'a pas de ligne. Les formes évoluées — souvent les plus belles bêtes — étaient exclues du
 * jeu sans que personne l'ait décidé, et un exemplaire déjà consommé y était au contraire
 * accepté, ce qui donnait un duel sans rien à perdre.
 */
describe.skipIf(!disponible)('l’arène et les évolutions', () => {
  const engager = (c, uid, cle) => c.query(
    `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true),
            public.arena_engage($2, false) as id`,
    [uid, cle],
  ).then((r) => r.rows[0].id)

  it('accepte un Pokémon obtenu par évolution', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 3; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      const id = await evoluer(c, MOI, cles[0], CHRYSACIER)
      await expect(engager(c, MOI, `evo:${id}`)).resolves.toBeTruthy()
    })
  })

  it('refuse un exemplaire consommé par une évolution', async () => {
    await scene(async (c) => {
      const cles = []
      for (let i = 0; i < 3; i++) cles.push(await capture(c, MOI, CHENIPAN, i))
      await evoluer(c, MOI, cles[0], CHRYSACIER)
      await expect(engager(c, MOI, cles[0])).rejects.toThrow(/déjà évolué/)
    })
  })

  it('accepte toujours une capture ordinaire', async () => {
    await scene(async (c) => {
      const cle = await capture(c, MOI, CHENIPAN, 0)
      await expect(engager(c, MOI, cle)).resolves.toBeTruthy()
    })
  })
})
