import { describe, it, expect } from 'vitest'
import { FORMS, LEVEL_MAX, TIER_POWER, formOf, power, winProbability, levelGain, resolveDuel, parisDay } from '../shared/battle.js'
import { DEX } from '../shared/species.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const CLES = [
  'github:a3f8c21e9b', 'github:sha0', 'github:sha1', 'github:sha2',
  'arene:1', 'arene:2', 'boutique:7', 'github:0123456789abcdef',
]
const JOURS = ['2026-08-11', '2026-08-12', '2026-09-01', '2027-01-01']

/**
 * Le JOUR lui-même, avant l'indice de forme. Les deux implémentations peuvent s'accorder sur le
 * calcul et diverger sur la date qu'elles lui donnent à manger : c'est le cas s'il en est un où
 * la parité des fonctions ne prouve rien du tout.
 */
describe.skipIf(!disponible)('parité de la date du jour', () => {
  it('donne la même journée que le SQL, des deux côtés de minuit à Paris', async () => {
    // Les bascules d'été et d'hiver, à une minute près de part et d'autre.
    const instants = [
      '2026-08-14T21:59:00Z', '2026-08-14T22:01:00Z',
      '2026-01-14T22:59:00Z', '2026-01-14T23:01:00Z',
      '2026-03-29T00:30:00Z', '2026-10-25T00:30:00Z',
    ]
    const enBase = await withDb(async (c) => {
      const out = []
      for (const t of instants) {
        const { rows } = await c.query(
          `select to_char($1::timestamptz at time zone 'Europe/Paris', 'YYYY-MM-DD') as j`, [t],
        )
        out.push(rows[0].j)
      }
      return out
    })
    expect(instants.map((t) => parisDay(new Date(t)))).toEqual(enBase)
  })
})

describe.skipIf(!disponible)('parité de la forme du jour', () => {
  it('rend le même indice de forme que le JavaScript', async () => {
    const paires = CLES.flatMap((k) => JOURS.map((j) => [k, j]))
    const attendus = paires.map(([k, j]) => FORMS.indexOf(formOf(k, j)))
    const obtenus = await withDb(async (c) => {
      // `with ordinality` plutôt que de se fier à l'ordre de sortie de `unnest` : la
      // comparaison porte sur des tableaux position par position, elle n'a de sens que si
      // la ligne n de la requête correspond bien à la paire n du JavaScript.
      const { rows } = await c.query(
        `select arena_form_index(a, b) as i
         from unnest($1::text[], $2::text[]) with ordinality as t(a, b, n)
         order by n`,
        [paires.map((p) => p[0]), paires.map((p) => p[1])],
      )
      return rows.map((r) => r.i)
    })
    expect(obtenus).toEqual(attendus)
  })

  it('rend le même facteur que le JavaScript pour les cinq formes', async () => {
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select arena_form_factor(i) as f from generate_series(0, 4) i order by i')
      return rows.map((r) => Number(r.f))
    })
    expect(obtenus).toEqual(FORMS.map((f) => f.factor))
  })
})

describe.skipIf(!disponible)('parité de la puissance', () => {
  const ESPECES = [1, 4, 6, 16, 19, 20, 83, 129, 130, 145, 150]

  it('rend la même puissance que le JavaScript, tous niveaux et toutes formes', async () => {
    const cas = ESPECES.flatMap((s) =>
      [1, 3, 7, LEVEL_MAX].flatMap((l) => [0, 2, 4].map((f) => [s, l, f])))
    const attendus = cas.map(([s, l, f]) => power({ species: s, level: l, form: FORMS[f] }))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_power(s, l, f) as p
         from unnest($1::int[], $2::int[], $3::int[]) with ordinality as t(s, l, f, n)
         order by n`,
        [cas.map((x) => x[0]), cas.map((x) => x[1]), cas.map((x) => x[2])],
      )
      return rows.map((r) => Number(r.p))
    })
    // Égalité stricte et non `toBeCloseTo` : les deux côtés calculent en IEEE 754 sur les
    // mêmes valeurs, dans le même ordre — une différence, fût-elle au dernier bit, veut dire
    // que le SQL ne fait pas la même chose que le JavaScript, et il faut le savoir.
    expect(obtenus).toEqual(attendus)
  })

  it('reprend les coefficients de rareté à l’identique', async () => {
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select t as tier, arena_tier_power(t) as p from unnest($1::text[]) t',
        [['c', 'u', 'r', 'l']])
      return Object.fromEntries(rows.map((r) => [r.tier, Number(r.p)]))
    })
    expect(obtenus).toEqual(TIER_POWER)
  })
})

describe.skipIf(!disponible)('parité de la probabilité de victoire', () => {
  it('rend la même probabilité, bornage compris', async () => {
    const paires = [[400, 400], [355, 614], [253, 725], [1, 10000], [10000, 1], [515, 614]]
    const attendus = paires.map(([a, b]) => winProbability(a, b))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_win_probability(a, b) as p
         from unnest($1::float8[], $2::float8[]) with ordinality as t(a, b, n)
         order by n`,
        [paires.map((p) => p[0]), paires.map((p) => p[1])],
      )
      return rows.map((r) => Number(r.p))
    })
    // Douze décimales et non l'égalité stricte, seul endroit du combat où la parité au bit
    // près est hors d'atteinte : `^` appelle le `pow()` de la glibc, correctement arrondi,
    // là où le `**` de V8 s'en écarte d'un ulp sur certaines entrées. L'écart relatif
    // plafonne à 4,3e-16 — il ne changerait un vainqueur que si le tirage tombait dans cette
    // fenêtre. Partout ailleurs dans ce fichier, la comparaison reste stricte.
    for (let i = 0; i < attendus.length; i++) expect(obtenus[i]).toBeCloseTo(attendus[i], 12)
  })

  // Les cinq duels de référence de la spec § 3 : ce sont eux qui fixent l'équilibre du mode.
  it('reproduit les probabilités de référence de la spec', async () => {
    const duels = [[19, 145], [4, 6], [16, 6], [83, 20], [6, 6]]
    const attendus = duels.map(([a, b]) =>
      winProbability(power({ species: a }), power({ species: b })))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_win_probability(arena_power(a, 1, 2), arena_power(b, 1, 2)) as p
         from unnest($1::int[], $2::int[]) with ordinality as t(a, b, n)
         order by n`,
        [duels.map((d) => d[0]), duels.map((d) => d[1])])
      return rows.map((r) => Number(r.p))
    })
    for (let i = 0; i < attendus.length; i++) expect(obtenus[i]).toBeCloseTo(attendus[i], 12)
  })
})

describe.skipIf(!disponible)('parité du gain de niveau', () => {
  it('rend le même gain que le JavaScript sur toute la plage des rapports', async () => {
    // Les paires encadrent chacun des quatre seuils par en dessous et par au-dessus : c'est
    // là et nulle part ailleurs que le portage peut se tromper de comparaison stricte ou de
    // sens du rapport. `[1000, 500]` doit rendre 0 — écraser un faible ne fait pas monter.
    const paires = [[1000, 500], [1000, 740], [1000, 750], [1000, 1000], [1000, 1090],
      [1000, 1100], [1000, 1490], [1000, 1500], [1000, 1990], [1000, 2000], [1000, 9000]]
    const attendus = paires.map(([m, t]) => levelGain(m, t))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_level_gain(m, t) as g
         from unnest($1::float8[], $2::float8[]) with ordinality as x(m, t, n)
         order by n`,
        [paires.map((p) => p[0]), paires.map((p) => p[1])])
      return rows.map((r) => r.g)
    })
    expect(obtenus).toEqual(attendus)
  })

  it('n’accorde rien au vainqueur qui écrase, quel que soit l’écart', async () => {
    // Le rapport est adversaire / soi. Inversé, ces trois cas rendraient 5 au lieu de 0 et le
    // farming des petits joueurs deviendrait la meilleure façon de monter.
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_level_gain(m, t) as g
         from unnest($1::float8[], $2::float8[]) with ordinality as x(m, t, n)
         order by n`,
        [[1000, 1000, 1000], [10, 100, 500]])
      return rows.map((r) => r.g)
    })
    expect(obtenus).toEqual([0, 0, 0])
  })
})

describe.skipIf(!disponible)('parité de la résolution d’un duel', () => {
  it('désigne le même vainqueur et les mêmes chiffres que le JavaScript', async () => {
    const jour = '2026-08-11'
    const cas = []
    for (let i = 0; i < 200; i++) {
      cas.push({
        seed: `duel-${i}`,
        left: { key: `github:g${i}`, species: [1, 4, 6, 16, 19, 145, 150][i % 7], level: (i % 10) + 1 },
        right: { key: `github:d${i}`, species: [20, 83, 129, 130, 6, 4, 1][i % 7], level: ((i * 3) % 10) + 1 },
      })
    }

    const attendus = cas.map(({ seed, left, right }) => resolveDuel({
      left: { ...left, form: formOf(left.key, jour) },
      right: { ...right, form: formOf(right.key, jour) },
      seed,
    }))

    const obtenus = await withDb(async (c) => {
      const rows = []
      for (const { seed, left, right } of cas) {
        const { rows: r } = await c.query(
          `select * from arena_resolve($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [left.key, left.species, left.level, jour,
           right.key, right.species, right.level, jour, seed])
        rows.push(r[0])
      }
      return rows
    })

    for (let i = 0; i < cas.length; i++) {
      expect(obtenus[i].winner).toBe(attendus[i].winner)
      expect(obtenus[i].gain).toBe(attendus[i].gain)
      expect(obtenus[i].level_after).toBe(attendus[i].levelAfter)
      // Les puissances, elles, se comparent au bit près : elles ne passent par aucun `pow()`.
      expect(Number(obtenus[i].left_power)).toBe(attendus[i].left.power)
      expect(Number(obtenus[i].right_power)).toBe(attendus[i].right.power)
      expect(Number(obtenus[i].probability)).toBeCloseTo(attendus[i].probability, 12)
      // Le tirage ne dépend que de `fnv1a` : égalité stricte, pas de tolérance à accorder.
      expect(Number(obtenus[i].roll)).toBe(attendus[i].roll)
    }
    // 200 appels séquentiels : au-delà du délai par défaut de 5 s dès que la machine est
    // chargée par les autres fichiers de test qui tournent en parallèle.
  }, 60_000)

  it('désigne le même vainqueur quel que soit l’ordre des deux camps', async () => {
    // L'anti-symétrie est la propriété qui permet au client de rejouer un duel que le serveur
    // a résolu en challenger / preneur : si l'échange des arguments changeait l'issue, le
    // joueur verrait un vainqueur que le serveur n'a pas écrit.
    const jour = '2026-08-11'
    const desaccords = await withDb(async (c) => {
      const ko = []
      for (let i = 0; i < 120; i++) {
        const g = { key: `github:sym-g${i}`, species: [1, 4, 6, 16, 19, 145, 150][i % 7], level: (i % 10) + 1 }
        const d = { key: `github:sym-d${i}`, species: [20, 83, 129, 130, 6, 4, 1][i % 7], level: ((i * 3) % 10) + 1 }
        const seed = `sym-${i}`
        const direct = (await c.query('select * from arena_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [g.key, g.species, g.level, jour, d.key, d.species, d.level, jour, seed])).rows[0]
        const inverse = (await c.query('select * from arena_resolve($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [d.key, d.species, d.level, jour, g.key, g.species, g.level, jour, seed])).rows[0]
        // Vu depuis l'appel inversé, « left » désigne l'autre camp : les deux issues se
        // correspondent si elles se lisent en miroir.
        const memeGagnant = direct.winner === (inverse.winner === 'left' ? 'right' : 'left')
        if (!memeGagnant || direct.gain !== inverse.gain) ko.push({ seed, direct: direct.winner, inverse: inverse.winner })
      }
      return ko
    })
    expect(desaccords).toEqual([])
    // 120 itérations × 2 appels séquentiels : le délai par défaut de 5 s ne suffit pas, et un
    // test qui expire ne dit rien de l'anti-symétrie qu'il est censé vérifier. Même délai que
    // le test en masse du même fichier, pour la même raison.
  }, 60_000)

  it('plafonne le niveau à dix même sur un exploit à cinq niveaux', async () => {
    const obtenu = await withDb(async (c) => {
      // Rattata niveau 9 contre Mewtwo : le rapport dépasse 2, l'exploit vaut 5 niveaux, et
      // le résultat doit rester à `LEVEL_MAX`.
      const { rows } = await c.query(
        `select public.arena_level_gain(public.arena_power(19, 9, 2), public.arena_power(150, 1, 2)) as gain,
                least($1::int, 9 + public.arena_level_gain(public.arena_power(19, 9, 2),
                                                           public.arena_power(150, 1, 2))) as apres`,
        [LEVEL_MAX])
      return rows[0]
    })
    expect(obtenu.gain).toBe(5)
    expect(obtenu.apres).toBe(LEVEL_MAX)
  })
})

describe.skipIf(!disponible)('parité en masse', () => {
  // Deux mille duels dérivés d'un seed : toutes les espèces, tous les niveaux, toutes les
  // formes, et des jours différents. Deux cents duels choisis à la main ne couvrent que ce à
  // quoi on a pensé ; celui-ci attrape le reste. Un désaccord sur un seul d'entre eux
  // signifierait qu'un joueur peut voir un résultat que le serveur n'a pas écrit.
  it('ne diverge sur aucun de deux mille duels', async () => {
    const especes = Object.keys(DEX).map(Number)
    const cas = Array.from({ length: 2000 }, (_, i) => ({
      seed: `masse-${i}`,
      jour: ['2026-08-11', '2026-11-30', '2027-02-28'][i % 3],
      left: { key: `github:m${i}`, species: especes[i % especes.length], level: (i % 10) + 1 },
      right: { key: `github:n${i}`, species: especes[(i * 7) % especes.length], level: ((i * 5) % 10) + 1 },
    }))

    const desaccords = await withDb(async (c) => {
      const ko = []
      for (const { seed, jour, left, right } of cas) {
        const attendu = resolveDuel({
          left: { ...left, form: formOf(left.key, jour) },
          right: { ...right, form: formOf(right.key, jour) },
          seed,
        })
        const { rows } = await c.query(
          `select * from arena_resolve($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [left.key, left.species, left.level, jour,
           right.key, right.species, right.level, jour, seed])
        const sql = rows[0]
        if (sql.winner !== attendu.winner || sql.gain !== attendu.gain
            || sql.level_after !== attendu.levelAfter) {
          // On rapporte l'écart tirage / probabilité avec le désaccord : c'est lui qui dit si
          // le cas tombe dans la fenêtre où `pow()` glibc et `pow()` fdlibm se séparent (de
          // l'ordre de 1e-16, limite du format) ou s'il s'agit d'un vrai défaut de portage.
          ko.push({
            seed,
            jour,
            winner: [attendu.winner, sql.winner],
            gain: [attendu.gain, sql.gain],
            levelAfter: [attendu.levelAfter, sql.level_after],
            ecart: Math.abs(attendu.roll - attendu.probability),
          })
        }
      }
      return ko
    })
    // Aucun assouplissement : ces cas sont exactement ceux qui feraient diverger le serveur et
    // le client en production, et le JavaScript fait foi.
    expect(desaccords).toEqual([])
  }, 60_000)
})
