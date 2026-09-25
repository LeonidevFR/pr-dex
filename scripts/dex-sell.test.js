import { describe, it, expect } from 'vitest'
import { salePrice, SALE_BASE } from '../shared/arena-economy.js'
import { LEVEL_MAX } from '../shared/battle.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const MOI = '51111111-1111-1111-1111-111111111111'
const AUTRE = '52222222-2222-2222-2222-222222222222'

/** Chenipan → Chrysacier : la lignée la moins chère, la plus commode à consommer. */
const CHENIPAN = 10
const CHRYSACIER = 11
const RATTATA = 19   // commun
const BULBIZARRE = 1 // rare

async function scene(fn) {
  return withDb(async (c) => {
    await c.query('begin')
    try {
      for (const id of [MOI, AUTRE]) {
        await c.query(
          `insert into auth.users (id, instance_id, aud, role, email)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
          [id, `${id}@sell.test`],
        )
        await c.query(
          `insert into public.state (user_id, claimed) values ($1, '[]'::jsonb)
           on conflict (user_id) do nothing`, [id],
        )
      }
      return await fn(c)
    } finally {
      await c.query('rollback')
    }
  })
}

/** Une capture, dont la clé d'exemplaire est `github:<n>`. */
const capture = (c, uid, species, n, shiny = false) => c.query(
  `insert into public.catches (user_id, source, external_id, label, date, species, shiny)
   values ($1, 'github', $2, 'PR', current_date, $3, $4)`,
  [uid, String(n), species, shiny],
)

const seDonnerLIdentite = (c, uid) => c.query(
  `select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)`, [uid],
)

const vendre = async (c, uid, keys) => {
  await seDonnerLIdentite(c, uid)
  const { rows } = await c.query('select * from public.dex_sell($1::text[])', [keys])
  return rows[0]
}

/**
 * Un refus attendu, sans emporter la transaction du cas.
 *
 * `raise exception` avorte la transaction : tout ce qui suit échouerait avec « current
 * transaction is aborted » — y compris les vérifications qui prouvent que RIEN n'a été encaissé,
 * et qui sont justement l'intérêt du test. Un point de reprise rend la main proprement.
 */
const refus = async (c, uid, keys) => {
  await c.query('savepoint avant_vente')
  try {
    await vendre(c, uid, keys)
  } catch (e) {
    await c.query('rollback to savepoint avant_vente')
    return e.message
  }
  await c.query('rollback to savepoint avant_vente')
  return 'LA VENTE A ÉTÉ ACCEPTÉE, alors qu’elle devait être refusée'
}

const solde = (c, uid) => c.query(
  'select coalesce((select pokedollars from public.arena_wallet where user_id = $1), 0) as s', [uid],
).then((r) => Number(r.rows[0].s))

describe.skipIf(!disponible)('prix de revente : parité JavaScript / SQL', () => {
  /**
   * La formule vit en double — le serveur débite, le front affiche avant de cliquer. C'est le
   * quatrième endroit du projet où une règle est écrite deux fois, après la forme du jour, les
   * saisons et la résolution des duels, et il mérite le même garde-fou : une divergence ferait
   * encaisser autre chose que le prix annoncé.
   */
  it('accorde les deux implémentations sur tous les paliers, niveaux et shinies', async () => {
    const especes = [RATTATA, 35, BULBIZARRE, 150, 152, 249] // les quatre paliers, deux générations
    const cas = []
    for (const species of especes) {
      for (let level = 1; level <= LEVEL_MAX; level++) {
        for (const shiny of [false, true]) cas.push({ species, level, shiny })
      }
    }

    const attendus = cas.map((k) => salePrice(k.species, k.level, k.shiny))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select public.dex_sale_price(
                  (k ->> 'species') :: int, (k ->> 'level') :: int, (k ->> 'shiny') :: boolean) as p
         from unnest($1::jsonb[]) with ordinality as t(k, n) order by n`,
        [cas.map((k) => JSON.stringify(k))],
      )
      return rows.map((r) => Number(r.p))
    })
    expect(obtenus).toEqual(attendus)
  })

  // Le plancher de la grille vit lui aussi en double : une base qui diverge fausse tout le reste.
  it('accorde la base de chaque palier', async () => {
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select st.tier, public.dex_sale_price(st.species, 1, false) as p
         from public.species_stats st where st.species in (19, 35, 1, 150)`)
      return Object.fromEntries(rows.map((r) => [r.tier, Number(r.p)]))
    })
    expect(obtenus).toEqual(SALE_BASE)
  })
})

describe.skipIf(!disponible)('dex_sell', () => {
  it('encaisse le prix du niveau et vide l’exemplaire du stock', async () => {
    await scene(async (c) => {
      await capture(c, MOI, RATTATA, 1)
      await capture(c, MOI, RATTATA, 2)
      const out = await vendre(c, MOI, ['github:1'])

      expect(out).toMatchObject({ sold: 1, total: salePrice(RATTATA, 1), balance: salePrice(RATTATA, 1) })
      expect(await c.query(
        'select sold_price, sold_at from public.arena_exemplars where user_id = $1 and entry_key = $2',
        [MOI, 'github:1'],
      ).then((r) => Number(r.rows[0].sold_price))).toBe(salePrice(RATTATA, 1))
    })
  })

  // Le niveau est la seule chose que le joueur peut faire monter : c'est le cœur de l'idée.
  it('paye un exemplaire aguerri au prix de son niveau', async () => {
    await scene(async (c) => {
      await capture(c, MOI, RATTATA, 1)
      await capture(c, MOI, RATTATA, 2)
      await c.query(
        `insert into public.arena_exemplars (user_id, entry_key, level, wins) values ($1, 'github:1', 8, 7)`,
        [MOI],
      )
      const out = await vendre(c, MOI, ['github:1'])
      expect(out.total).toBe(salePrice(RATTATA, 8))
      expect(out.total).toBeGreaterThan(salePrice(RATTATA, 1))
    })
  })

  it('cumule un lot en une seule opération', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 4; n++) await capture(c, MOI, RATTATA, n)
      const out = await vendre(c, MOI, ['github:1', 'github:2', 'github:3'])
      expect(out.sold).toBe(3)
      expect(out.total).toBe(salePrice(RATTATA, 1) * 3)
    })
  })

  /**
   * La règle qui empêche le grind de PR de monétiser la collection elle-même : on ne vend que du
   * surplus. Douze sur treize passent, le treizième est refusé.
   */
  it('refuse le dernier exemplaire d’une espèce', async () => {
    await scene(async (c) => {
      await capture(c, MOI, RATTATA, 1)
      expect(await refus(c, MOI, ['github:1'])).toMatch(/dernier exemplaire/)
      expect(await solde(c, MOI)).toBe(0)
    })
  })

  it('vend tout le surplus d’un coup, sauf le dernier', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 13; n++) await capture(c, MOI, RATTATA, n)
      const clefs = Array.from({ length: 12 }, (_, i) => `github:${i + 1}`)
      expect((await vendre(c, MOI, clefs)).sold).toBe(12)
      expect(await refus(c, MOI, ['github:13'])).toMatch(/dernier exemplaire/)
    })
  })

  // Un lot qui contiendrait le dernier exemplaire ne doit pas passer à moitié.
  it('annule le lot entier dès qu’une clé est refusée', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 3; n++) await capture(c, MOI, RATTATA, n)
      expect(await refus(c, MOI, ['github:1', 'github:2', 'github:3'])).toMatch(/dernier exemplaire/)
      expect(await solde(c, MOI)).toBe(0)
      expect(await c.query(
        'select count(*) :: int as n from public.arena_exemplars where user_id = $1 and sold_at is not null',
        [MOI]).then((r) => r.rows[0].n)).toBe(0)
    })
  })

  // La même carte passée deux fois serait payée deux fois : les clés sont dédoublonnées.
  it('ne paye pas deux fois la même clé dans un même lot', async () => {
    await scene(async (c) => {
      await capture(c, MOI, RATTATA, 1)
      await capture(c, MOI, RATTATA, 2)
      const out = await vendre(c, MOI, ['github:1', 'github:1'])
      expect(out.sold).toBe(1)
      expect(out.total).toBe(salePrice(RATTATA, 1))
    })
  })

  it('refuse un exemplaire déjà vendu', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 3; n++) await capture(c, MOI, RATTATA, n)
      await vendre(c, MOI, ['github:1'])
      expect(await refus(c, MOI, ['github:1'])).toMatch(/déjà quitté/)
    })
  })

  it('refuse un exemplaire détruit à l’arène', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 3; n++) await capture(c, MOI, RATTATA, n)
      await c.query(
        `insert into public.arena_exemplars (user_id, entry_key, destroyed_at)
         values ($1, 'github:1', now())`, [MOI])
      expect(await refus(c, MOI, ['github:1'])).toMatch(/déjà quitté/)
    })
  })

  it('refuse un exemplaire consommé par une évolution', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 3; n++) await capture(c, MOI, CHENIPAN, n)
      await c.query(
        `insert into public.evolutions (user_id, from_species, to_species, from_key, day)
         values ($1, $2, $3, 'github:1', '2026-09-24')`, [MOI, CHENIPAN, CHRYSACIER])
      expect(await refus(c, MOI, ['github:1'])).toMatch(/évolution/)
    })
  })

  it('refuse un exemplaire engagé dans un défi ouvert', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 3; n++) await capture(c, MOI, RATTATA, n)
      await c.query(
        `insert into public.arena_duels (challenger_id, challenger_key, status)
         values ($1, 'github:1', 'open')`, [MOI])
      expect(await refus(c, MOI, ['github:1'])).toMatch(/défi ouvert/)
    })
  })

  it('refuse un exemplaire qui n’est pas le sien', async () => {
    await scene(async (c) => {
      for (let n = 1; n <= 3; n++) await capture(c, AUTRE, RATTATA, n)
      expect(await refus(c, MOI, ['github:1'])).toMatch(/inconnu/)
    })
  })

  it('refuse un appel non authentifié', async () => {
    await scene(async (c) => {
      await c.query(`select set_config('request.jwt.claims', '', true)`)
      await expect(c.query('select * from public.dex_sell($1::text[])', [['github:1']]))
        .rejects.toThrow(/non authentifié/)
    })
  })

  it('refuse un lot vide', async () => {
    await scene(async (c) => {
      expect(await refus(c, MOI, [])).toMatch(/aucun exemplaire/)
    })
  })

  /**
   * Un Pokémon obtenu par évolution hérite du shiny de l'exemplaire consommé, de proche en
   * proche — c'est ce que le front affiche. Le prix quadruple : le serveur doit lire la même
   * chaîne, sinon la vente débite autre chose que ce que l'écran annonçait.
   */
  it('remonte la chaîne d’évolutions pour retrouver un shiny', async () => {
    await scene(async (c) => {
      await capture(c, MOI, CHENIPAN, 1, true)   // shiny d'origine
      await capture(c, MOI, CHRYSACIER, 2)       // pour ne pas vendre le dernier Chrysacier
      const { rows } = await c.query(
        `insert into public.evolutions (user_id, from_species, to_species, from_key, day)
         values ($1, $2, $3, 'github:1', '2026-09-24') returning id`,
        [MOI, CHENIPAN, CHRYSACIER])
      const cle = `evo:${rows[0].id}`

      expect(await c.query('select public.dex_shiny_of($1, $2) as s', [MOI, cle])
        .then((r) => r.rows[0].s)).toBe(true)
      expect((await vendre(c, MOI, [cle])).total).toBe(salePrice(CHRYSACIER, 1, true))
    })
  })

  it('vend un Pokémon obtenu par évolution comme un autre', async () => {
    await scene(async (c) => {
      await capture(c, MOI, CHENIPAN, 1)
      await capture(c, MOI, CHRYSACIER, 2)
      const { rows } = await c.query(
        `insert into public.evolutions (user_id, from_species, to_species, from_key, day)
         values ($1, $2, $3, 'github:1', '2026-09-24') returning id`,
        [MOI, CHENIPAN, CHRYSACIER])
      const out = await vendre(c, MOI, [`evo:${rows[0].id}`])
      expect(out).toMatchObject({ sold: 1, total: salePrice(CHRYSACIER, 1) })
    })
  })

  // Le stock se lit après chaque vente : deux espèces différentes ne se limitent pas l'une l'autre.
  it('compte le stock espèce par espèce', async () => {
    await scene(async (c) => {
      await capture(c, MOI, RATTATA, 1)
      await capture(c, MOI, RATTATA, 2)
      await capture(c, MOI, BULBIZARRE, 3)
      const out = await vendre(c, MOI, ['github:1'])
      expect(out.sold).toBe(1)
      expect(await refus(c, MOI, ['github:3'])).toMatch(/dernier exemplaire/)
    })
  })

  it('ajoute au portefeuille existant au lieu de l’écraser', async () => {
    await scene(async (c) => {
      await capture(c, MOI, RATTATA, 1)
      await capture(c, MOI, RATTATA, 2)
      await c.query(`insert into public.arena_wallet (user_id, pokedollars) values ($1, 900)`, [MOI])
      expect((await vendre(c, MOI, ['github:1'])).balance).toBe(900 + salePrice(RATTATA, 1))
    })
  })

  // Une vente n'est pas un duel : elle ne pèse pas sur le classement.
  it('ne donne aucun point de saison', async () => {
    await scene(async (c) => {
      await capture(c, MOI, RATTATA, 1)
      await capture(c, MOI, RATTATA, 2)
      await vendre(c, MOI, ['github:1'])
      expect(await c.query(
        'select count(*) :: int as n from public.arena_season_points where user_id = $1', [MOI],
      ).then((r) => r.rows[0].n)).toBe(0)
    })
  })

  /**
   * Les bonbons sont encaissés au tirage et se recalculent depuis les lignes `catches`. Une vente
   * qui supprimerait la capture retirerait trois bonbons rétroactivement — peut-être déjà
   * dépensés, donc un solde négatif. La ligne reste, et l'espèce reste au Pokédex.
   */
  it('ne touche ni à la capture, ni aux bonbons, ni à l’espèce acquise', async () => {
    await scene(async (c) => {
      await capture(c, MOI, CHENIPAN, 1)
      await capture(c, MOI, CHENIPAN, 2)
      const avant = await c.query('select public.dex_candies($1, $2) as b', [MOI, CHENIPAN])
        .then((r) => Number(r.rows[0].b))

      await vendre(c, MOI, ['github:1'])

      expect(await c.query('select public.dex_candies($1, $2) as b', [MOI, CHENIPAN])
        .then((r) => Number(r.rows[0].b))).toBe(avant)
      expect(await c.query(
        'select count(*) :: int as n from public.catches where user_id = $1', [MOI],
      ).then((r) => r.rows[0].n)).toBe(2)
    })
  })

  // Deux sorties exclusives : la base le dit, plutôt que de compter sur l'ordre des contrôles.
  it('interdit en base qu’un exemplaire soit à la fois vendu et détruit', async () => {
    await scene(async (c) => {
      await expect(c.query(
        `insert into public.arena_exemplars (user_id, entry_key, sold_at, sold_price, destroyed_at)
         values ($1, 'github:1', now(), 10, now())`, [MOI],
      )).rejects.toThrow(/une_seule_sortie/)
    })
  })
})
