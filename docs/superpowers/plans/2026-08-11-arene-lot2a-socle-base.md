# Mode arène — Lot 2a : socle base de données (tables, RLS, vues, parité `fnv1a`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser en base tout ce que l'arène doit stocker — tables, policies, vues — et la fonction de hachage que le serveur devra partager avec le client, en éprouvant chaque règle contre une vraie base Postgres locale plutôt que contre une lecture attentive.

**Architecture:** Une migration SQL unique, appliquée par `supabase db reset` sur une base locale jetable, et une suite de tests Vitest qui s'y connecte directement. Aucune RPC de résolution ici — elle fait l'objet du lot 2b, et elle a besoin de ce socle pour exister. Aucune interface. Le front n'est pas touché.

**Tech Stack:** PostgreSQL 17 via la CLI Supabase (Docker), `pg` en dépendance de développement, Vitest 3.

## Global Constraints

- **Spec de référence :** `docs/superpowers/specs/2026-08-10-mode-arene-design.md`, sections 5 et 6. En cas de divergence, la spec fait foi.
- **Langue :** commentaires SQL, noms de tests et messages de commit en **français**. Identifiants (tables, colonnes, fonctions, variables) en **anglais** — la règle du dépôt.
- **Commentaires :** on commente le *pourquoi*, jamais le *quoi*.
- **La production ne se touche pas.** Aucun `supabase link`, aucun `supabase db push`. `scripts/check-local-db.mjs` fait échouer les commandes `db:*` si un lien apparaît. Le déploiement réel se fera en collant le SQL dans l'éditeur du dashboard, plus tard, à la main.
- **Une seule migration pour tout le lot**, `supabase/migrations/20260811000000_arena.sql`, rejouable de bout en bout par `npm run db:reset`. Elle doit être **idempotente à l'échec** : tout dans une transaction, comme la migration de juillet.
- **Rien de ce qui engage autrui n'est écrit par le joueur.** Aucune policy `insert`, `update` ou `delete` sur les tables d'arène : elles n'auront qu'un seul écrivain, la fonction `security definer` du lot 2b. Une policy d'écriture ici serait une faille, pas une facilité.
- **Tests :** `npm test`. Les tests de base sautent proprement si la pile locale est éteinte, pour qu'un `npm test` sans Docker reste vert.
- **Commits :** un par tâche, message en français, préfixe `feat:` / `test:` / `chore:`.
- **Ne pas pousser** sans demande explicite. Si un `push` est demandé, préfixer par `GS_REVIEW_BYPASS=1`.

## Ce que ce lot ne fait pas

Pas de RPC de résolution de duel, pas de calcul de combat en SQL, pas de résolution des défis périmés, pas d'interface. Le lot 2b les apporte, sur ce socle.

---

### Task 1: Se connecter à la base locale depuis les tests

Sans harnais de connexion, aucune des tâches suivantes n'est vérifiable. Celle-ci ne livre qu'un outil, mais c'est lui qui rend tout le reste éprouvable.

**Files:**
- Create: `scripts/db-test-helper.mjs`
- Test: `scripts/db-test-helper.test.js`
- Modify: `package.json` (dépendance `pg`)

**Interfaces:**
- Produces: `withDb(fn)` — ouvre une connexion sur la base locale, exécute `fn(client)`, ferme quoi qu'il arrive.
- Produces: `dbAvailable()` — rend `true` si la pile locale répond, `false` sinon. Sert à sauter les tests plutôt qu'à les faire échouer.
- Produces: `LOCAL_DB_URL` — `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, l'URL fixe de la pile locale.

- [ ] **Step 1: Installer la dépendance**

Run: `npm install --save-dev pg`

- [ ] **Step 2: Écrire le test qui échoue**

Créer `scripts/db-test-helper.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable, LOCAL_DB_URL } from './db-test-helper.mjs'

const disponible = await dbAvailable()

describe.skipIf(!disponible)('connexion à la base locale', () => {
  it('vise bien la pile locale et jamais autre chose', () => {
    expect(LOCAL_DB_URL).toContain('127.0.0.1:54322')
  })

  it('exécute une requête et rend son résultat', async () => {
    const rows = await withDb((c) => c.query('select 1 as un').then((r) => r.rows))
    expect(rows).toEqual([{ un: 1 }])
  })

  it('ferme la connexion même quand la requête échoue', async () => {
    await expect(withDb((c) => c.query('select from nulle_part'))).rejects.toThrow()
    const rows = await withDb((c) => c.query('select 2 as deux').then((r) => r.rows))
    expect(rows).toEqual([{ deux: 2 }])
  })
})

describe.skipIf(disponible)('pile locale éteinte', () => {
  it('le signale au lieu de faire échouer la suite', () => {
    expect(disponible).toBe(false)
  })
})
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/db-test-helper.test.js`
Expected: FAIL — `Failed to resolve import "./db-test-helper.mjs"`

- [ ] **Step 4: Écrire l'implémentation minimale**

Créer `scripts/db-test-helper.mjs` :

```js
import pg from 'pg'

/**
 * L'URL de la pile locale, en dur et non configurable — c'est un garde-fou, pas une limite.
 * La base en service porte les collections réelles de l'équipe : aucun test ne doit pouvoir
 * la viser, fût-ce par une variable d'environnement mal placée.
 */
export const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function withDb(fn) {
  const client = new pg.Client({ connectionString: LOCAL_DB_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * Les tests de base sautent quand la pile est éteinte plutôt que d'échouer : `npm test` doit
 * rester vert sur une machine sans Docker, sinon personne ne le lance plus.
 */
export async function dbAvailable() {
  try {
    await withDb((c) => c.query('select 1'))
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 5: Lancer le test avec la pile allumée**

Run: `npm run db:start` puis `npx vitest run scripts/db-test-helper.test.js`
Expected: PASS, les trois tests de connexion exécutés

- [ ] **Step 6: Vérifier le saut propre**

Run: `npm run db:stop` puis `npx vitest run scripts/db-test-helper.test.js`
Expected: PASS, les trois premiers sautés et le dernier exécuté

Rallumer ensuite : `npm run db:start`

- [ ] **Step 7: Commit**

```bash
git add scripts/db-test-helper.mjs scripts/db-test-helper.test.js package.json package-lock.json
git commit -m "test: harnais de connexion à la base Postgres locale"
```

---

### Task 2: `fnv1a` en SQL, et sa parité avec le JavaScript

La spec (§ 6) prévient que la forme du jour est **le seul endroit où de la logique vivra en deux exemplaires**, JS et SQL : le client l'affiche avant d'engager, le serveur la recalcule pour résoudre. Les deux doivent tomber sur le même octet, sans quoi un joueur verrait une forme et en subirait une autre.

**Files:**
- Create: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/fnv1a-parity.test.js`

**Interfaces:**
- Produces: `public.fnv1a(input text) returns bigint` — immutable, rend un entier non signé sur 32 bits, identique à `fnv1a` de `shared/draw.js`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `scripts/fnv1a-parity.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { fnv1a } from '../shared/draw.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

/**
 * Les entrées réelles du jeu : clés d'exemplaire, seeds de tirage, seeds de forme du jour.
 * Toutes sont en ASCII par construction — un identifiant de source, un sha, une date.
 */
const ENTREES = [
  '',
  'a',
  'github:a3f8c21e9b',
  'github:a3f8c21e9b:tier',
  'github:a3f8c21e9b:pick',
  'github:a3f8c21e9b:shiny',
  'github:a3f8c21e9b:forme:2026-08-11',
  'arene:1234:issue',
  'boutique:42',
  '0123456789abcdef'.repeat(8),
]

describe.skipIf(!disponible)('parité fnv1a entre JavaScript et SQL', () => {
  it('rend la même valeur sur les entrées réelles du jeu', async () => {
    const attendus = ENTREES.map((e) => String(fnv1a(e)))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select fnv1a(e) :: text as h from unnest($1 :: text[]) as e', [ENTREES],
      )
      return rows.map((r) => r.h)
    })
    expect(obtenus).toEqual(attendus)
  })

  // Le hachage sert de seed au tirage : une collision de bas de mot suffirait à effondrer la
  // distribution, comme c'est déjà arrivé une fois dans ce projet (cf. NOTES.md).
  it('reste identique sur mille clés consécutives', async () => {
    const cles = Array.from({ length: 1000 }, (_, i) => `github:sha${i}`)
    const attendus = cles.map((e) => String(fnv1a(e)))
    const obtenus = await withDb(async (c) => {
      const { rows } = await c.query(
        'select fnv1a(e) :: text as h from unnest($1 :: text[]) as e', [cles],
      )
      return rows.map((r) => r.h)
    })
    expect(obtenus).toEqual(attendus)
  })

  it('reste dans les bornes d’un entier non signé sur 32 bits', async () => {
    const { max } = await withDb(async (c) => {
      const { rows } = await c.query(
        "select max(fnv1a('x' || g)) :: text as max from generate_series(1, 500) g",
      )
      return rows[0]
    })
    expect(Number(max)).toBeLessThan(2 ** 32)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/fnv1a-parity.test.js`
Expected: FAIL — `function fnv1a(text) does not exist`

- [ ] **Step 3: Écrire la migration**

Créer `supabase/migrations/20260811000000_arena.sql` :

```sql
-- Socle base de données du mode arène : la fonction de hachage partagée, les tables, leurs
-- policies et les vues qui exposent ce qu'un adversaire a le droit de voir.
--
-- À coller dans l'éditeur SQL du dashboard pour la mise en service, comme la bascule de
-- juillet. Tout est dans une transaction : en cas d'échec en cours de route, rien n'est
-- appliqué.

begin;

-- fnv1a — le SEUL endroit du projet où une logique existe en deux exemplaires, ici et dans
-- `shared/draw.js`. Le client affiche la forme du jour d'un Pokémon avant qu'on l'engage, le
-- serveur la recalcule pour résoudre le duel : les deux doivent tomber sur le même octet.
-- `scripts/fnv1a-parity.test.js` le vérifie sur les entrées réelles du jeu.
--
-- Limite assumée : `ascii()` rend le point de code Unicode là où `charCodeAt` rend une unité
-- UTF-16. Les deux coïncident sous U+10000, ce qui couvre tout ce que le jeu hache — des
-- identifiants de source, des sha, des dates. Un emoji dans une clé d'exemplaire les ferait
-- diverger.
create or replace function public.fnv1a(input text) returns bigint
language plpgsql immutable strict as $$
declare
  h bigint := 2166136261;   -- 0x811c9dc5
  i int;
begin
  for i in 1 .. length(input) loop
    h := h # ascii(substr(input, i, 1)) :: bigint;
    h := (h * 16777619) & 4294967295;
  end loop;
  return h;
end;
$$;

commit;
```

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/fnv1a-parity.test.js`
Expected: PASS

Si la parité échoue, **ne modifie pas les valeurs attendues** : c'est l'implémentation SQL qui diverge, et le JavaScript fait foi puisqu'il est déjà en service.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/fnv1a-parity.test.js
git commit -m "feat(db): fnv1a en SQL, avec son test de parité contre le JavaScript"
```

---

### Task 3: Les stats d'espèce en base

La fonction de combat du lot 2b a besoin des stats de base. Elles sont générées depuis PokéAPI dans `shared/species-stats.js` ; la base en veut sa copie, produite par le même script pour qu'elles ne puissent pas diverger.

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Modify: `scripts/gen-species-info.mjs`
- Create: `supabase/seed-species-stats.sql` (généré)
- Test: `scripts/species-stats-db.test.js`

**Interfaces:**
- Produces: table `public.species_stats (species int primary key, stats int not null)`, lisible par tout utilisateur authentifié, écrite par personne d'autre que la migration.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `scripts/species-stats-db.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { STATS } from '../shared/species-stats.js'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

describe.skipIf(!disponible)('species_stats en base', () => {
  it('couvre exactement les 151 espèces, aux mêmes valeurs que le module JavaScript', async () => {
    const rows = await withDb((c) =>
      c.query('select species, stats from public.species_stats order by species').then((r) => r.rows))
    expect(rows).toHaveLength(151)
    for (const { species, stats } of rows) expect(stats).toBe(STATS[species])
  })

  // Un joueur n'a aucune raison d'écrire dans cette table, et la RPC du lot 2b la lira sous
  // son propre droit : personne d'autre que la migration ne doit pouvoir y toucher.
  it('n’accepte aucune écriture d’un utilisateur authentifié', async () => {
    await withDb(async (c) => {
      await c.query("set local role authenticated")
      await expect(c.query('insert into public.species_stats values (999, 1)')).rejects.toThrow()
      await expect(c.query('update public.species_stats set stats = 1')).rejects.toThrow()
    })
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/species-stats-db.test.js`
Expected: FAIL — `relation "public.species_stats" does not exist`

- [ ] **Step 3: Générer le fichier de données**

Dans `scripts/gen-species-info.mjs`, ajouter une troisième destination sous les deux autres :

```js
const OUT_STATS_SQL = new URL('../supabase/seed-species-stats.sql', import.meta.url)
```

et, à la suite de l'écriture du module JavaScript :

```js
  // La même donnée en SQL, générée par le même passage : la fonction de combat du lot 2b la
  // lit en base, le moteur JavaScript la lit en module. Deux copies produites d'un seul
  // fichier source ne peuvent pas diverger sans qu'on le voie dans le même diff.
  const rowsSql = Object.entries(statsOut).map(([id, v]) => `  (${id}, ${v})`).join(',\n')
  await writeFile(OUT_STATS_SQL, `-- Généré par scripts/gen-species-info.mjs — ne pas éditer à la main.\ninsert into public.species_stats (species, stats) values\n${rowsSql}\non conflict (species) do update set stats = excluded.stats;\n`)
```

Run: `npm run gen:species-info`

**Attention** : ce script appelle PokéAPI environ 320 fois avec 60 ms d'attente, compter cinq à dix minutes. Vérifier ensuite que `shared/species-stats.js` et `shared/species-info.json` sont **inchangés** (`git diff --stat`) — seul le fichier SQL doit apparaître.

- [ ] **Step 4: Ajouter la table à la migration**

Dans `supabase/migrations/20260811000000_arena.sql`, avant le `commit;` :

```sql
-- Les stats de base, copie en base du module `shared/species-stats.js`. La fonction de combat
-- du lot 2b les lira ici ; le moteur JavaScript les lit là-bas. Le même passage du générateur
-- produit les deux, pour qu'elles ne puissent pas diverger en silence.
create table public.species_stats (
  species int primary key,
  stats int not null check (stats > 0)
);

alter table public.species_stats enable row level security;

-- Lisible par tout le monde, écrite par personne : la donnée n'a rien de secret, mais une
-- écriture y fausserait tous les duels à venir.
create policy "species_stats_select_all" on public.species_stats
  for select to authenticated using (true);
```

**Les données ne vont pas dans la migration.** `supabase db reset` applique automatiquement `supabase/seed.sql` après les migrations — c'est l'emplacement prévu pour ce genre de contenu, et il évite une méta-commande `\i` que l'éditeur SQL du dashboard ne saurait de toute façon pas exécuter. Le générateur écrit donc **directement dans `supabase/seed.sql`**, et non dans un fichier intermédiaire :

```js
const OUT_STATS_SQL = new URL('../supabase/seed.sql', import.meta.url)
```

Conséquence à documenter dans le README : la mise en service en production se fait en **deux collages** dans l'éditeur SQL — la migration d'abord, `supabase/seed.sql` ensuite.

- [ ] **Step 5: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/species-stats-db.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql supabase/seed-species-stats.sql scripts/gen-species-info.mjs scripts/species-stats-db.test.js
git commit -m "feat(db): table species_stats, générée par le même passage que le module JavaScript"
```

---

### Task 4: Les tables de l'arène, et leur silence en écriture

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-tables.test.js`

**Interfaces:**
- Produces: `arena_exemplars`, `arena_duels`, `arena_wallet`, `arena_season_points`, `arena_seasons`, toutes avec RLS et **aucune policy d'écriture**.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `scripts/arena-tables.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const TABLES = [
  'arena_exemplars', 'arena_duels', 'arena_wallet', 'arena_season_points', 'arena_seasons',
]

/**
 * Exécute `fn` sous le rôle `authenticated`, dans une transaction annulée à la fin.
 *
 * La transaction explicite n'est pas décorative : `set local` ne vaut que pour la durée d'une
 * transaction, et sans elle le rôle est silencieusement ignoré — les requêtes passent alors
 * en propriétaire de table, RLS contournée, et un test censé prouver qu'une écriture est
 * refusée réussirait l'écriture tout en passant au vert. Le `rollback` garantit en prime
 * qu'un test ne laisse jamais de ligne derrière lui.
 */
const commeAuthentifie = (fn) => withDb(async (c) => {
  await c.query('begin')
  try {
    await c.query('set local role authenticated')
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
})

describe.skipIf(!disponible)('tables de l’arène', () => {
  it('existent toutes, avec RLS activé', async () => {
    const rows = await withDb((c) => c.query(`
      select relname, relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and relname = any($1) order by relname
    `, [TABLES]).then((r) => r.rows))
    expect(rows.map((r) => r.relname)).toEqual([...TABLES].sort())
    for (const r of rows) expect(r.relrowsecurity).toBe(true)
  })

  // C'est LA garantie du mode : dès qu'un duel engage quelqu'un d'autre, le joueur ne doit
  // plus pouvoir écrire lui-même. `state` reste modifiable par son propriétaire — au pire on
  // y triche contre soi-même — mais un niveau ou un exemplaire détruit engagent un adversaire.
  it('n’exposent aucune policy d’écriture, à personne', async () => {
    const rows = await withDb((c) => c.query(`
      select tablename, policyname, cmd from pg_policies
      where schemaname = 'public' and tablename = any($1) and cmd <> 'SELECT'
    `, [TABLES]).then((r) => r.rows))
    expect(rows).toEqual([])
  })

  it('refusent l’écriture d’un utilisateur authentifié, table par table', async () => {
    for (const t of TABLES) {
      await expect(
        commeAuthentifie((c) => c.query(`insert into public.${t} default values`)),
      ).rejects.toThrow()
    }
  })

  it('interdisent un niveau hors des bornes du jeu', async () => {
    await withDb(async (c) => {
      await expect(c.query(`
        insert into public.arena_exemplars (user_id, entry_key, level)
        values ('00000000-0000-0000-0000-000000000000', 'github:x', 11)
      `)).rejects.toThrow()
    })
  })

  it('interdisent un portefeuille négatif', async () => {
    await withDb(async (c) => {
      await expect(c.query(`
        insert into public.arena_wallet (user_id, pokedollars)
        values ('00000000-0000-0000-0000-000000000000', -1)
      `)).rejects.toThrow()
    })
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/arena-tables.test.js`
Expected: FAIL — `relation "public.arena_exemplars" does not exist`

- [ ] **Step 3: Écrire les tables**

Dans la migration, avant `commit;` :

```sql
-- Niveau et destruction d'un exemplaire précis, repéré par sa clé `source:external_id`
-- (cf. `shared/entry.js`). Séparé de `state`, qui est modifiable par son propriétaire : un
-- niveau gagné et un exemplaire détruit engagent un adversaire, pas seulement soi-même.
create table public.arena_exemplars (
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_key text not null,
  level int not null default 1 check (level between 1 and 10),
  wins int not null default 0 check (wins >= 0),
  destroyed_at timestamptz,
  primary key (user_id, entry_key)
);

-- Un duel, de son engagement à sa résolution. Les puissances et la probabilité sont
-- conservées telles qu'elles ont été calculées : le résumé de combat les rejoue, et un
-- joueur qui vient de perdre un Pokémon a le droit de vérifier plutôt que de croire.
create table public.arena_duels (
  id bigint generated always as identity primary key,
  challenger_id uuid not null references auth.users (id) on delete cascade,
  challenger_key text not null,
  opponent_id uuid references auth.users (id) on delete cascade,
  opponent_key text,
  status text not null default 'open' check (status in ('open', 'resolved', 'computer')),
  winner_id uuid references auth.users (id),
  stake_tier text check (stake_tier in ('c', 'u', 'r', 'l')),
  challenger_power numeric,
  opponent_power numeric,
  probability numeric,
  roll numeric,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index arena_duels_open_idx on public.arena_duels (created_at) where status = 'open';

-- Portefeuille persistant, jamais remis à zéro : c'est ce qui rend la thésaurisation possible
-- sur plusieurs saisons. Le score de saison, lui, repart de zéro — d'où deux tables et non
-- deux colonnes.
create table public.arena_wallet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pokedollars int not null default 0 check (pokedollars >= 0)
);

create table public.arena_season_points (
  user_id uuid not null references auth.users (id) on delete cascade,
  season text not null,
  points int not null default 0 check (points >= 0),
  primary key (user_id, season)
);

-- Les saisons closes et leur podium. Sans cette table, un badge permanent n'aurait plus aucun
-- référent une fois les points de la saison remis à zéro.
create table public.arena_seasons (
  season text primary key,
  closed_at timestamptz not null default now(),
  first_id uuid references auth.users (id),
  second_id uuid references auth.users (id),
  third_id uuid references auth.users (id)
);

alter table public.arena_exemplars enable row level security;
alter table public.arena_duels enable row level security;
alter table public.arena_wallet enable row level security;
alter table public.arena_season_points enable row level security;
alter table public.arena_seasons enable row level security;

-- Lecture seule, et rien d'autre. L'unique écrivain de ces tables sera la fonction
-- `security definer` du lot 2b : une policy d'écriture ici serait une faille, pas une
-- facilité — elle laisserait un joueur s'attribuer des niveaux ou effacer sa défaite.
create policy "arena_exemplars_select_own" on public.arena_exemplars
  for select using (auth.uid() = user_id);

create policy "arena_wallet_select_own" on public.arena_wallet
  for select using (auth.uid() = user_id);

create policy "arena_season_points_select_all" on public.arena_season_points
  for select to authenticated using (true);

create policy "arena_seasons_select_all" on public.arena_seasons
  for select to authenticated using (true);

-- Un duel résolu est lisible par ses deux participants. Un duel ouvert ne l'est par personne
-- en direct : la mise ne doit pas seulement être masquée à l'affichage, elle ne doit pas être
-- lisible du tout, sinon un appel direct à l'API la révélerait. Les défis ouverts passent par
-- la vue `arena_open_challenges`, qui n'en expose pas la mise.
create policy "arena_duels_select_resolved_own" on public.arena_duels
  for select using (
    status <> 'open' and (auth.uid() = challenger_id or auth.uid() = opponent_id)
  );
```

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-tables.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-tables.test.js
git commit -m "feat(db): tables de l'arène, en lecture seule pour les joueurs"
```

---

### Task 5: Le pseudonyme, et ce qu'un adversaire voit

La spec (§ 5) tranche précisément ce qui est public : le pseudo, le classement, et **quelles espèces** quelqu'un possède — jamais **combien d'exemplaires**, parce que ce nombre-là est un compteur brut de PR mergées, et que le publier dans une entreprise revient à publier un classement de productivité.

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-visibility.test.js`

**Interfaces:**
- Produces: colonne `profiles.pseudo`, vue `arena_players (user_id, pseudo)`, vue `arena_open_challenges (id, challenger_id, pseudo, created_at)`, vue `arena_public_dex (user_id, species)`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `scripts/arena-visibility.test.js` :

```js
import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const colonnes = (c, vue) => c.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = $1 order by column_name
`, [vue]).then((r) => r.rows.map((x) => x.column_name))

describe.skipIf(!disponible)('ce qu’un adversaire a le droit de voir', () => {
  it('donne un pseudonyme aux profils', async () => {
    const cols = await withDb((c) => colonnes(c, 'profiles'))
    expect(cols).toContain('pseudo')
  })

  it('refuse deux pseudonymes identiques', async () => {
    await withDb(async (c) => {
      const { rows } = await c.query(`
        select conname from pg_constraint
        where conrelid = 'public.profiles' :: regclass and contype = 'u'
      `)
      expect(rows.length).toBeGreaterThan(0)
    })
  })

  // La mise d'un défi ouvert n'est pas seulement masquée à l'écran : elle ne doit pas figurer
  // dans la vue, sinon un appel direct à l'API la révélerait et le pari disparaîtrait.
  it('n’expose jamais la mise d’un défi ouvert', async () => {
    const cols = await withDb((c) => colonnes(c, 'arena_open_challenges'))
    expect(cols).not.toContain('challenger_key')
    expect(cols).not.toContain('opponent_key')
    expect(cols).toEqual(['challenger_id', 'created_at', 'id', 'pseudo'])
  })

  // Le nombre d'espèces plafonne à 151 et sature vite ; le nombre d'exemplaires, lui, ne
  // plafonne jamais — c'est un compteur de PR mergées.
  it('expose les espèces d’autrui, jamais son nombre d’exemplaires', async () => {
    const cols = await withDb((c) => colonnes(c, 'arena_public_dex'))
    expect(cols).toEqual(['species', 'user_id'])
  })

  it('ne rend qu’une ligne par espèce et par joueur', async () => {
    const { rows } = await withDb((c) => c.query(`
      select pg_get_viewdef('public.arena_public_dex' :: regclass) as def
    `))
    expect(rows[0].def.toLowerCase()).toContain('distinct')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/arena-visibility.test.js`
Expected: FAIL — `profiles` n'a pas de colonne `pseudo`

- [ ] **Step 3: Écrire la migration**

Dans la migration, avant `commit;` :

```sql
-- La seule donnée personnelle qu'un adversaire lira. `unique` parce qu'un pseudo qu'on peut
-- usurper ne sert à rien dans une arène où l'on choisit qui l'on affronte.
alter table public.profiles add column pseudo text unique;

-- Les vues appartiennent au propriétaire du schéma et s'exécutent sous ses droits : elles
-- traversent donc RLS. C'est voulu, et c'est pour ça qu'elles n'exposent QUE des colonnes
-- dont la publication a été tranchée dans la spec § 5.
create view public.arena_players as
  select user_id, pseudo from public.profiles where pseudo is not null;

create view public.arena_open_challenges as
  select d.id, d.challenger_id, p.pseudo, d.created_at
  from public.arena_duels d
  join public.profiles p on p.user_id = d.challenger_id
  where d.status = 'open';

-- Quelles espèces, jamais combien d'exemplaires : le `distinct` n'est pas une optimisation,
-- c'est la règle produit.
create view public.arena_public_dex as
  select distinct user_id, species from public.catches;

grant select on public.arena_players, public.arena_open_challenges, public.arena_public_dex
  to authenticated;
```

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-visibility.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-visibility.test.js
git commit -m "feat(db): pseudonyme et vues d'exposition — espèces oui, exemplaires non"
```

---

### Task 6: Éprouver l'isolation avec deux vrais utilisateurs

Les tests précédents vérifient la **forme** des policies. Celui-ci vérifie leur **effet**, avec deux comptes et des données : c'est la seule façon de savoir qu'un joueur ne lit pas la collection d'un autre.

**Files:**
- Test: `scripts/arena-rls.test.js`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `scripts/arena-rls.test.js` :

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()

const ALICE = '11111111-1111-1111-1111-111111111111'
const BOB = '22222222-2222-2222-2222-222222222222'

/**
 * Rejoue une requête comme le ferait PostgREST pour un utilisateur donné.
 *
 * La transaction explicite n'est pas décorative : `set local` ne vaut que pour la durée d'une
 * transaction, et sans elle le rôle et les claims seraient silencieusement ignorés — les
 * requêtes passeraient alors en superutilisateur et TOUS les tests d'isolation seraient verts
 * pour la pire des raisons.
 */
const commeUtilisateur = async (c, uid, sql) => {
  await c.query('begin')
  try {
    await c.query('set local role authenticated')
    await c.query(`set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`)
    const r = await c.query(sql)
    return r.rows
  } finally {
    await c.query('rollback')
  }
}

describe.skipIf(!disponible)('isolation entre deux joueurs', () => {
  beforeAll(async () => {
    await withDb(async (c) => {
      for (const [id, pseudo] of [[ALICE, 'alice'], [BOB, 'bob']]) {
        await c.query(`
          insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                                  email_confirmed_at, created_at, updated_at)
          values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                  $2 || '@test.local', '', now(), now(), now())
          on conflict (id) do nothing
        `, [id, pseudo])
        await c.query('update public.profiles set pseudo = $2 where user_id = $1', [id, pseudo])
      }
      await c.query(`
        insert into public.arena_wallet (user_id, pokedollars) values ($1, 500), ($2, 900)
        on conflict (user_id) do update set pokedollars = excluded.pokedollars
      `, [ALICE, BOB])
    })
  })

  it('laisse chacun lire son propre portefeuille', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, ALICE, 'select pokedollars from public.arena_wallet'))
    expect(rows).toEqual([{ pokedollars: 500 }])
  })

  it('cache le portefeuille de l’autre, sans erreur ni fuite', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, BOB, `select user_id from public.arena_wallet where user_id = '${ALICE}'`))
    expect(rows).toEqual([])
  })

  it('rend les pseudonymes de tout le monde', async () => {
    const rows = await withDb((c) =>
      commeUtilisateur(c, ALICE, 'select pseudo from public.arena_players order by pseudo'))
    expect(rows.map((r) => r.pseudo)).toEqual(['alice', 'bob'])
  })

  it('refuse toute écriture, même sur ses propres lignes', async () => {
    await withDb(async (c) => {
      await expect(
        commeUtilisateur(c, ALICE, 'update public.arena_wallet set pokedollars = 99999'),
      ).rejects.toThrow()
    })
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run scripts/arena-rls.test.js`
Expected: FAIL, tant que les tâches précédentes ne sont pas appliquées

- [ ] **Step 3: Vérifier après application**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-rls.test.js`
Expected: PASS

**Si le test d'écriture passe alors qu'il ne devrait pas** — c'est-à-dire si l'`update` réussit —, c'est une faille et non un détail : une policy `select` sans policy `update` doit refuser l'écriture. Ne pas contourner, remonter.

- [ ] **Step 4: Lancer toute la suite**

Run: `npm test`
Expected: PASS — les tests des lots précédents ne bougent pas

- [ ] **Step 5: Commit**

```bash
git add scripts/arena-rls.test.js
git commit -m "test: isolation RLS éprouvée avec deux utilisateurs et des données"
```

---

## À la fin du lot

Rendre un compte rendu portant :

1. **La migration complète**, telle qu'elle devra être collée dans l'éditeur SQL du dashboard le jour de la mise en service — en signalant si `\i` a dû être remplacé par une inclusion littérale.
2. **Ce que les tests couvrent réellement**, et ce qu'ils ne couvrent pas. En particulier : ce lot ne teste aucune concurrence, puisqu'il n'écrit rien.
3. **Tout écart à la spec**, s'il y en a — la spec fait foi, donc un écart se corrige dans la spec par un commit dédié, jamais en silence.

Le lot 2b prendra la suite : la fonction de combat en SQL, la RPC atomique de résolution, et les tests de concurrence qui vérifient que deux acceptations simultanées du même défi ne détruisent pas deux exemplaires.
