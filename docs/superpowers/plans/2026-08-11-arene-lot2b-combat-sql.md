# Mode arène — Lot 2b : le combat en SQL, à l'identique du JavaScript

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter le moteur de combat en SQL, et prouver qu'il rend exactement les mêmes duels que le moteur JavaScript déjà écrit et testé — parce que le serveur résoudra les duels et que le client doit pouvoir les rejouer.

**Architecture:** Des fonctions `immutable` dans la migration d'arène existante, et une suite de tests qui fait tourner les deux moteurs côte à côte sur les mêmes entrées. Rien n'écrit encore en base : la RPC de résolution, ses plafonds et ses tests de concurrence sont le lot 2c. Aucune interface.

**Tech Stack:** PostgreSQL 17 (CLI Supabase, Docker), `pg` en dépendance de développement, Vitest 3.

## Global Constraints

- **Spec de référence :** `docs/superpowers/specs/2026-08-10-mode-arene-design.md`, section 3. En cas de divergence, la spec fait foi.
- **Le JavaScript fait foi sur les valeurs.** `shared/battle.js` est écrit, testé, et ses probabilités de référence sont vérifiées. Si un test de parité échoue, c'est le SQL qui cède — jamais la valeur attendue, jamais le JavaScript.
- **`double precision`, jamais `numeric`.** JavaScript calcule en IEEE 754 double ; `numeric` est un décimal exact et donnerait des résultats différents au dernier chiffre. Sur une comparaison `tirage < probabilité`, un écart au dernier bit change le vainqueur d'un duel.
- **Langue :** commentaires SQL, noms de tests et messages de commit en **français**. Identifiants en **anglais**.
- **Commentaires :** on commente le *pourquoi*, jamais le *quoi*.
- **Une seule migration**, `supabase/migrations/20260811000000_arena.sql`, où tout s'ajoute avant le `commit;` final. Elle reste entièrement transactionnelle.
- **Le rôle `authenticated` n'a aucun privilège par défaut sur les fonctions de ce schéma** : toute fonction destinée à être appelée depuis le front a besoin d'un `grant execute` explicite.
- **Le piège récurrent du lot 2a** : `set local role` ne vaut que dans une transaction. Hors transaction, c'est un no-op silencieux et la requête tourne en propriétaire de table, RLS contournée.
- **Tests :** `npm test`. Les tests de base sautent proprement si la pile locale est éteinte.
- **Ne pas pousser** sans demande explicite ; préfixer tout `git commit` par `GS_REVIEW_BYPASS=1`.

## Ce que ce lot ne fait pas

Pas de RPC, pas d'écriture en base, pas de plafonds de crédits, pas de concurrence, pas d'interface. Le lot 2c les apporte, sur ces fonctions.

---

### Task 1: Le pseudonyme devient écrivable, et unique pour de bon

Reste du lot 2a : la colonne existe et trois vues s'en servent, mais aucune policy ne permet de la renseigner. Et sa contrainte d'unicité est sensible à la casse — `Leo`, `leo` et `leo ` cohabitent, ce qui est exactement le vecteur d'usurpation qu'elle prétend fermer dans un mode où l'on choisit son adversaire sur la foi d'un nom.

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-pseudo.test.js`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `scripts/arena-pseudo.test.js` :

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const LEO = 'e1e1e1e1-0000-0000-0000-000000000001'
const AUTRE = 'e2e2e2e2-0000-0000-0000-000000000002'

const creer = (c, id, email) => c.query(`
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          $2, '', now(), now(), now())
  on conflict (id) do nothing
`, [id, email])

const commeUtilisateur = (uid, fn) => withDb(async (c) => {
  await c.query('begin')
  try {
    await c.query('set local role authenticated')
    await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

describe.skipIf(!disponible)('pseudonyme', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      await creer(c, LEO, 'leo@test.local')
      await creer(c, AUTRE, 'autre@test.local')
      await c.query('update public.profiles set pseudo = null where user_id in ($1, $2)', [LEO, AUTRE])
    })
  })

  it('laisse un joueur choisir le sien', async () => {
    const rows = await commeUtilisateur(LEO, async (c) => {
      await c.query(`update public.profiles set pseudo = 'Leo' where user_id = '${LEO}'`)
      const r = await c.query(`select pseudo from public.profiles where user_id = '${LEO}'`)
      return r.rows
    })
    expect(rows).toEqual([{ pseudo: 'Leo' }])
  })

  it('l’empêche de renommer quelqu’un d’autre', async () => {
    const touchees = await commeUtilisateur(LEO, async (c) => {
      const r = await c.query(`update public.profiles set pseudo = 'vole' where user_id = '${AUTRE}'`)
      return r.rowCount
    })
    expect(touchees).toBe(0)
  })

  // Le pseudo sert à choisir qui l'on affronte : `Leo` et `leo` côte à côte dans la liste des
  // défis, c'est l'usurpation que l'unicité prétend fermer.
  it('refuse un pseudonyme qui ne diffère que par la casse ou les espaces', async () => {
    await withDb(async (c) => {
      await c.query('begin')
      await c.query(`update public.profiles set pseudo = 'Leo' where user_id = '${LEO}'`)
      await expect(
        c.query(`update public.profiles set pseudo = ' leo ' where user_id = '${AUTRE}'`),
      ).rejects.toThrow()
      await c.query('rollback')
    })
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run scripts/arena-pseudo.test.js`
Expected: FAIL — l'`update` ne passe pas, faute de policy

- [ ] **Step 3: Écrire la migration**

Dans `supabase/migrations/20260811000000_arena.sql`, à la suite de la colonne `pseudo` :

```sql
-- Un joueur choisit son pseudonyme, et celui-là seulement. `with check` autant que `using` :
-- sans lui, on pourrait passer la ligne d'autrui sous son propre identifiant.
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant update (pseudo) on public.profiles to authenticated;

-- L'unicité posée à la création de la colonne est sensible à la casse et aux espaces, donc
-- inopérante contre ce qu'elle vise : dans une arène où l'on choisit son adversaire sur la foi
-- d'un nom, `Leo` et `leo` côte à côte suffisent à se faire passer pour l'autre.
alter table public.profiles drop constraint profiles_pseudo_key;
create unique index profiles_pseudo_unique on public.profiles (lower(trim(pseudo)));
```

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-pseudo.test.js`
Expected: PASS

**Si le nom de la contrainte `profiles_pseudo_key` ne correspond pas**, le relever avant de la supprimer plutôt que de deviner :
`select conname from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'u';`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-pseudo.test.js
git commit -m "feat(db): pseudonyme écrivable par son porteur, unique à la casse près"
```

---

### Task 2: La forme du jour, côté serveur

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-combat-parity.test.js`

**Interfaces:**
- Produces: `arena_form_index(entry_key text, day text) returns int` — l'indice dans `FORMS`, de 0 à 4.
- Produces: `arena_form_factor(idx int) returns double precision` — 0.90 à 1.10.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `scripts/arena-combat-parity.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { FORMS, formOf } from '../shared/battle.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const CLES = [
  'github:a3f8c21e9b', 'github:sha0', 'github:sha1', 'github:sha2',
  'arene:1', 'arene:2', 'boutique:7', 'github:0123456789abcdef',
]
const JOURS = ['2026-08-11', '2026-08-12', '2026-09-01', '2027-01-01']

describe.skipIf(!disponible)('parité de la forme du jour', () => {
  it('rend le même indice de forme que le JavaScript', async () => {
    const paires = CLES.flatMap((k) => JOURS.map((j) => [k, j]))
    const attendus = paires.map(([k, j]) => FORMS.indexOf(formOf(k, j)))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_form_index(p[1], p[2]) as i
         from unnest($1::text[], $2::text[]) as p(a, b), lateral (select array[p.a, p.b] as p) x`,
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
```

**Note pour l'implémenteur** : la requête `unnest` ci-dessus est alambiquée. Si une forme plus simple donne le même résultat — par exemple deux tableaux parallèles et `arena_form_index(a, b)` directement —, préfère-la et signale le changement.

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx vitest run scripts/arena-combat-parity.test.js`
Expected: FAIL — `function arena_form_index(text, text) does not exist`

- [ ] **Step 3: Écrire les fonctions**

```sql
-- La forme du jour se calcule des deux côtés et ne se stocke jamais : le client l'affiche
-- avant qu'on engage son Pokémon, le serveur la recalcule pour résoudre le duel. La chaîne
-- hachée est un CONTRAT — `${key}:forme:${day}` — à répliquer caractère pour caractère avec
-- `formOf` de `shared/battle.js`.
create or replace function public.arena_form_index(entry_key text, day text)
returns int language sql immutable strict as $$
  select (public.fnv1a(entry_key || ':forme:' || day) % 5) :: int
$$;

-- Cinq états, du plus faible au plus fort. `double precision` et non `numeric` : le moteur
-- JavaScript calcule en IEEE 754, et un écart au dernier bit suffirait à changer le vainqueur
-- d'un duel serré.
create or replace function public.arena_form_factor(idx int)
returns double precision language sql immutable strict as $$
  select (array[0.90, 0.95, 1.00, 1.05, 1.10] :: double precision[])[idx + 1]
$$;
```

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-combat-parity.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-combat-parity.test.js
git commit -m "feat(db): forme du jour en SQL, à l'identique du JavaScript"
```

---

### Task 3: La puissance et la probabilité de victoire

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-combat-parity.test.js`

**Interfaces:**
- Produces: `arena_tier_power(tier text) returns double precision`
- Produces: `arena_level_factor(level int) returns double precision`
- Produces: `arena_power(species int, level int, form_idx int) returns double precision`
- Produces: `arena_win_probability(a double precision, b double precision) returns double precision`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `scripts/arena-combat-parity.test.js` :

```js
import { TIER_POWER, LEVEL_MAX, NORMAL_FORM, power, winProbability } from '../shared/battle.js'
import { DEX } from '../shared/species.js'

describe.skipIf(!disponible)('parité de la puissance', () => {
  const ESPECES = [1, 4, 6, 16, 19, 20, 83, 129, 130, 145, 150]

  it('rend la même puissance que le JavaScript, tous niveaux et toutes formes', async () => {
    const cas = ESPECES.flatMap((s) =>
      [1, 3, 7, LEVEL_MAX].flatMap((l) => [0, 2, 4].map((f) => [s, l, f])))
    const attendus = cas.map(([s, l, f]) =>
      power({ species: s, level: l, form: FORMS[f] }))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_power(s, l, f) as p from unnest($1::int[], $2::int[], $3::int[]) as t(s, l, f)`,
        [cas.map((x) => x[0]), cas.map((x) => x[1]), cas.map((x) => x[2])],
      )
      return rows.map((r) => Number(r.p))
    })
    for (let i = 0; i < attendus.length; i++) expect(obtenus[i]).toBeCloseTo(attendus[i], 9)
  })

  it('reprend les coefficients de rareté à l’identique', async () => {
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select t as tier, arena_tier_power(t) as p from unnest($1::text[]) t`,
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
         from unnest($1::float8[], $2::float8[]) as t(a, b)`,
        [paires.map((p) => p[0]), paires.map((p) => p[1])],
      )
      return rows.map((r) => Number(r.p))
    })
    for (let i = 0; i < attendus.length; i++) expect(obtenus[i]).toBeCloseTo(attendus[i], 12)
  })

  // Les cinq duels de référence de la spec § 3 : ce sont eux qui fixent l'équilibre du mode.
  it('reproduit les probabilités de référence de la spec', async () => {
    const duels = [[19, 145], [4, 6], [16, 6], [83, 20], [6, 6]]
    const attendus = duels.map(([a, b]) =>
      winProbability(power({ species: a }), power({ species: b })))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(`
        select arena_win_probability(arena_power(a, 1, 2), arena_power(b, 1, 2)) as p
        from unnest($1::int[], $2::int[]) as t(a, b)`,
        [duels.map((d) => d[0]), duels.map((d) => d[1])])
      return rows.map((r) => Number(r.p))
    })
    for (let i = 0; i < attendus.length; i++) expect(obtenus[i]).toBeCloseTo(attendus[i], 12)
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx vitest run scripts/arena-combat-parity.test.js`
Expected: FAIL — `function arena_power(...) does not exist`

- [ ] **Step 3: Écrire les fonctions**

```sql
-- Coefficients de rareté. Légers sur les trois premiers paliers, parce que les stats portent
-- déjà l'écart ; marqué sur le légendaire, dont le pool (580-680) chevauche le haut du pool
-- rare (jusqu'à 600) — les stats seules ne les séparent pas.
create or replace function public.arena_tier_power(tier text)
returns double precision language sql immutable strict as $$
  select case tier when 'c' then 1.00 when 'u' then 1.06
                   when 'r' then 1.15 when 'l' then 1.45 end :: double precision
$$;

create or replace function public.arena_level_factor(level int)
returns double precision language sql immutable strict as $$
  select (1 + 0.05 * (level - 1)) :: double precision
$$;

create or replace function public.arena_power(species int, level int, form_idx int)
returns double precision language sql stable strict as $$
  select s.stats * public.arena_tier_power(d.tier)
       * public.arena_level_factor(level) * public.arena_form_factor(form_idx)
  from public.species_stats s, public.arena_species_tier(species) d(tier)
  where s.species = arena_power.species
$$;

-- Élévation au cube et non rapport direct : un rapport direct laisserait un Rattata battre
-- Électhor près d'une fois sur trois. Le bornage à [0,10 ; 0,90] garantit qu'aucun duel n'est
-- gagné d'avance et que tout légendaire descendu régulièrement finit par tomber.
create or replace function public.arena_win_probability(a double precision, b double precision)
returns double precision language sql immutable strict as $$
  select least(0.90 :: double precision,
               greatest(0.10 :: double precision, a ^ 3 / (a ^ 3 + b ^ 3)))
$$;
```

**Le palier d'une espèce n'existe pas encore en base** : `species_stats` ne porte que le total des stats. Deux options, à trancher par l'implémenteur et à signaler dans le rapport :

- ajouter une colonne `tier text` à `species_stats`, remplie par le même générateur — la plus simple, et cohérente avec le fait que le palier est une propriété de la planche ;
- créer une table `species` séparée.

**Préférer la première**, et adapter `arena_power` en conséquence (la référence à `arena_species_tier` ci-dessus est un repère, pas une fonction à créer). Le générateur `scripts/gen-species-info.mjs` écrit déjà `supabase/seed.sql` : il doit y écrire le palier avec le total, en le lisant depuis `DEX` de `shared/species.js`.

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run gen:species-info` (cinq à dix minutes), puis `npm run db:reset`, puis `npx vitest run scripts/arena-combat-parity.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql supabase/seed.sql scripts/gen-species-info.mjs scripts/arena-combat-parity.test.js
git commit -m "feat(db): puissance et probabilité de victoire en SQL, palier des espèces en base"
```

---

### Task 4: Le gain de niveau et la résolution complète

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-combat-parity.test.js`

**Interfaces:**
- Produces: `arena_level_gain(mine double precision, theirs double precision) returns int`
- Produces: `arena_resolve(left_key text, left_species int, left_level int, right_key text, right_species int, right_level int, day text, seed text)` — rend une ligne `(winner text, probability double precision, roll double precision, left_power double precision, right_power double precision, gain int, level_after int)`, où `winner` vaut `'left'` ou `'right'`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `scripts/arena-combat-parity.test.js` :

```js
import { levelGain, resolveDuel } from '../shared/battle.js'

describe.skipIf(!disponible)('parité du gain de niveau', () => {
  it('rend le même gain que le JavaScript sur toute la plage des rapports', async () => {
    const paires = [[1000, 500], [1000, 740], [1000, 750], [1000, 1000], [1000, 1090],
                    [1000, 1100], [1000, 1490], [1000, 1500], [1000, 1990], [1000, 2000], [1000, 9000]]
    const attendus = paires.map(([m, t]) => levelGain(m, t))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        `select arena_level_gain(m, t) as g from unnest($1::float8[], $2::float8[]) as x(m, t)`,
        [paires.map((p) => p[0]), paires.map((p) => p[1])])
      return rows.map((r) => r.g)
    })
    expect(obtenus).toEqual(attendus)
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
      left: { ...left, form: FORMS[FORMS.indexOf(formOf(left.key, jour))] },
      right: { ...right, form: FORMS[FORMS.indexOf(formOf(right.key, jour))] },
      seed,
    }))

    const obtenus = await withDb(async (c) => {
      const rows = []
      for (const { seed, left, right } of cas) {
        const { rows: r } = await c.query(
          `select * from arena_resolve($1, $2, $3, $4, $5, $6, $7, $8)`,
          [left.key, left.species, left.level, right.key, right.species, right.level, jour, seed])
        rows.push(r[0])
      }
      return rows
    })

    for (let i = 0; i < cas.length; i++) {
      expect(obtenus[i].winner).toBe(attendus[i].winner)
      expect(obtenus[i].gain).toBe(attendus[i].gain)
      expect(obtenus[i].level_after).toBe(attendus[i].levelAfter)
      expect(Number(obtenus[i].probability)).toBeCloseTo(attendus[i].probability, 12)
      expect(Number(obtenus[i].roll)).toBeCloseTo(attendus[i].roll, 12)
    }
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx vitest run scripts/arena-combat-parity.test.js`
Expected: FAIL — `function arena_resolve(...) does not exist`

- [ ] **Step 3: Écrire les fonctions**

Reproduire fidèlement `levelGain` et `resolveDuel` de `shared/battle.js`, y compris :

- le rapport **adversaire / soi** dans le gain de niveau, et non l'inverse — inverser récompenserait l'acharnement sur les faibles ;
- l'**ordre canonique** de `resolveDuel`, qui trie les deux camps sur `key:species:level:forme` et tranche du côté canoniquement premier, pour que l'issue ne dépende pas de qui a été passé en premier. Le serveur résout un duel challenger/preneur, le client le rejoue dans l'ordre qu'il veut, et les deux doivent tomber sur le même vainqueur ;
- le tirage `fnv1a(seed || ':issue') / 2^32` ;
- le plafonnement du niveau à 10.

**Lire `shared/battle.js` avant d'écrire ce SQL** : chacune de ces quatre règles y est commentée avec sa raison.

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-combat-parity.test.js`
Expected: PASS — 200 duels identiques des deux côtés

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-combat-parity.test.js
git commit -m "feat(db): résolution d'un duel en SQL, identique au moteur JavaScript"
```

---

### Task 5: La preuve en masse

Deux cents duels choisis à la main prouvent moins qu'ils n'en ont l'air : ils couvrent ce à quoi on a pensé. Cette tâche fait tourner les deux moteurs sur un large échantillon dérivé d'un seed, pour attraper ce à quoi personne n'a pensé.

**Files:**
- Test: `scripts/arena-combat-parity.test.js`

- [ ] **Step 1: Écrire le test**

Ajouter à `scripts/arena-combat-parity.test.js` :

```js
describe.skipIf(!disponible)('parité en masse', () => {
  // Deux mille duels dérivés d'un seed : toutes les espèces, tous les niveaux, toutes les
  // formes, et des jours différents. Un désaccord sur un seul d'entre eux signifierait qu'un
  // joueur peut voir un résultat que le serveur n'a pas écrit.
  it('ne diverge sur aucun de deux mille duels', async () => {
    const especes = Object.keys(DEX).map(Number)
    const cas = Array.from({ length: 2000 }, (_, i) => ({
      seed: `masse-${i}`,
      jour: ['2026-08-11', '2026-11-30', '2027-02-28'][i % 3],
      left: { key: `github:m${i}`, species: especes[i % especes.length], level: (i % 10) + 1 },
      right: { key: `github:n${i}`, species: especes[(i * 7) % especes.length], level: ((i * 5) % 10) + 1 },
    }))

    const desaccords = []
    await withDb(async (c) => {
      for (const { seed, jour, left, right } of cas) {
        const attendu = resolveDuel({
          left: { ...left, form: formOf(left.key, jour) },
          right: { ...right, form: formOf(right.key, jour) },
          seed,
        })
        const { rows } = await c.query(
          `select * from arena_resolve($1, $2, $3, $4, $5, $6, $7, $8)`,
          [left.key, left.species, left.level, right.key, right.species, right.level, jour, seed])
        if (rows[0].winner !== attendu.winner || rows[0].gain !== attendu.gain) {
          desaccords.push({ seed, sql: rows[0].winner, js: attendu.winner })
        }
      }
    })
    expect(desaccords).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer**

Run: `npx vitest run scripts/arena-combat-parity.test.js`
Expected: PASS

**Si des désaccords apparaissent**, les rapporter tels quels avec leurs seeds plutôt que d'assouplir le test : ce sont les cas exacts qui feront diverger le serveur et le client en production. Le JavaScript fait foi.

- [ ] **Step 3: Lancer toute la suite**

Run: `npm test`
Expected: PASS — les 445 tests précédents ne bougent pas

- [ ] **Step 4: Commit**

```bash
git add scripts/arena-combat-parity.test.js
git commit -m "test: parité JavaScript/SQL vérifiée sur deux mille duels"
```

---

## À la fin du lot

Rendre un compte rendu portant : le nombre de duels comparés et leur résultat, la décision prise sur le stockage du palier des espèces, et tout écart à `shared/battle.js` — dont le JavaScript fait foi.

Le lot 2c prendra la suite : la RPC atomique d'engagement et d'acceptation, les plafonds de crédits, et les tests de concurrence sur deux acceptations simultanées du même défi.
