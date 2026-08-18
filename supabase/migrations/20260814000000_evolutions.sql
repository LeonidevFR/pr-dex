-- Les évolutions passent côté serveur.
--
-- Elles vivaient dans `state.evolutions`, une colonne jsonb que le client réécrit en entier à
-- chaque changement. Le serveur ne les inspectait pas, avec deux conséquences :
--
--   · il acceptait d'engager à l'arène un exemplaire déjà consommé par une évolution — sa ligne
--     `catches` subsiste — ce qui donnait un duel sans rien à perdre ;
--   · et il ne pouvait pas laisser combattre un Pokémon OBTENU par évolution, faute de savoir
--     qu'il existe : l'arène cherche l'espèce dans `catches`, où une évolution n'a pas de ligne.
--
-- Une table et une RPC règlent les deux : le serveur sait enfin ce que chaque joueur possède
-- réellement, et c'est lui qui l'écrit.
--
-- À coller dans l'éditeur SQL du dashboard APRÈS la migration de l'arène et AVANT le seed :
-- c'est elle qui crée `species_evo`, que le seed remplit. La reprise, elle, ne lit que `state`
-- et ne dépend d'aucune donnée de référence. Tout est dans une transaction : en cas d'échec en
-- cours de route, rien n'est appliqué.
begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les lignées, telles que le front les connaît déjà
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Qui évolue en quoi, à quel prix, et dans quelle famille les bonbons se mettent en commun.
-- Ces trois faits vivent dans `shared/species.js` ; ils sont recopiés ici plutôt que réinventés,
-- et un test de parité interdit qu'ils divergent. Sans eux, le serveur ne peut pas valider une
-- évolution — il ne pourrait que croire le client, ce qui est précisément ce qu'on corrige.
create table if not exists public.species_evo (
  species int primary key,
  -- La racine de la lignée. Les bonbons sont communs à la famille entière : trois Chenipan et
  -- deux Chrysacier alimentent la même réserve.
  family int not null,
  -- Ce que coûte une évolution DEPUIS cette espèce. `null` pour une forme finale.
  cost int,
  -- Les espèces atteignables. Un tableau, parce qu'Évoli en a plusieurs.
  targets int[] not null default '{}'
);

alter table public.species_evo enable row level security;

create policy "species_evo_select_all" on public.species_evo
  for select using (auth.uid() is not null);

grant select on public.species_evo to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les évolutions
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.evolutions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  from_species int not null,
  to_species int not null,
  -- L'exemplaire consommé, par sa clé `source:external_id`. C'est la contrainte d'unicité
  -- ci-dessous qui fait tout le travail : un exemplaire ne se consomme qu'une fois, et la base
  -- le garantit même si deux appareils tentent l'évolution au même instant.
  from_key text not null,
  -- Le jour parisien de l'évolution, comme partout ailleurs.
  day text not null,
  created_at timestamptz not null default now(),
  unique (user_id, from_key)
);

alter table public.evolutions enable row level security;

-- Lecture de ses propres évolutions, et rien d'autre. Aucune policy d'écriture : l'unique
-- écrivain est la fonction `security definer` plus bas, qui s'exécute sous son propre droit.
-- Une policy d'insertion ici rendrait la validation contournable, ce qui viderait la migration
-- de son objet.
create policy "evolutions_select_own" on public.evolutions
  for select using (auth.uid() = user_id);

grant select on public.evolutions to authenticated;

create index evolutions_user_idx on public.evolutions (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Ce que le joueur possède réellement
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Les bonbons disponibles pour une famille.
 *
 * Gagnés : trois par capture OUVERTE de la famille — un pli non ouvert n'a pas encore été
 * rencontré. Dépensés : la somme des coûts des évolutions déjà faites depuis une espèce de la
 * famille. La colonne `state.spent` n'était que cette somme, matérialisée ; elle devient donc
 * inutile, et c'est heureux — une somme stockée finit toujours par diverger de ses termes.
 */
create or replace function public.dex_candies(uid uuid, fam int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((
    select count(*) * 3
    from public.catches c
    join public.species_evo e on e.species = c.species
    join public.state s on s.user_id = dex_candies.uid
    where c.user_id = dex_candies.uid
      and e.family = dex_candies.fam
      and s.claimed ? (c.source || ':' || c.external_id)
  ), 0) - coalesce((
    select sum(e.cost) :: int
    from public.evolutions v
    join public.species_evo e on e.species = v.from_species
    where v.user_id = dex_candies.uid and e.family = dex_candies.fam
  ), 0)
$$;

revoke execute on function public.dex_candies(uuid, int) from public;
grant execute on function public.dex_candies(uuid, int) to authenticated;

/**
 * L'espèce d'un exemplaire, quelle que soit sa provenance.
 *
 * Une capture porte la sienne dans `catches` ; un Pokémon obtenu par évolution n'y a pas de
 * ligne et vit dans `evolutions`, sous la clé `evo:<id>`. C'est cette fonction qui réconcilie
 * les deux, et c'est elle qui permettra à l'arène d'accepter enfin les formes évoluées — que
 * son seul regard sur `catches` excluait sans que personne l'ait décidé.
 */
create or replace function public.dex_species_of(uid uuid, entry_key text)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.species from public.catches c
      where c.user_id = dex_species_of.uid
        and c.source || ':' || c.external_id = dex_species_of.entry_key),
    (select v.to_species from public.evolutions v
      where v.user_id = dex_species_of.uid
        and 'evo:' || v.id = dex_species_of.entry_key)
  )
$$;

revoke execute on function public.dex_species_of(uuid, text) from public;
grant execute on function public.dex_species_of(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Évoluer
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Fait évoluer un exemplaire précis. Rend l'identifiant de l'évolution créée.
 *
 * Tout est vérifié ici, et rien n'est cru sur parole : que l'exemplaire existe et soit à
 * l'appelant, qu'il ne soit ni déjà consommé ni détruit à l'arène ni engagé dans un duel
 * ouvert, que la cible soit une évolution légitime de la source, et que les bonbons suffisent.
 *
 * `for update` sur la ligne d'état : deux appareils qui évoluent au même instant liraient
 * sinon les mêmes bonbons et les dépenseraient deux fois. L'unicité sur `(user_id, from_key)`
 * couvre le cas jumeau — le même exemplaire consommé deux fois — mais pas celui-là, où deux
 * exemplaires différents puisent dans une réserve qui n'en paie qu'un.
 */
create or replace function public.dex_evolve(
  p_from_key text, p_to int, p_day text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from int;
  v_cost int;
  v_family int;
  v_targets int[];
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'dex : appel non authentifié';
  end if;

  -- Sérialise les évolutions d'un même joueur pour la durée de la transaction.
  perform 1 from public.state where user_id = v_uid for update;

  v_from := public.dex_species_of(v_uid, p_from_key);
  if v_from is null then
    raise exception 'dex : exemplaire inconnu (%)', p_from_key;
  end if;

  if exists (select 1 from public.evolutions where user_id = v_uid and from_key = p_from_key) then
    raise exception 'dex : exemplaire déjà évolué (%)', p_from_key;
  end if;

  -- Détruit à l'arène : l'exemplaire n'existe plus. Sans ce contrôle, on pouvait perdre un
  -- duel puis faire évoluer le mort, et ressortir avec un Pokémon plus fort.
  if exists (
    select 1 from public.arena_exemplars
    where user_id = v_uid and entry_key = p_from_key and destroyed_at is not null
  ) then
    raise exception 'dex : exemplaire détruit (%)', p_from_key;
  end if;

  -- Engagé dans un défi ouvert : il est immobilisé, pas disponible. L'évoluer le ferait
  -- disparaître de sous le duel qui l'attend.
  if exists (
    select 1 from public.arena_duels d
    where d.status = 'open'
      and ((d.challenger_id = v_uid and d.challenger_key = p_from_key)
        or (d.opponent_id = v_uid and d.opponent_key = p_from_key))
  ) then
    raise exception 'dex : exemplaire engagé à l''arène (%)', p_from_key;
  end if;

  select cost, family, targets into v_cost, v_family, v_targets
  from public.species_evo where species = v_from;

  if v_cost is null or not (p_to = any(v_targets)) then
    raise exception 'dex : % n''évolue pas en %', v_from, p_to;
  end if;

  if public.dex_candies(v_uid, v_family) < v_cost then
    raise exception 'dex : bonbons insuffisants (% requis)', v_cost;
  end if;

  insert into public.evolutions (user_id, from_species, to_species, from_key, day)
  values (v_uid, v_from, p_to, p_from_key, p_day)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.dex_evolve(text, int, text) from public;
grant execute on function public.dex_evolve(text, int, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. La reprise des évolutions déjà faites
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Trois semaines d'évolutions vivent dans `state.evolutions`. On les transpose telles quelles,
-- sans rien valider : elles ont été faites sous l'ancien régime et le passé ne se rejuge pas.
-- L'ordre du tableau est conservé — `with ordinality` — parce que la clé `evo:<id>` d'un
-- Pokémon obtenu par évolution en dépend, et qu'une évolution en chaîne peut désigner comme
-- source un exemplaire produit par une évolution précédente.
--
-- `fromSha` est lu en repli : c'est le nom qu'avait `fromKey` avant le passage à Supabase, et
-- d'anciennes entrées le portent encore.
/**
 * La reprise, en fonction plutôt qu'en instruction posée là : c'est la seule partie de cette
 * migration qui touche à des données réelles, et une instruction noyée dans un fichier ne se
 * teste pas. Ainsi elle s'exécute contre une base de démonstration avant de s'exécuter contre
 * la vôtre, et elle rend le nombre de lignes reprises.
 *
 * Idempotente : la rejouer ne duplique rien, l'unicité `(user_id, from_key)` s'en charge.
 */
create or replace function public.dex_backfill_evolutions()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  insert into public.evolutions (user_id, from_species, to_species, from_key, day, created_at)
  select s.user_id,
         (e.item ->> 'from') :: int,
         (e.item ->> 'species') :: int,
         coalesce(e.item ->> 'fromKey', e.item ->> 'fromSha'),
         coalesce(e.item ->> 'date', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD')),
         -- Un instant croissant dans l'ordre du tableau : `created_at` ne sert qu'à départager,
         -- et l'ordre est la seule chose que l'ancien format garantissait.
         now() + (e.ord * interval '1 microsecond')
  from public.state s,
       lateral jsonb_array_elements(s.evolutions) with ordinality as e(item, ord)
  where e.item ->> 'from' is not null
    and coalesce(e.item ->> 'fromKey', e.item ->> 'fromSha') is not null
  on conflict (user_id, from_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.dex_backfill_evolutions() from public;
grant execute on function public.dex_backfill_evolutions() to service_role;

-- La reprise elle-même, une fois.
select public.dex_backfill_evolutions();

-- Contrôle de la reprise, à lire dans le résultat : les deux comptes doivent être égaux, et la
-- somme des coûts repris doit retomber sur les `spent` que le client avait matérialisés.
--
--   select (select count(*) from public.evolutions) as reprises,
--          (select sum(jsonb_array_length(evolutions)) from public.state) as attendues;
--
-- Un écart signifie qu'une entrée n'avait ni `fromKey` ni `fromSha` — donc écrite par une
-- version antérieure à la clé d'exemplaire — et demande un examen à la main avant de merger.
--
-- Ce contrôle n'est juste qu'À CET INSTANT : dès que l'application tourne, elle écrit des
-- évolutions neuves qui n'ont aucune contrepartie dans `state.evolutions`, laissé figé. Le
-- relancer plus tard le montrerait en écart sans qu'il y ait le moindre problème.

commit;
