# Classement et stats d'équipe — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bouton 🏆 dans le rail ouvre un panneau à deux onglets : le classement des joueurs par espèces distinctes, et les stats de l'équipe (plis ouverts, taux de drop par palier, shiny, évolutions, Pokédex collectif) avec la valeur du joueur à côté.

**Architecture:** Une fonction SQL `leaderboard_players()` en `security definer` renvoie, pour chaque joueur ayant au moins une carte ouverte, son login, son avatar, ses captures ouvertes réduites à `source/external_id/species/shiny/date`, et ses évolutions. Le front passe chaque joueur dans `useDex` (le même calcul que le dex personnel) via un module pur `src/lib/leaderboard.js`, puis `LeaderboardPanel.vue` affiche. Le client démo implémente la même méthode `readLeaderboard()` avec quatre joueurs fictifs plus le joueur courant construit à la volée.

**Tech Stack:** Vue 3 (Composition API, SFC), Vitest + @vue/test-utils, Supabase (Postgres, RPC), JavaScript ESM. Aucune dépendance nouvelle.

**Spec:** `docs/superpowers/specs/2026-09-30-leaderboard-stats-design.md`

## Global Constraints

- **Français** partout : noms de tests, commentaires, messages de commit, textes d'interface.
- **Pas de TypeScript**, pas de bloc `<style>` dans les SFC (tout le CSS va dans `src/styles.css`), pas de dépendance ajoutée.
- **Commentaires** : expliquer le *pourquoi*, jamais le *quoi*. Densité et ton du projet.
- **Aucun titre, `ref` ni `url` de PR** ne sort de la base pour un autre joueur. Aucun `user_id` ne sort.
- **Seules les captures ouvertes** (clé dans `state.claimed`) comptent, partout.
- **Les valeurs théoriques** viennent de `WEIGHTS` et `SHINY_ODDS` dans `shared/draw.js`, jamais recopiées.
- **`today`** est toujours un paramètre `'YYYY-MM-DD'`, jamais `new Date()` dans une fonction de calcul.
- **Chaque tâche finit sur `npm test` au vert** et un commit. Le hook de push se contourne avec `GS_REVIEW_BYPASS=1` (pas de review-and-fix sur ce repo).
- `prefers-reduced-motion` n'est **pas** honoré dans ce projet (décision `ac68ba4`) — ne pas l'ajouter.

## Review Focus

Cinq cas que la spec implique sans les nommer ; chacun a son test dans la tâche qui possède le code :

1. **Une évolution dont l'exemplaire d'origine n'est pas dans les captures ouvertes** (`fromKey` inconnu, ou entrée ancienne avec `fromSha`). `useDex` renvoie alors `shiny: false` et l'espèce compte quand même. `playerStats` ne doit pas planter. → Tâche 2.
2. **Un joueur sans `evolutions`** (`null` en JSON si la colonne est vide côté SQL, ou tableau vide). `playerStats` traite `null` comme `[]`. → Tâche 2.
3. **Deux joueurs à égalité parfaite** (mêmes espèces, shiny, légendaires). Ordre par login insensible à la casse, rangs distincts. → Tâche 2.
4. **`readLeaderboard` renvoie un tableau vide** (personne n'a rien ouvert). Le panneau affiche un message, pas un tableau vide ni une erreur. → Tâche 4.
5. **Le panneau est rouvert après une erreur** : le rechargement repart de zéro, l'erreur précédente n'est plus affichée. → Tâche 4.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/2026-09-30-leaderboard.sql` | **créé** — la fonction `leaderboard_players()` et ses droits, dans une transaction |
| `supabase/schema.sql` | **modifié** — même fonction ajoutée en fin de fichier, pour une base neuve |
| `src/lib/leaderboard.js` | **créé** — `playerStats`, `rankPlayers`, `teamStats` : calcul pur, sans Vue de rendu |
| `src/lib/leaderboard.test.js` | **créé** — règles de comptage, ordre, stats d'équipe |
| `src/lib/supabaseData.js` | **modifié** — `readLeaderboard()` via `supabase.rpc` |
| `src/fixtures/demo.js` | **modifié** — `readLeaderboard()` : quatre joueurs fictifs + le joueur courant |
| `src/fixtures/demo.test.js` | **créé** — la ligne `is_me` suit l'état courant |
| `src/components/LeaderboardPanel.vue` | **créé** — chargement, erreur, deux onglets, tableau, stats |
| `src/components/LeaderboardPanel.test.js` | **créé** — états, onglets, ligne du joueur, tirets |
| `src/components/TheRail.vue` / `.test.js` | **modifié** — bouton 🏆 qui émet `leaderboard` |
| `src/App.vue` | **modifié** — `leaderboardOpen`, `dataClient`, overlay et Échap |
| `src/styles.css` | **modifié** — styles du panneau (`.board-*`) |
| `README.md` | **modifié** — un paragraphe sur le panneau et la procédure de migration |

---

### Tâche 1 : la fonction SQL

**Files:**
- Create: `supabase/migrations/2026-09-30-leaderboard.sql`
- Modify: `supabase/schema.sql` (ajout en fin de fichier)

**Interfaces:**
- Produces: RPC `leaderboard_players()` → lignes `{ login: text, avatar_url: text|null, is_me: boolean, catches: jsonb[], evolutions: jsonb[] }`. `catches` = `[{ source, external_id, species, shiny, date }]` triées par date. Seuls les joueurs avec au moins une capture ouverte sont renvoyés.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Classement et stats d'équipe : première lecture des données d'un autre joueur.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur la base en
-- service, AVANT de merger le front. Une base neuve part de `supabase/schema.sql`.
--
-- Ne crée qu'une fonction et son droit d'exécution. Aucune table modifiée, aucune donnée
-- touchée, aucun rattrapage. Retour arrière : `drop function public.leaderboard_players()`.

begin;

-- `security definer` parce que RLS ne laisse voir à chacun que ses propres lignes : c'est la
-- fonction qui décide ce qui sort, et elle ne laisse sortir que ce que le classement a
-- besoin de connaître. Ni `label`, ni `ref`, ni `url` (le titre et le lien des PR restent
-- privés), ni `user_id` — `is_me` suffit au front pour reconnaître sa ligne.
--
-- Le login est lu dans `auth.users` plutôt que dans `identities` : le trigger d'inscription
-- fait `on conflict do nothing`, donc un joueur dont le handle était déjà réclamé n'a pas de
-- ligne `identities` ; et les métadonnées OAuth sont rafraîchies à chaque connexion.
--
-- Seules les captures OUVERTES sortent (clé `source:external_id` présente dans
-- `state.claimed`) : même règle que le dex, et pas de spoiler d'un légendaire avant que son
-- propriétaire l'ait retourné. Un joueur sans capture ouverte n'est pas renvoyé.
create function public.leaderboard_players()
returns table (
  login text,
  avatar_url text,
  is_me boolean,
  catches jsonb,
  evolutions jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(u.raw_user_meta_data ->> 'user_name', 'inconnu') as login,
    u.raw_user_meta_data ->> 'avatar_url' as avatar_url,
    u.id = auth.uid() as is_me,
    opened.catches,
    s.evolutions
  from auth.users u
  join public.state s on s.user_id = u.id
  join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'source', c.source,
        'external_id', c.external_id,
        'species', c.species,
        'shiny', c.shiny,
        'date', c.date
      )
      order by c.date, c.id
    ) as catches
    from public.catches c
    where c.user_id = u.id
      and s.claimed ? (c.source || ':' || c.external_id)
  ) opened on true
  where opened.catches is not null;
$$;

revoke all on function public.leaderboard_players() from public;
grant execute on function public.leaderboard_players() to authenticated;

commit;
```

- [ ] **Étape 2 : ajouter la même fonction à `supabase/schema.sql`**

En fin de fichier, après le trigger `on_auth_user_created`, coller le bloc `create function … grant execute …` ci-dessus (sans `begin;`/`commit;`), précédé d'un commentaire d'une ligne : `-- leaderboard_players : voir supabase/migrations/2026-09-30-leaderboard.sql pour le pourquoi.`

- [ ] **Étape 3 : vérifier la syntaxe à la main**

Si un Supabase local tourne (`supabase start`), exécuter : `supabase db query < supabase/migrations/2026-09-30-leaderboard.sql` puis `supabase db query "select login, jsonb_array_length(catches) from public.leaderboard_players()"`. Sinon, relire deux points : `s.claimed ? (…)` (l'opérateur `?` teste la présence d'une chaîne dans un tableau JSON) et `where opened.catches is not null` (exclut les joueurs sans capture ouverte, `jsonb_agg` renvoyant `null` sur zéro ligne).

- [ ] **Étape 4 : commit**

```bash
git add supabase/migrations/2026-09-30-leaderboard.sql supabase/schema.sql
git commit -m "feat(db): fonction leaderboard_players — captures ouvertes et évolutions de chaque joueur"
```

---

### Tâche 2 : le calcul pur

**Files:**
- Create: `src/lib/leaderboard.js`
- Create: `src/lib/leaderboard.test.js`

**Interfaces:**
- Consumes: `useDex(catchesRef, stateRef)` de `src/composables/useDex.js` ; `DEX`, `familyOf`, `familyLine`, `hasEvoInFamily` de `shared/species.js` ; `WEIGHTS`, `SHINY_ODDS` de `shared/draw.js` ; `entryKey` de `shared/entry.js`.
- Produces:
  - `playerStats(catches, evolutions, today)` → `{ species, shiny, legendaries, rares, lineages, copies, recent, evolved, tiers: { c, u, r, l }, speciesIds: number[] }`
  - `rankPlayers(rows, today)` → `[{ rank, login, avatarUrl, isMe, ...playerStats }]` trié
  - `teamStats(rows, today)` → `{ opened: { team, me }, tiers: [{ tier, label, team: { count, pct }, me: { count, pct } | null, theory }], shiny: { team: { count, oneIn }, me: { count, oneIn } | null, theory }, evolved: { team, me }, collective }` — `me` vaut `null` quand aucune ligne n'est `is_me`.

- [ ] **Étape 1 : écrire les tests qui échouent**

```js
// src/lib/leaderboard.test.js
import { describe, it, expect } from 'vitest'
import { playerStats, rankPlayers, teamStats } from './leaderboard.js'
import { WEIGHTS, SHINY_ODDS } from '../../shared/draw.js'

const TODAY = '2026-09-30'
const c = (id, species, { shiny = false, date = '2026-06-01' } = {}) =>
  ({ source: 'github', external_id: id, species, shiny, date })
const row = (login, catches, evolutions = [], isMe = false) =>
  ({ login, avatar_url: null, is_me: isMe, catches, evolutions })

describe('playerStats', () => {
  it('compte les espèces distinctes, évolutions comprises', () => {
    const s = playerStats([c('a', 1), c('b', 1), c('c', 4)], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:a' }], TODAY)
    expect(s.species).toBe(3)
    expect(s.copies).toBe(3)
  })

  it('un shiny évolué compte une seule fois', () => {
    const s = playerStats([c('a', 1, { shiny: true })], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:a' }], TODAY)
    expect(s.shiny).toBe(1)
  })

  it('compte les légendaires et les rares, un rare obtenu par évolution compris', () => {
    const s = playerStats(
      [c('a', 150), c('b', 2)],
      [{ species: 3, from: 2, date: '2026-06-02', fromKey: 'github:b' }],
      TODAY,
    )
    expect(s.legendaries).toBe(1)
    expect(s.rares).toBe(1) // Florizarre (3) est rare, Herbizarre (2) ne l'est pas
  })

  it('une lignée est complète quand toutes ses formes sont là, Évoli inclus', () => {
    const evoli = [c('a', 133), c('b', 134), c('c', 135), c('d', 136)]
    expect(playerStats(evoli, [], TODAY).lineages).toBe(1)
    expect(playerStats(evoli.slice(0, 3), [], TODAY).lineages).toBe(0)
  })

  it('une espèce sans évolution ne fait pas une lignée', () => {
    expect(playerStats([c('a', 143)], [], TODAY).lineages).toBe(0) // Ronflex
  })

  it('compte les captures des 30 derniers jours sur la date de merge', () => {
    const s = playerStats([c('a', 1, { date: '2026-09-29' }), c('b', 4, { date: '2026-08-01' })], [], TODAY)
    expect(s.recent).toBe(1)
  })

  it('compte les captures par palier, pas les évolutions', () => {
    const s = playerStats([c('a', 4), c('b', 10)], [{ species: 5, from: 4, date: '2026-06-02', fromKey: 'github:a' }], TODAY)
    expect(s.tiers).toEqual({ c: 1, u: 0, r: 1, l: 0 })
  })

  it('ne plante pas sur une évolution dont l’origine est inconnue', () => {
    const s = playerStats([c('a', 1)], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:zzz' }], TODAY)
    expect(s.species).toBe(2)
    expect(s.shiny).toBe(0)
  })

  it('traite des évolutions nulles comme un tableau vide', () => {
    expect(playerStats([c('a', 1)], null, TODAY).evolved).toBe(0)
  })
})

describe('rankPlayers', () => {
  it('classe par espèces, puis shiny, puis légendaires, puis login', () => {
    const rows = [
      row('zoe', [c('a', 1), c('b', 4)]),
      row('Anna', [c('a', 1), c('b', 4)]),
      row('bob', [c('a', 1), c('b', 4, { shiny: true })]),
      row('lea', [c('a', 1), c('b', 4), c('c', 7)]),
    ]
    expect(rankPlayers(rows, TODAY).map((p) => [p.rank, p.login])).toEqual([
      [1, 'lea'], [2, 'bob'], [3, 'Anna'], [4, 'zoe'],
    ])
  })

  it('porte login, avatar et is_me', () => {
    const [p] = rankPlayers([{ ...row('lea', [c('a', 1)], [], true), avatar_url: 'x.png' }], TODAY)
    expect(p).toMatchObject({ login: 'lea', avatarUrl: 'x.png', isMe: true })
  })
})

describe('teamStats', () => {
  it('somme les plis et les évolutions, et isole le joueur courant', () => {
    const rows = [
      row('a', [c('1', 1), c('2', 4)], [{ species: 2, from: 1, date: '2026-06-02', fromKey: 'github:1' }]),
      row('me', [c('3', 7)], [], true),
    ]
    const t = teamStats(rows, TODAY)
    expect(t.opened).toEqual({ team: 3, me: 1 })
    expect(t.evolved).toEqual({ team: 1, me: 0 })
  })

  it('calcule les taux par palier avec le nombre, et la théorie depuis WEIGHTS', () => {
    const t = teamStats([row('a', [c('1', 10), c('2', 10), c('3', 4), c('4', 150)])], TODAY)
    const r = t.tiers.find((x) => x.tier === 'r')
    expect(r.team).toEqual({ count: 1, pct: 25 })
    expect(r.theory).toBe(WEIGHTS.find(([tier]) => tier === 'r')[1] * 100)
    expect(t.tiers.map((x) => x.tier)).toEqual(['c', 'u', 'r', 'l'])
  })

  it('donne des taux à zéro sans division par zéro quand personne n’a rien', () => {
    const t = teamStats([], TODAY)
    expect(t.tiers.every((x) => x.team.pct === 0)).toBe(true)
    expect(t.shiny.team).toEqual({ count: 0, oneIn: null })
    expect(t.opened.me).toBeNull()
  })

  it('exprime le shiny en « 1 sur N » et lit la théorie dans SHINY_ODDS', () => {
    const catches = [c('1', 1, { shiny: true }), ...Array.from({ length: 63 }, (_, i) => c(`n${i}`, 1))]
    const t = teamStats([row('a', catches)], TODAY)
    expect(t.shiny.team).toEqual({ count: 1, oneIn: 64 })
    expect(t.shiny.theory).toBe(SHINY_ODDS)
  })

  it('le Pokédex collectif dédoublonne entre joueurs', () => {
    const t = teamStats([row('a', [c('1', 1), c('2', 4)]), row('b', [c('3', 4), c('4', 7)])], TODAY)
    expect(t.collective).toBe(3)
  })

  it('« me » est null partout quand aucune ligne n’est is_me', () => {
    const t = teamStats([row('a', [c('1', 1)])], TODAY)
    expect(t.opened.me).toBeNull()
    expect(t.shiny.me).toBeNull()
    expect(t.tiers[0].me).toBeNull()
  })
})
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run: `npx vitest run src/lib/leaderboard.test.js`
Expected: FAIL — `Failed to resolve import "./leaderboard.js"`

- [ ] **Étape 3 : écrire le module**

```js
// src/lib/leaderboard.js
import { ref } from 'vue'
import { useDex } from '../composables/useDex.js'
import { DEX, familyOf, familyLine, hasEvoInFamily, TIER_LABEL } from '../../shared/species.js'
import { WEIGHTS, SHINY_ODDS } from '../../shared/draw.js'
import { entryKey } from '../../shared/entry.js'

const TIERS = ['c', 'u', 'r', 'l']
const DAY_MS = 24 * 60 * 60 * 1000

// Date pivot en 'YYYY-MM-DD' : les dates de capture sont des chaînes de ce format, une
// comparaison lexicale suffit et évite tout fuseau horaire.
function thirtyDaysBefore(today) {
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Les colonnes d'un joueur, calculées par le même `useDex` que son propre dex — c'est ce qui
 * garantit qu'un classement ne peut pas contredire le compteur /151 qu'il voit chez lui.
 * `catches` ne contient que des captures ouvertes (la base filtre), donc `claimed` est
 * simplement l'ensemble de leurs clés. `spent` reste vide : aucune colonne n'en dépend.
 */
export function playerStats(catches, evolutions, today) {
  const evos = evolutions ?? []
  const state = ref({ claimed: catches.map((c) => entryKey(c.source, c.external_id)), spent: {}, evolutions: evos })
  const dex = useDex(ref(catches), state)

  const owned = new Set(Object.keys(dex.bySpecies.value).map(Number))
  const ofTier = (t) => [...owned].filter((id) => DEX[id].tier === t).length

  // Une lignée par famille, comptée une fois même si plusieurs de ses membres sont là.
  // Les familles sans évolution sont exclues : une capture les « compléterait ».
  const families = new Set([...owned].map(familyOf).filter(hasEvoInFamily))
  const lineages = [...families].filter((fam) => familyLine(fam).flat().every((id) => owned.has(id))).length

  const since = thirtyDaysBefore(today)
  const tiers = { c: 0, u: 0, r: 0, l: 0 }
  for (const c of catches) tiers[DEX[c.species].tier]++

  return {
    species: owned.size,
    // Compté sur les captures, pas sur le dex : un shiny évolué y apparaîtrait deux fois.
    shiny: catches.filter((c) => c.shiny).length,
    legendaries: ofTier('l'),
    rares: ofTier('r'),
    lineages,
    copies: catches.length,
    recent: catches.filter((c) => c.date > since).length,
    evolved: evos.length,
    tiers,
    speciesIds: [...owned],
  }
}

const byRank = (a, b) =>
  b.species - a.species ||
  b.shiny - a.shiny ||
  b.legendaries - a.legendaries ||
  a.login.localeCompare(b.login, 'fr', { sensitivity: 'base' })

/** Les lignes de `leaderboard_players()` → le classement affiché, rang compris. */
export function rankPlayers(rows, today) {
  return rows
    .map((r) => ({ login: r.login, avatarUrl: r.avatar_url ?? null, isMe: Boolean(r.is_me), ...playerStats(r.catches, r.evolutions, today) }))
    .sort(byRank)
    .map((p, i) => ({ rank: i + 1, ...p }))
}

const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0)
const oneIn = (shiny, total) => (shiny ? Math.round(total / shiny) : null)

/**
 * L'onglet Stats : équipe, joueur courant (`null` s'il n'a aucune ligne, donc aucune capture
 * ouverte), et théorie lue dans `shared/draw.js` — jamais recopiée, pour ne pas mentir le
 * jour où les poids changent. Les taux se calculent sur les captures seules : faire évoluer
 * un Salamèche (rare) en Reptincel (peu commun) ne doit pas déplacer les taux de drop.
 */
export function teamStats(rows, today) {
  const players = rankPlayers(rows, today)
  const me = players.find((p) => p.isMe) ?? null
  const sum = (key) => players.reduce((acc, p) => acc + p[key], 0)
  const teamOpened = sum('copies')
  const teamTier = (t) => players.reduce((acc, p) => acc + p.tiers[t], 0)
  const theoryOf = Object.fromEntries(WEIGHTS)

  return {
    opened: { team: teamOpened, me: me ? me.copies : null },
    tiers: TIERS.map((t) => ({
      tier: t,
      label: TIER_LABEL[t],
      team: { count: teamTier(t), pct: pct(teamTier(t), teamOpened) },
      me: me ? { count: me.tiers[t], pct: pct(me.tiers[t], me.copies) } : null,
      theory: theoryOf[t] * 100,
    })),
    shiny: {
      team: { count: sum('shiny'), oneIn: oneIn(sum('shiny'), teamOpened) },
      me: me ? { count: me.shiny, oneIn: oneIn(me.shiny, me.copies) } : null,
      theory: SHINY_ODDS,
    },
    evolved: { team: sum('evolved'), me: me ? me.evolved : null },
    collective: new Set(players.flatMap((p) => p.speciesIds)).size,
  }
}
```

- [ ] **Étape 4 : lancer, vérifier le succès**

Run: `npx vitest run src/lib/leaderboard.test.js`
Expected: PASS, 16 tests. Puis `npm test` au vert.

- [ ] **Étape 5 : commit**

```bash
git add src/lib/leaderboard.js src/lib/leaderboard.test.js
git commit -m "feat(classement): calcul des colonnes et des stats d'équipe via useDex"
```

---

### Tâche 3 : `readLeaderboard()` sur les deux clients

**Files:**
- Modify: `src/lib/supabaseData.js` (ajout d'une méthode dans `createSupabaseClient`)
- Modify: `src/fixtures/demo.js` (`loadDemoClient` + joueurs fictifs)
- Create: `src/fixtures/demo.test.js`

**Interfaces:**
- Consumes: `supabase.rpc(name)` ; `drawFrom`, `entryKey` déjà importés dans `demo.js`.
- Produces: `client.readLeaderboard()` → `Promise<Array<{ login, avatar_url, is_me, catches, evolutions }>>`, même forme que la fonction SQL, sur les deux clients.

- [ ] **Étape 1 : le test de la démo, qui échoue**

```js
// src/fixtures/demo.test.js
import { describe, it, expect } from 'vitest'
import { loadDemoClient } from './demo.js'
import { entryKey } from '../../shared/entry.js'

describe('loadDemoClient.readLeaderboard', () => {
  it('renvoie quatre joueurs fictifs et exactement une ligne is_me', async () => {
    const rows = await loadDemoClient().readLeaderboard()
    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => r.is_me)).toHaveLength(1)
  })

  it('ne renvoie que des captures réduites, sans label ni url', async () => {
    const rows = await loadDemoClient().readLeaderboard()
    for (const c of rows.flatMap((r) => r.catches)) {
      expect(Object.keys(c).sort()).toEqual(['date', 'external_id', 'shiny', 'source', 'species'])
    }
  })

  it('la ligne is_me suit l’état courant : ouvrir un pli l’ajoute', async () => {
    const client = loadDemoClient()
    const before = (await client.readLeaderboard()).find((r) => r.is_me)
    const { state } = await client.readState()
    const all = await client.readCatches()
    const pending = all.find((c) => !state.claimed.includes(entryKey(c.source, c.external_id)))
    await client.writeState({ ...state, claimed: [...state.claimed, entryKey(pending.source, pending.external_id)] })
    const after = (await client.readLeaderboard()).find((r) => r.is_me)
    expect(after.catches).toHaveLength(before.catches.length + 1)
  })

  it('un joueur fictif porte au moins un shiny, un légendaire et deux évolutions', async () => {
    const rows = (await loadDemoClient().readLeaderboard()).filter((r) => !r.is_me)
    expect(rows.some((r) => r.catches.some((c) => c.shiny))).toBe(true)
    expect(rows.some((r) => r.catches.some((c) => c.species >= 144))).toBe(true)
    expect(rows.some((r) => r.evolutions.length >= 2)).toBe(true)
  })
})
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run: `npx vitest run src/fixtures/demo.test.js`
Expected: FAIL — `client.readLeaderboard is not a function`

- [ ] **Étape 3 : la méthode Supabase**

Dans `src/lib/supabaseData.js`, dans `createSupabaseClient`, après `triggerCatch` :

```js
  /**
   * Les captures ouvertes et les évolutions de tous les joueurs, réduites à ce que le
   * classement calcule (cf. `leaderboard_players` côté base). C'est la seule lecture qui
   * traverse RLS : elle passe par une fonction, jamais par un `from()` sur les tables.
   */
  async function readLeaderboard() {
    return query(() => supabase.rpc('leaderboard_players'))
  }

  return { checkAccess, readCatches, readState, writeState, triggerCatch, readLeaderboard }
```

Mettre à jour le commentaire de tête de `createSupabaseClient` : ajouter une phrase « `readLeaderboard` est la seconde addition, pour le classement. »

- [ ] **Étape 4 : la démo**

Dans `src/fixtures/demo.js`, avant `loadDemoClient`, ajouter :

```js
// Avatar sans réseau : une lettre sur un disque, en SVG inline. Jamais une URL GitHub
// réelle — la démo ne doit désigner personne.
const svgAvatar = (login) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#6f6350"/>` +
    `<text x="20" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#e7ddc7">${login[0].toUpperCase()}</text></svg>`,
  )

// Quatre joueurs fictifs à effectifs très différents, pour que le classement ait un ordre
// lisible d'un coup d'œil. Tirages déterministes (`drawFrom` sur un seed fixe), datés en
// remontant depuis aujourd'hui tous les six jours : les derniers tombent dans les 30 jours.
const FAKE_PLAYERS = [['marge', 12], ['ondine', 27], ['pierre', 41], ['sacha', 58]]

function demoPlayers() {
  const now = Date.now()
  const dateAt = (stepsBack) => new Date(now - stepsBack * 6 * 86_400_000).toISOString().slice(0, 10)
  return FAKE_PLAYERS.map(([login, count]) => {
    const catches = Array.from({ length: count }, (_, n) => {
      const id = `${login}-${n}`
      const { species, shiny } = drawFrom(entryKey('demo', id))
      return { source: 'demo', external_id: id, species, shiny, date: dateAt(count - 1 - n) }
    })
    // Aucun chromatique ni légendaire ne sort naturellement sur si peu de tirages, et une
    // lignée complète demande une évolution : on force ce qu'il faut sur le meneur pour que
    // chaque colonne soit non nulle au moins une fois. Chenipan (10) en n=7 puis deux
    // évolutions en chaîne donnent la lignée Chenipan → Chrysacier → Papilusion.
    let evolutions = []
    if (login === 'sacha') {
      catches[3].shiny = true
      catches[5].species = 150
      catches[7].species = 10
      evolutions = [
        { species: 11, from: 10, date: dateAt(2), fromKey: entryKey('demo', `${login}-7`) },
        { species: 12, from: 11, date: dateAt(1), fromKey: 'evo:0' },
      ]
    }
    if (login === 'ondine') catches[10].shiny = true
    return { login, avatar_url: svgAvatar(login), is_me: false, catches, evolutions }
  })
}
```

Puis dans `loadDemoClient`, ajouter la méthode au client renvoyé :

```js
    // La ligne « démo » se construit à chaque appel depuis l'état courant : ouvrir un pli ou
    // faire une évolution, puis rouvrir le panneau, doit faire bouger sa ligne — c'est ce
    // qui rend la démo utile pour juger le panneau.
    readLeaderboard: async () => {
      const opened = catches
        .filter((c) => state.claimed.includes(entryKey(c.source, c.external_id)))
        .map(({ source, external_id, species, shiny, date }) => ({ source, external_id, species, shiny, date }))
      return [
        ...demoPlayers(),
        { login: 'démo', avatar_url: svgAvatar('démo'), is_me: true, catches: opened, evolutions: state.evolutions },
      ]
    },
```

Mettre à jour le commentaire au-dessus de `loadDemoClient` : « … Le classement y compte quatre joueurs fictifs plus le joueur courant. »

- [ ] **Étape 5 : lancer, vérifier le succès**

Run: `npx vitest run src/fixtures/demo.test.js`
Expected: PASS, 4 tests. Puis `npm test` au vert (les tests existants sur `demoCatches` ne bougent pas : rien n'a changé dans les captures de démo).

- [ ] **Étape 6 : commit**

```bash
git add src/lib/supabaseData.js src/fixtures/demo.js src/fixtures/demo.test.js
git commit -m "feat(classement): readLeaderboard sur le client Supabase et sur la démo"
```

---

### Tâche 4 : le panneau

**Files:**
- Create: `src/components/LeaderboardPanel.vue`
- Create: `src/components/LeaderboardPanel.test.js`
- Modify: `src/styles.css` (ajout d'un bloc `/* Classement */`)

**Interfaces:**
- Consumes: `client.readLeaderboard()` (Tâche 3) ; `rankPlayers`, `teamStats` (Tâche 2) ; `SupabaseDataError.kind`.
- Produces: composant `LeaderboardPanel` — props `client: Object` (required), `today: String` (required) ; émet `close`.

**Direction visuelle.** Pas une déclinaison des réglages. Un tableau des scores : plaque sombre (`--ink`) sur laquelle le papier devient l'encre, chiffres tabulaires en `--f-data`, rang en gros et en ocre, la ligne du joueur soulignée d'un filet ocre. Les colonnes de palier reprennent `--t-r` et `--t-l` en pastille devant le nombre. Les onglets sont deux plaques `panel-plate` dont l'active est pleine. Ça tranche volontairement avec le reste de l'app : c'est le seul écran où l'on regarde les autres.

- [ ] **Étape 1 : les tests, qui échouent**

```js
// src/components/LeaderboardPanel.test.js
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LeaderboardPanel from './LeaderboardPanel.vue'
import { SupabaseDataError } from '../lib/supabaseData.js'

const TODAY = '2026-09-30'
const c = (id, species, shiny = false) => ({ source: 'github', external_id: id, species, shiny, date: '2026-09-01' })
const ROWS = [
  { login: 'lea', avatar_url: null, is_me: false, catches: [c('a', 1), c('b', 4), c('d', 7)], evolutions: [] },
  { login: 'moi', avatar_url: 'me.png', is_me: true, catches: [c('e', 1, true)], evolutions: [] },
]

const mountPanel = (readLeaderboard) =>
  mount(LeaderboardPanel, { props: { client: { readLeaderboard }, today: TODAY } })

describe('LeaderboardPanel', () => {
  it('affiche le chargement puis le classement, onglet Classement par défaut', async () => {
    const w = mountPanel(vi.fn().mockResolvedValue(ROWS))
    expect(w.find('.board-loading').exists()).toBe(true)
    await flushPromises()
    expect(w.find('.board-loading').exists()).toBe(false)
    expect(w.find('.board-tab.active').text()).toBe('Classement')
    expect(w.findAll('tbody tr').map((r) => r.find('.board-login').text())).toEqual(['lea', 'moi'])
  })

  it('marque la ligne du joueur courant', async () => {
    const w = mountPanel(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    const rows = w.findAll('tbody tr')
    expect(rows[1].classes()).toContain('me')
    expect(rows[0].classes()).not.toContain('me')
  })

  it('affiche l’erreur et réessaie au clic', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new SupabaseDataError('offline', 'Pas de connexion réseau.'))
      .mockResolvedValueOnce(ROWS)
    const w = mountPanel(read)
    await flushPromises()
    expect(w.find('.board-error').text()).toContain('Pas de connexion réseau.')
    await w.find('.board-error button').trigger('click')
    await flushPromises()
    expect(w.find('.board-error').exists()).toBe(false)
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('dit quand personne n’a encore rien ouvert', async () => {
    const w = mountPanel(vi.fn().mockResolvedValue([]))
    await flushPromises()
    expect(w.find('.board-empty').exists()).toBe(true)
    expect(w.find('tbody').exists()).toBe(false)
  })

  it('bascule sur Stats et montre équipe / toi / théorie', async () => {
    const w = mountPanel(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    await w.findAll('.board-tab')[1].trigger('click')
    expect(w.find('.board-tab.active').text()).toBe('Stats')
    const opened = w.find('[data-stat="opened"]')
    expect(opened.find('.stat-team').text()).toBe('4')
    expect(opened.find('.stat-me').text()).toBe('1')
    const shiny = w.find('[data-stat="shiny"]')
    expect(shiny.find('.stat-theory').text()).toContain('128')
  })

  it('met des tirets dans « Toi » quand le joueur n’a aucune ligne', async () => {
    const w = mountPanel(vi.fn().mockResolvedValue([ROWS[0]]))
    await flushPromises()
    await w.findAll('.board-tab')[1].trigger('click')
    expect(w.find('[data-stat="opened"] .stat-me').text()).toBe('—')
  })

  it('émet close sur la croix et sur le scrim', async () => {
    const w = mountPanel(vi.fn().mockResolvedValue(ROWS))
    await flushPromises()
    await w.find('.x').trigger('click')
    await w.find('.scrim').trigger('click')
    expect(w.emitted('close')).toHaveLength(2)
  })
})
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run: `npx vitest run src/components/LeaderboardPanel.test.js`
Expected: FAIL — `Failed to resolve import "./LeaderboardPanel.vue"`

- [ ] **Étape 3 : le composant**

```vue
<!-- src/components/LeaderboardPanel.vue -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { rankPlayers, teamStats } from '../lib/leaderboard.js'
import { TIER_VAR } from '../../shared/species.js'

const props = defineProps({
  client: { type: Object, required: true },
  today: { type: String, required: true },
})
defineEmits(['close'])

const tab = ref('ranking')
const rows = ref(null)
const loading = ref(false)
const error = ref(null)

// Rechargé à chaque ouverture, jamais mis en cache : le panneau est monté à l'ouverture et
// détruit à la fermeture, et les données tiennent en quelques Ko. Une erreur ne survit
// donc pas à une fermeture — rouvrir repart de zéro.
async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await props.client.readLeaderboard()
  } catch (e) {
    error.value = e.message ?? 'Le chargement a échoué.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const players = computed(() => (rows.value ? rankPlayers(rows.value, props.today) : []))
const stats = computed(() => (rows.value ? teamStats(rows.value, props.today) : null))

const fmtPct = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
// « 0 sur N » plutôt qu'une division par zéro : le nombre dit la taille de l'échantillon.
const fmtOneIn = (s, total) => (s.oneIn ? `1 sur ${s.oneIn}` : `0 sur ${total}`)
const dash = (v) => (v === null || v === undefined ? '—' : v)

const COLUMNS = [
  ['species', 'Espèces'], ['shiny', 'Shiny'], ['legendaries', 'Légendaires'], ['rares', 'Rares'],
  ['lineages', 'Lignées'], ['copies', 'Exemplaires'], ['recent', '30 jours'],
]
// Sur un écran étroit, seules ces colonnes restent visibles ; les autres se déplient au toucher.
const PRIMARY = new Set(['species', 'shiny'])
const expanded = ref(null)
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel board">
      <div class="panel-top board-top">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">ÉQUIPE</span>
          <h2 class="panel-name board-title">Tableau des scores</h2>
        </div>
      </div>

      <div class="board-tabs" role="tablist">
        <button class="board-tab" :class="{ active: tab === 'ranking' }" role="tab" @click="tab = 'ranking'">Classement</button>
        <button class="board-tab" :class="{ active: tab === 'stats' }" role="tab" @click="tab = 'stats'">Stats</button>
      </div>

      <div v-if="loading" class="board-loading mono">Chargement…</div>

      <div v-else-if="error" class="board-error">
        <p>{{ error }}</p>
        <button class="btn-ghost" @click="load">Réessayer</button>
      </div>

      <p v-else-if="!players.length" class="board-empty muted">
        Personne n'a encore retourné de carte. Le classement commence à la première.
      </p>

      <table v-else-if="tab === 'ranking'" class="board-table">
        <thead>
          <tr>
            <th class="board-rank">#</th>
            <th class="board-who">Joueur</th>
            <th v-for="[key, label] in COLUMNS" :key="key" :class="{ secondary: !PRIMARY.has(key) }">{{ label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in players" :key="p.login"
            :class="{ me: p.isMe, expanded: expanded === p.login }"
            @click="expanded = expanded === p.login ? null : p.login"
          >
            <td class="board-rank mono">{{ p.rank }}</td>
            <td class="board-who">
              <img v-if="p.avatarUrl" class="board-avatar" :src="p.avatarUrl" alt="">
              <span v-else class="board-avatar board-avatar-empty"></span>
              <span class="board-login">{{ p.login }}</span>
            </td>
            <td v-for="[key] in COLUMNS" :key="key" class="mono" :class="{ secondary: !PRIMARY.has(key) }">
              <span v-if="key === 'legendaries'" class="board-dot" :style="{ background: TIER_VAR.l }"></span>
              <span v-else-if="key === 'rares'" class="board-dot" :style="{ background: TIER_VAR.r }"></span>
              {{ p[key] }}
            </td>
          </tr>
        </tbody>
      </table>

      <table v-else class="board-table board-stats">
        <thead>
          <tr><th></th><th>Équipe</th><th>Toi</th><th>Théorie</th></tr>
        </thead>
        <tbody>
          <tr data-stat="opened">
            <th>Plis ouverts</th>
            <td class="stat-team mono">{{ stats.opened.team }}</td>
            <td class="stat-me mono">{{ dash(stats.opened.me) }}</td>
            <td class="stat-theory mono">—</td>
          </tr>
          <tr v-for="t in stats.tiers" :key="t.tier" :data-stat="'tier-' + t.tier">
            <th><span class="board-dot" :style="{ background: TIER_VAR[t.tier] }"></span>{{ t.label }}</th>
            <td class="stat-team mono">{{ fmtPct(t.team.pct) }} <small>({{ t.team.count }})</small></td>
            <td class="stat-me mono">
              <template v-if="t.me">{{ fmtPct(t.me.pct) }} <small>({{ t.me.count }})</small></template>
              <template v-else>—</template>
            </td>
            <td class="stat-theory mono">{{ fmtPct(t.theory) }}</td>
          </tr>
          <tr data-stat="shiny">
            <th>Shiny</th>
            <td class="stat-team mono">{{ fmtOneIn(stats.shiny.team, stats.opened.team) }} <small>({{ stats.shiny.team.count }})</small></td>
            <td class="stat-me mono">
              <template v-if="stats.shiny.me">{{ fmtOneIn(stats.shiny.me, stats.opened.me) }} <small>({{ stats.shiny.me.count }})</small></template>
              <template v-else>—</template>
            </td>
            <td class="stat-theory mono">1 sur {{ stats.shiny.theory }}</td>
          </tr>
          <tr data-stat="evolved">
            <th>Pokémon évolués</th>
            <td class="stat-team mono">{{ stats.evolved.team }}</td>
            <td class="stat-me mono">{{ dash(stats.evolved.me) }}</td>
            <td class="stat-theory mono">—</td>
          </tr>
          <tr data-stat="collective">
            <th>Pokédex collectif</th>
            <td class="stat-team mono">{{ stats.collective }} / 151</td>
            <td class="stat-me mono">—</td>
            <td class="stat-theory mono">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

- [ ] **Étape 4 : les styles**

Dans `src/styles.css`, à la suite du bloc des panneaux (`.panel`, `.panel-top`…), ajouter :

```css
  /* Classement — une plaque sombre, le seul écran où l'on regarde les autres. Le papier
     devient l'encre : tout ce qui est lisible ailleurs sur --paper se lit ici sur --ink. */
  .board{width:min(760px,100%);background:var(--ink);color:var(--paper);
    box-shadow:inset 0 0 0 1px var(--ink-2),0 0 0 5px var(--ink),0 0 0 6px var(--ink-2)}
  .board .x{color:var(--ink-3)}
  .board .x:hover{color:var(--paper)}
  .board .panel-plate{background:var(--ochre);color:var(--ink)}
  .board-title{font-size:23px;margin-bottom:0;color:var(--paper)}
  .board-top{align-items:flex-start;padding-bottom:14px}
  .board-tabs{display:flex;gap:6px;margin:0 0 14px}
  .board-tab{font-family:var(--f-label);font-weight:600;font-size:10px;letter-spacing:.24em;text-transform:uppercase;
    padding:8px 14px;border:1px solid var(--ink-2);background:transparent;color:var(--ink-3);cursor:pointer}
  .board-tab:hover{color:var(--paper)}
  .board-tab.active{background:var(--paper);color:var(--ink);border-color:var(--paper)}
  .board-loading,.board-empty,.board-error{padding:28px 0;text-align:center;color:var(--ink-3)}
  .board-error button{margin-top:10px;border-color:var(--ink-2);color:var(--paper)}
  .board-table{width:100%;border-collapse:collapse;font-size:13px}
  .board-table th{font-family:var(--f-label);font-weight:600;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;
    color:var(--ink-3);text-align:right;padding:6px 8px;border-bottom:1px solid var(--ink-2)}
  .board-table td{padding:9px 8px;text-align:right;border-bottom:1px solid rgba(231,221,199,.08);font-variant-numeric:tabular-nums}
  .board-table th.board-who,.board-table td.board-who,.board-stats th{text-align:left}
  .board-rank{width:36px;font-size:18px;color:var(--ochre)}
  .board-who{display:flex;align-items:center;gap:10px}
  .board-avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;background:var(--ink-2)}
  .board-avatar-empty{display:inline-block}
  .board-login{font-weight:600}
  .board-table tr.me td{background:rgba(184,134,43,.12)}
  .board-table tr.me .board-login{color:var(--ochre)}
  .board-table tr.me .board-login::after{content:" · toi";font-weight:400;color:var(--ink-3)}
  .board-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px}
  .board-table small{color:var(--ink-3);font-size:10.5px}
  .board-stats th{font-family:inherit;font-size:13px;letter-spacing:0;text-transform:none;color:var(--paper);font-weight:400}
  .board-stats thead th{font-family:var(--f-label);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)}

  /* Étroit : seules # / joueur / espèces / shiny restent ; le reste se déplie au toucher de la ligne. */
  @media (max-width:640px){
    .board-table .secondary{display:none}
    .board-table tbody tr{cursor:pointer}
    .board-table tr.expanded td.secondary{display:table-cell}
    .board-table tr.expanded th.secondary{display:table-cell}
  }
```

- [ ] **Étape 5 : lancer, vérifier le succès**

Run: `npx vitest run src/components/LeaderboardPanel.test.js`
Expected: PASS, 7 tests. Puis `npm test` au vert.

- [ ] **Étape 6 : commit**

```bash
git add src/components/LeaderboardPanel.vue src/components/LeaderboardPanel.test.js src/styles.css
git commit -m "feat(classement): le panneau Tableau des scores — classement et stats d'équipe"
```

---

### Tâche 5 : le bouton, l'ouverture, Échap, la démo et la doc

**Files:**
- Modify: `src/components/TheRail.vue` (un bouton, un événement)
- Modify: `src/components/TheRail.test.js` (un test)
- Modify: `src/App.vue` (état, client, overlay, Échap)
- Modify: `README.md` (paragraphe + procédure)

**Interfaces:**
- Consumes: `LeaderboardPanel` (Tâche 4) ; `createSupabaseClient` / `loadDemoClient` (Tâche 3).
- Produces: `TheRail` émet `leaderboard` ; `App.vue` porte `leaderboardOpen` et `dataClient`.

- [ ] **Étape 1 : le test du rail, qui échoue**

Dans `src/components/TheRail.test.js`, dans le `describe('TheRail')`, ajouter :

```js
  it('émet leaderboard au clic sur le trophée', async () => {
    const w = mountRail()
    await w.find('.trophy').trigger('click')
    expect(w.emitted('leaderboard')).toHaveLength(1)
  })
```

Run: `npx vitest run src/components/TheRail.test.js`
Expected: FAIL — `Cannot call trigger on an empty DOMWrapper`

- [ ] **Étape 2 : le bouton**

Dans `src/components/TheRail.vue` :

```js
const emit = defineEmits(['open', 'settings', 'sync', 'toggle-filters', 'leaderboard'])
```

et dans `.rail-tools`, juste avant le bouton ⚙ :

```html
      <button class="gear trophy" title="Classement" @click="$emit('leaderboard')">🏆</button>
```

Run: `npx vitest run src/components/TheRail.test.js` — Expected: PASS.

- [ ] **Étape 3 : `App.vue`**

Imports : ajouter `import LeaderboardPanel from './components/LeaderboardPanel.vue'`.

État, après `const settingsOpen = ref(false)` :

```js
const leaderboardOpen = ref(false)
// Le client de données reste dans `useCollection`, qui ne l'expose pas ; le panneau du
// classement en a besoin pour sa propre lecture. On garde donc la référence ici, au seul
// endroit qui la crée.
const dataClient = ref(null)
// Date du jour figée au chargement, au format des dates de capture : le calcul des
// « 30 jours » est une fonction pure, elle ne lit jamais l'horloge elle-même.
const today = new Date().toISOString().slice(0, 10)
```

Dans `connectSession`, après `const client = createSupabaseClient(s.user.id)` : `dataClient.value = client`.

Dans `onMounted` (démo), remplacer `await collection.load(loadDemoClient())` par :

```js
    const client = loadDemoClient()
    dataClient.value = client
    await collection.load(client)
```

`overlayOpen` :

```js
const overlayOpen = computed(() =>
  Boolean(ritualEntry.value || evoAnim.value || selected.value || settingsOpen.value || leaderboardOpen.value),
)
```

`closeTopOverlay` : ajouter, après la ligne des réglages (même niveau, z-index 40) :

```js
  else if (leaderboardOpen.value) leaderboardOpen.value = false
```

Template : sur `<TheRail>`, ajouter `@leaderboard="leaderboardOpen = true"`. Après le bloc `SettingsPanel`, ajouter :

```html
    <transition name="fade">
      <LeaderboardPanel
        v-if="leaderboardOpen" :client="dataClient" :today="today" @close="leaderboardOpen = false"
      />
    </transition>
```

- [ ] **Étape 4 : vérifier à la main en démo**

Run: `npm run dev` puis ouvrir `http://localhost:5173/?demo`. Vérifier :
- le 🏆 ouvre le panneau, `sacha` est premier, la ligne `démo` est surlignée et porte « · toi » ;
- l'onglet Stats montre des taux non nuls, « 1 sur N » pour les shiny, et une colonne Théorie ;
- Échap ferme le panneau ; ouvrir un pli puis rouvrir le panneau fait monter « Exemplaires » de la ligne `démo` ;
- réduire la fenêtre sous 640 px : quatre colonnes, toucher une ligne déplie le reste.

- [ ] **Étape 5 : README**

Dans `README.md`, après la section « L'ouverture », ajouter :

```markdown
## Le tableau des scores

Le 🏆 du rail ouvre le seul écran où l'on regarde les autres : un classement par espèces
distinctes (puis shiny, puis légendaires), et les stats de l'équipe — plis ouverts, taux de
drop par palier face à la théorie, shiny en « 1 sur N », évolutions, Pokédex collectif —
avec sa propre valeur à côté.

Seules les cartes **retournées** comptent, comme dans le dex : le classement ne dévoile pas
un légendaire avant que son propriétaire l'ait vu. Ni le titre ni le lien des PR ne sortent
de la base pour un autre joueur — la fonction `leaderboard_players()` (voir
`supabase/migrations/2026-09-30-leaderboard.sql`) ne renvoie que l'espèce, le chromatisme
et la date de chaque capture ouverte. Le calcul des colonnes passe par le même `useDex`
que le dex personnel : un classement ne peut pas contredire le compteur /151 d'un joueur.
```

Et dans l'arborescence de la section « Architecture » (ligne `supabase/migrations/`, README.md:183), ajouter juste dessous : « `2026-09-30-leaderboard.sql` — à exécuter **avant** de merger le front du classement ; sans elle, seul le panneau 🏆 est en erreur, le reste de l'app fonctionne. »

- [ ] **Étape 6 : suite complète et commit**

Run: `npm test` — Expected: tout au vert.

```bash
git add src/components/TheRail.vue src/components/TheRail.test.js src/App.vue README.md
git commit -m "feat(classement): bouton 🏆 dans le rail, panneau branché, démo et README"
```

---

## Procédure de mise en production (rappel pour la PR)

1. Exécuter `supabase/migrations/2026-09-30-leaderboard.sql` dans le SQL Editor de prod.
2. Vérifier avec deux comptes que `select * from public.leaderboard_players()` ne renvoie ni `label` ni `url`, et que les captures non ouvertes sont absentes.
3. Merger la PR (push avec `GS_REVIEW_BYPASS=1`).

Retour arrière : `drop function public.leaderboard_players();` puis revert du front.
