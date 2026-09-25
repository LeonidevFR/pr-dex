# Mode arène — Lot 2c : la RPC atomique, les plafonds, et la concurrence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écrire la seule chose du mode qui modifie l'état du jeu — engager un exemplaire, relever un défi — de sorte que deux joueurs qui relèvent le même défi à la même milliseconde ne détruisent jamais deux Pokémon pour un seul duel.

**Architecture:** Deux fonctions `security definer` dans la migration d'arène, seules écrivaines des tables du mode. Elles s'appuient sur le moteur de combat SQL du lot 2b, dont la parité avec le JavaScript est déjà prouvée. Un pli gagné n'est pas tiré ici : il est **enregistré comme dû**, et l'Action existante le matérialisera avec le moteur de tirage JavaScript — `catches` garde ainsi son écrivain unique et on évite de porter `drawFrom` en SQL.

**Tech Stack:** PostgreSQL 17 (CLI Supabase, Docker), `pg` en dépendance de développement, Vitest 3.

## Global Constraints

- **Spec de référence :** `docs/superpowers/specs/2026-08-10-mode-arene-design.md`, sections 2 et 4.
- **Ces fonctions sont le seul écrivain des tables d'arène.** Aucune policy d'écriture n'existe ni ne doit être ajoutée : c'est ce qui garantit qu'un joueur ne peut ni s'attribuer un niveau ni effacer sa défaite.
- **Tout dans une transaction, et le verrou avant la lecture.** `select … for update` sur la ligne du défi **avant** toute vérification : sans lui, deux acceptations concurrentes lisent toutes deux « ouvert » et résolvent toutes deux.
- **`security definer` implique `set search_path = public`** et un `revoke execute … from public` suivi d'un `grant execute … to authenticated`. Une fonction élevée en privilèges dont le chemin de recherche est manipulable est une faille.
- **Le moteur de combat ne se réécrit pas.** `arena_resolve` du lot 2b fait foi ; ces RPC l'appellent, elles ne recalculent rien.
- **Langue :** commentaires SQL, noms de tests et messages de commit en **français** ; identifiants en **anglais**.
- **Une seule migration**, `supabase/migrations/20260811000000_arena.sql`, où tout s'ajoute avant le `commit;` final.
- `set local role` ne vaut que dans une transaction — hors transaction, la requête tourne en propriétaire de table et RLS est contournée sans erreur.
- **Ne pas pousser** sans demande explicite ; préfixer tout `git commit` par `GS_REVIEW_BYPASS=1`.

## Ce que ce lot ne fait pas

Il ne matérialise pas les plis gagnés en captures — il les enregistre comme dus. Il ne résout pas les défis périmés à 24 h. Il ne touche à aucune interface. Ces trois points forment le lot 2d.

---

### Task 1: Les crédits, déduits et jamais stockés

La spec (§ 2) accorde **1 crédit par jour ouvré, cumulable jusqu'à 5, remis à zéro le dimanche à 23h59**. Un compteur stocké se désynchroniserait ; une soustraction se recalcule à chaque appel et ne peut pas mentir.

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-credits.test.js`

**Interfaces:**
- Produces: `arena_week_start(at timestamptz) returns date` — le lundi de la semaine de `at`.
- Produces: `arena_credits(uid uuid, at timestamptz) returns int` — crédits restants, entre 0 et 5.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `scripts/arena-credits.test.js` :

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { withDb, dbAvailable } from './db-test-helper.mjs'

const disponible = await dbAvailable()
const JOUEUR = 'c1c1c1c1-0000-0000-0000-000000000001'

describe.skipIf(!disponible)('crédits d’engagement', () => {
  beforeAll(async () => {
    await withDb((c) => c.query(`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'credits@test.local', '', now(), now(), now())
      on conflict (id) do nothing
    `, [JOUEUR]))
  })

  const credits = (jour) => withDb((c) =>
    c.query('select arena_credits($1, $2::timestamptz) as n', [JOUEUR, jour])
      .then((r) => r.rows[0].n))

  it('place le début de semaine au lundi', async () => {
    const rows = await withDb((c) => c.query(`
      select arena_week_start('2026-08-11'::timestamptz) as mardi,
             arena_week_start('2026-08-10'::timestamptz) as lundi,
             arena_week_start('2026-08-16'::timestamptz) as dimanche
    `).then((r) => r.rows[0]))
    expect(String(rows.mardi)).toContain('2026-08-10')
    expect(String(rows.lundi)).toContain('2026-08-10')
    expect(String(rows.dimanche)).toContain('2026-08-10')
  })

  // 1 crédit par jour ouvré écoulé, week-end compris dans la semaine mais sans en ajouter.
  it('accorde un crédit par jour ouvré écoulé', async () => {
    expect(await credits('2026-08-10T12:00:00Z')).toBe(1)  // lundi
    expect(await credits('2026-08-12T12:00:00Z')).toBe(3)  // mercredi
    expect(await credits('2026-08-14T12:00:00Z')).toBe(5)  // vendredi
  })

  it('plafonne à cinq, week-end compris', async () => {
    expect(await credits('2026-08-15T12:00:00Z')).toBe(5)  // samedi
    expect(await credits('2026-08-16T23:00:00Z')).toBe(5)  // dimanche
  })

  it('repart à un le lundi suivant', async () => {
    expect(await credits('2026-08-17T09:00:00Z')).toBe(1)
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx vitest run scripts/arena-credits.test.js`
Expected: FAIL — `function arena_week_start(timestamptz) does not exist`

- [ ] **Step 3: Écrire les fonctions**

```sql
-- Le lundi de la semaine, en heure de Paris — c'est le fuseau de l'équipe, et une remise à
-- zéro « dimanche 23h59 » ne veut rien dire sans lui.
create or replace function public.arena_week_start(at timestamptz)
returns date language sql immutable strict as $$
  select (date_trunc('week', at at time zone 'Europe/Paris')) :: date
$$;

-- Déduits, jamais stockés : jours ouvrés écoulés depuis lundi, moins les duels déjà joués,
-- plafonné à 5. Un compteur stocké finirait par diverger de la réalité qu'il prétend décrire ;
-- une soustraction se recalcule à chaque appel et ne peut pas mentir.
create or replace function public.arena_credits(uid uuid, at timestamptz default now())
returns int language sql stable as $$
  select greatest(0, least(5, (
    select count(*) from generate_series(
      public.arena_week_start(at),
      least((at at time zone 'Europe/Paris') :: date, public.arena_week_start(at) + 4),
      interval '1 day') d
    where extract(isodow from d) <= 5
  ) :: int - (
    select count(*) :: int from public.arena_duels
    where (challenger_id = uid or opponent_id = uid)
      and created_at >= public.arena_week_start(at)
  )))
$$;
```

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-credits.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-credits.test.js
git commit -m "feat(db): crédits d'engagement déduits du calendrier, jamais stockés"
```

---

### Task 2: Engager un exemplaire

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-engage.test.js`

**Interfaces:**
- Produces: `arena_engage(p_entry_key text, p_vs_computer boolean default false) returns bigint` — l'identifiant du duel créé.
- Produces: table `arena_packs (id bigint identity, user_id uuid, tier text, duel_id bigint, created_at, claimed_at)` — les plis dus, que le lot 2d matérialisera en captures.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `scripts/arena-engage.test.js`. Le fichier doit vérifier, en appelant la fonction sous le rôle `authenticated` avec les claims du joueur :

- un joueur peut poster un défi ouvert, et le duel créé porte `status = 'open'`, son identifiant et sa mise ;
- **la mise n'est lisible par personne** via `arena_open_challenges` ;
- engager consomme un crédit — `arena_credits` décroît de un ;
- **on ne peut pas engager un exemplaire qu'on ne possède pas** (clé absente de `catches` pour ce joueur) ;
- **on ne peut pas engager deux fois le même exemplaire** tant que le premier défi est ouvert ;
- **on ne peut pas engager un exemplaire détruit** ;
- sans crédit, l'appel échoue avec un message explicite ;
- contre l'ordinateur, le duel est immédiatement résolu (`status = 'computer'`), le portefeuille crédité au **cinquième** du tarif humain, **aucun point de classement**, **aucun pli**, **aucun exemplaire détruit** et **aucun niveau gagné**.

Chaque refus doit lever avec un message distinct : un test qui accepte n'importe quelle erreur passerait pour la mauvaise raison — le lot 2a en a fait l'expérience.

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx vitest run scripts/arena-engage.test.js`
Expected: FAIL — `function arena_engage(text, boolean) does not exist`

- [ ] **Step 3: Écrire la table et la fonction**

`arena_packs` d'abord, avec sa policy de lecture et son `grant select`. Puis `arena_engage`, en `security definer` avec `set search_path = public`, `revoke execute from public` et `grant execute to authenticated`.

Points de conception à respecter :

- **Vérifier la propriété de l'exemplaire contre `catches`**, jamais contre un paramètre : c'est la seule source de vérité sur ce que possède un joueur.
- **Un exemplaire déjà engagé dans un défi ouvert ne peut pas l'être une seconde fois** — sinon un joueur miserait deux fois le même Pokémon et n'en perdrait qu'un.
- **Contre l'ordinateur, rien n'est détruit ni créé.** Il ne possède rien : s'il détruisait un exemplaire, un Pokémon disparaîtrait sans contrepartie ; s'il donnait un pli, il en apparaîtrait un depuis rien. Il paye des pokédollars, au cinquième du tarif humain, et rien d'autre — pas même un niveau, sans quoi on monterait un champion sans jamais rien risquer.
- **Son combattant se tire dans une distribution ordinaire**, indépendante de la mise du joueur, et son gain suit la règle de l'enjeu : engager un légendaire contre lui ne doit pas payer davantage qu'engager un rare.

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-engage.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-engage.test.js
git commit -m "feat(db): engager un exemplaire, en défi ouvert ou contre l'ordinateur"
```

---

### Task 3: Relever un défi

**Files:**
- Modify: `supabase/migrations/20260811000000_arena.sql`
- Test: `scripts/arena-accept.test.js`

**Interfaces:**
- Produces: `arena_accept(p_duel_id bigint, p_entry_key text) returns bigint`

- [ ] **Step 1: Écrire les tests qui échouent**

Le fichier doit vérifier :

- un duel relevé passe en `status = 'resolved'`, avec un vainqueur, les deux puissances, la probabilité et le tirage **conservés** — c'est ce qui rend le résumé de combat vérifiable plutôt que croyable ;
- **l'exemplaire du perdant est détruit** (`destroyed_at` renseigné) et celui du vainqueur **ne l'est pas** ;
- **le vainqueur gagne un niveau** conforme au barème, plafonné à 10 ;
- **le vainqueur reçoit pokédollars, points et un pli**, tous trois au palier de **l'enjeu** — le plus petit des deux engagements ;
- **le perdant ne reçoit rien** ;
- on ne peut pas relever **son propre** défi ;
- on ne peut pas relever un défi **déjà résolu** ;
- **le plafond de deux duels par semaine et par paire** est respecté : le troisième contre la même personne échoue ;
- sans crédit, l'appel échoue.

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx vitest run scripts/arena-accept.test.js`
Expected: FAIL

- [ ] **Step 3: Écrire la fonction**

L'ordre des opérations n'est pas négociable :

```
1. select … from arena_duels where id = … for update   ← LE VERROU, avant toute vérification
2. vérifier status = 'open'
3. vérifier que l'appelant n'est pas le challenger
4. vérifier la propriété et la disponibilité de son exemplaire
5. vérifier ses crédits
6. vérifier le plafond hebdomadaire par paire
7. appeler arena_resolve
8. écrire : destruction, niveau, portefeuille, points, pli dû, statut du duel
```

Le verrou en premier est ce qui rend l'ensemble atomique : deux acceptations concurrentes du même défi se sérialisent, la seconde voit `status = 'resolved'` et échoue proprement. Toute vérification faite **avant** le verrou serait une vérification sur un état déjà périmé — c'est exactement la classe de bug qui a produit, dans ce projet, une double dépense de bonbons (cf. NOTES.md).

- [ ] **Step 4: Appliquer et vérifier**

Run: `npm run db:reset` puis `npx vitest run scripts/arena-accept.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260811000000_arena.sql scripts/arena-accept.test.js
git commit -m "feat(db): relever un défi, résolution atomique sous verrou"
```

---

### Task 4: La concurrence, éprouvée pour de vrai

C'est le test qui justifie tout le lot. Les précédents vérifient la logique ; celui-ci vérifie qu'elle tient quand deux joueurs cliquent à la même milliseconde.

**Files:**
- Test: `scripts/arena-concurrency.test.js`

- [ ] **Step 1: Écrire le test**

Deux connexions Postgres **distinctes** — deux clients `pg`, pas deux requêtes sur le même — appellent `arena_accept` sur le **même** défi, lancées ensemble par un `Promise.all`. Vérifier ensuite :

- **exactement une** des deux réussit ;
- l'autre échoue avec un message explicite disant que le défi n'est plus ouvert ;
- le duel est résolu **une seule fois** ;
- **un seul exemplaire est détruit**, pas deux ;
- **un seul pli est dû**, pas deux ;
- les pokédollars du vainqueur n'ont été crédités **qu'une fois**.

Répéter l'expérience une vingtaine de fois sur des défis différents : une course qui ne se produit qu'une fois sur cinq passerait inaperçue sur un seul essai.

**Puis prouver que le test détecte réellement le problème** : retirer temporairement le `for update` de la fonction, relancer, et vérifier que le test **rougit**. S'il reste vert sans le verrou, c'est qu'il ne teste rien — et il faut le dire plutôt que de conclure. Remettre le verrou ensuite, et rapporter le résultat des deux passages.

- [ ] **Step 2: Lancer**

Run: `npx vitest run scripts/arena-concurrency.test.js`
Expected: PASS

- [ ] **Step 3: Lancer toute la suite**

Run: `npm test`
Expected: PASS — les 464 tests précédents ne bougent pas

- [ ] **Step 4: Commit**

```bash
git add scripts/arena-concurrency.test.js
git commit -m "test: deux acceptations simultanées ne détruisent qu'un seul exemplaire"
```

---

## À la fin du lot

Rendre un compte rendu portant : le résultat des deux passages du test de concurrence (avec et sans le verrou), tout écart à la spec, et la liste de ce que le lot 2d devra reprendre — matérialisation des plis dus en captures, résolution des défis périmés à 24 h.
