-- Instantané du schéma public de PR-DEX, généré par `npm run db:dump`. NE PAS ÉDITER.
--
-- La source, ce sont les migrations de `supabase/migrations/`, appliquées dans l'ordre : c'est
-- ainsi que `supabase db reset` fabrique la base locale et que la production se met à jour.
-- Ce fichier sert à lire le schéma d'un coup d'œil et à voir son évolution en review.
-- `npm run db:check` vérifie qu'il est à jour.
--
-- Il ne suffit pas à fabriquer une base neuve : les triggers posés sur `auth.users` et
-- `auth.identities`, les extensions et les tâches `pg_cron` n'appartiennent pas au schéma
-- public et n'y figurent pas.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."achievement_counts"() RETURNS TABLE("code" "text", "players" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select a.code, count(*)::integer from public.achievements a group by a.code;
$$;


ALTER FUNCTION "public"."achievement_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_accept"("p_duel_id" bigint, "p_entry_key" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_duel record;
  v_species int;
  v_tier text;
  v_level int;
  v_destroyed timestamptz;
  v_foe_species int;
  v_foe_tier text;
  v_foe_level int;
  v_stake text;
  v_out record;
  v_winner uuid;
  v_winner_key text;
  v_loser uuid;
  v_loser_key text;
  v_day text := to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD');
begin
  perform public.arena_assert_open();
  if v_uid is null then
    raise exception 'arene : appel non authentifié';
  end if;

  -- 1. LE VERROU, avant toute vérification. `for update` bloque la seconde transaction jusqu'à
  -- la fin de la première ; elle relit alors la ligne dans son état COMMITTÉ le plus récent,
  -- y voit `status = 'resolved'` et échoue proprement à l'étape suivante. Sans lui, les deux
  -- liraient « ouvert » en même temps.
  select * into v_duel from public.arena_duels d where d.id = p_duel_id for update;

  if v_duel.id is null then
    raise exception 'arene : défi introuvable (%)', p_duel_id;
  end if;

  -- 2. Le défi est-il encore à prendre ? C'est la vérification que le verrou rend fiable :
  -- posée après lui, elle porte sur l'état réel et non sur une lecture d'il y a un instant.
  if v_duel.status <> 'open' then
    raise exception 'arene : ce défi n''est plus ouvert';
  end if;

  -- 3. On ne joue pas contre soi-même : ni la destruction, ni le pli, ni les points n'auraient
  -- de sens, et le plafond hebdomadaire par paire deviendrait contournable.
  if v_duel.challenger_id = v_uid then
    raise exception 'arene : on ne relève pas son propre défi';
  end if;

  -- Sérialise les acceptations d'un même preneur, pour la même raison que dans `arena_engage`
  -- et sans conflit avec le verrou ci-dessus : les crédits et le plafond par paire sont DÉDUITS
  -- des duels enregistrés, donc deux acceptations simultanées de DEUX défis différents par le
  -- même joueur liraient toutes deux le solde d'avant. Pris après le verrou de ligne, jamais
  -- avant : l'ordre est le même pour tout le monde, donc aucun interblocage.
  perform pg_advisory_xact_lock(hashtextextended(v_uid :: text, 0));

  -- 4. La propriété se lit dans `catches`, seule source de vérité sur ce qu'un joueur possède.
  -- `dex_species_of` et non une lecture directe de `catches` : un Pokémon obtenu par évolution
  -- n'a pas de ligne de capture, et l'arène l'excluait donc du jeu sans que personne l'ait
  -- décidé — les formes évoluées, souvent les plus belles bêtes, ne pouvaient pas combattre.
  -- La fonction cherche dans les deux endroits, et vérifie l'appartenance dans les deux.
  v_species := public.dex_species_of(v_uid, p_entry_key);

  if v_species is null then
    raise exception 'arene : exemplaire non possédé (%)', p_entry_key;
  end if;

  -- Consommé par une évolution : sa ligne de capture subsiste, mais l'exemplaire n'existe plus.
  -- Sans ce contrôle, on pouvait faire évoluer son Pikachu puis engager le Pikachu disparu — un
  -- duel sans rien à perdre, puisqu'il n'était déjà plus là.
  if exists (
    select 1 from public.evolutions where user_id = v_uid and from_key = p_entry_key
  ) then
    raise exception 'arene : exemplaire déjà évolué (%)', p_entry_key;
  end if;

  select e.level, e.destroyed_at into v_level, v_destroyed
  from public.arena_exemplars e
  where e.user_id = v_uid and e.entry_key = p_entry_key;
  v_level := coalesce(v_level, 1);

  if v_destroyed is not null then
    raise exception 'arene : exemplaire détruit (%)', p_entry_key;
  end if;

  -- Un exemplaire déjà posé sur un autre défi ouvert serait misé deux fois pour n'en perdre
  -- qu'un. Le duel qu'on relève ne compte pas : il appartient au challenger, pas à nous.
  if exists (
    select 1 from public.arena_duels d
    where d.status = 'open'
      and ((d.challenger_id = v_uid and d.challenger_key = p_entry_key)
        or (d.opponent_id = v_uid and d.opponent_key = p_entry_key))
  ) then
    raise exception 'arene : exemplaire déjà engagé (%)', p_entry_key;
  end if;

  -- 5. Vérifié APRÈS la propriété : « tu n'as plus de crédit » sur un exemplaire qu'on ne
  -- possède pas serait un diagnostic faux, et enverrait le joueur attendre demain pour rien.
  if public.arena_credits(v_uid) <= 0 then
    raise exception 'arene : aucun crédit d''engagement disponible cette semaine';
  end if;

  -- 6. Deux duels par semaine et par paire (§ 2). Le compte porte sur les duels DÉJÀ joués
  -- entre ces deux joueurs cette semaine — celui qu'on est en train de relever n'a pas encore
  -- d'opponent_id, il ne peut donc pas se compter lui-même. Même convention de semaine que les
  -- crédits, `arena_week_start`, pour que les deux limites ne se décalent jamais l'une de
  -- l'autre.
  if (
    select count(*) from public.arena_duels d
    where ((d.challenger_id = v_uid and d.opponent_id = v_duel.challenger_id)
        or (d.challenger_id = v_duel.challenger_id and d.opponent_id = v_uid))
      and d.created_at >= (public.arena_week_start(now()) :: timestamp
                           at time zone 'Europe/Paris')
  ) >= 2 then
    raise exception 'arene : deux duels par semaine maximum contre le même joueur';
  end if;

  -- Le palier des deux camps. Celui du challenger se relit de son espèce, elle-même relue de
  -- sa capture : la mise n'est jamais recopiée dans le duel autrement que comme `stake_tier`,
  -- qui portera l'ENJEU et non l'engagement.
  select c.species into v_foe_species
  from public.catches c
  where c.user_id = v_duel.challenger_id
    and c.source || ':' || c.external_id = v_duel.challenger_key;

  if v_foe_species is null then
    raise exception 'arene : le défi porte un exemplaire introuvable (%)', v_duel.challenger_key;
  end if;

  select coalesce(e.level, 1) into v_foe_level
  from public.arena_exemplars e
  where e.user_id = v_duel.challenger_id and e.entry_key = v_duel.challenger_key;
  v_foe_level := coalesce(v_foe_level, 1);

  select s.tier into v_tier from public.species_stats s where s.species = v_species;
  select s.tier into v_foe_tier from public.species_stats s where s.species = v_foe_species;
  if v_tier is null or v_foe_tier is null then
    raise exception 'arene : espèce inconnue (% ou %)', v_species, v_foe_species;
  end if;

  -- 7. La résolution, et rien d'autre : le moteur est `arena_resolve`, on ne recalcule rien
  -- ici. Le challenger est le camp `left` — mais `arena_resolve` confronte le tirage au camp
  -- canoniquement premier, donc l'issue ne dépend pas de cet ordre. La graine est
  -- l'identifiant du duel, dérivé d'une clé d'identité : stable une fois écrite, elle laisse
  -- le client rejouer le combat et retomber sur le même vainqueur.
  select * into v_out from public.arena_resolve(
    v_duel.challenger_key, v_foe_species, v_foe_level, coalesce(v_duel.challenger_day, v_day),
    p_entry_key, v_species, v_level, v_day,
    'duel:' || v_duel.id);

  -- L'enjeu : le plus PETIT des deux engagements. Battre un rare ne rapporte 250 que si les
  -- DEUX ont engagé un rare.
  v_stake := public.arena_covered_tier(v_tier, v_foe_tier);

  if v_out.winner = 'left' then
    v_winner := v_duel.challenger_id;
    v_winner_key := v_duel.challenger_key;
    v_loser := v_uid;
    v_loser_key := p_entry_key;
  else
    v_winner := v_uid;
    v_winner_key := p_entry_key;
    v_loser := v_duel.challenger_id;
    v_loser_key := v_duel.challenger_key;
  end if;

  -- 8. Les écritures. Toutes dans la même transaction que le verrou : ou bien elles arrivent
  -- ensemble, ou bien aucune n'arrive.

  -- L'exemplaire du perdant est détruit. Espèce et bonbons sont conservés — c'est l'exemplaire
  -- qui meurt, avec le niveau qu'on avait mis à le monter, et c'est là tout l'enjeu du mode.
  insert into public.arena_exemplars (user_id, entry_key, destroyed_at)
  values (v_loser, v_loser_key, now())
  on conflict (user_id, entry_key) do update set destroyed_at = excluded.destroyed_at;

  -- Le niveau du vainqueur vient de `arena_resolve`, plafond de 10 compris : un seul calcul du
  -- rapport de puissance sert au combat et au barème, aucune seconde formule.
  insert into public.arena_exemplars (user_id, entry_key, level, wins)
  values (v_winner, v_winner_key, v_out.level_after, 1)
  on conflict (user_id, entry_key) do update
    set level = excluded.level, wins = arena_exemplars.wins + 1;

  -- Pokédollars, points et pli : au vainqueur SEULEMENT, et tous trois au palier de l'enjeu.
  -- Le perdant ne reçoit rien — un lot de consolation rendrait la défaite indolore alors
  -- qu'elle vient de coûter un Pokémon.
  insert into public.arena_wallet (user_id, pokedollars)
  values (v_winner, public.arena_reward_dollars(v_stake))
  on conflict (user_id) do update
    set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;

  insert into public.arena_season_points (user_id, season, points)
  values (v_winner, public.arena_season(now()), public.arena_reward_points(v_stake))
  on conflict (user_id, season) do update
    set points = arena_season_points.points + excluded.points;

  -- Un pli DÛ, pas encore une capture : le lot 2d le matérialisera en ligne `catches` de
  -- source `arene`. La dette et son règlement sont deux moments distincts, et une panne entre
  -- les deux ne doit pas faire disparaître le dû.
  insert into public.arena_packs (user_id, tier, duel_id) values (v_winner, v_stake, v_duel.id);

  -- Les deux puissances, la probabilité et le tirage sont CONSERVÉS. Ce n'est pas de la
  -- traçabilité de confort : une issue probabiliste sans explication passe pour arbitraire,
  -- surtout quand elle vient de détruire un Pokémon. Le résumé de combat les rejoue, et
  -- n'importe qui peut refaire le calcul.
  update public.arena_duels set
    opponent_id = v_uid,
    opponent_key = p_entry_key,
    status = 'resolved',
    winner_id = v_winner,
    stake_tier = v_stake,
    challenger_power = v_out.left_power,
    opponent_power = v_out.right_power,
    -- Attention aux noms : ici `v_foe_*` désigne le CHALLENGER — l'adversaire de celui qui
    -- relève — et `v_species`/`v_level` l'exemplaire de l'appelant. L'inverse des deux autres
    -- écrivains, où l'appelant EST le challenger.
    challenger_species = v_foe_species,
    opponent_species = v_species,
    challenger_level = v_foe_level,
    opponent_level = v_level,
    -- Deux jours, et c'est voulu : chacun combat avec la forme qu'il avait sous les yeux au
    -- moment d'engager. `coalesce` pour les défis postés avant l'existence de la colonne.
    challenger_form = public.arena_form_index(
      v_duel.challenger_key, coalesce(v_duel.challenger_day, v_day)),
    opponent_form = public.arena_form_index(p_entry_key, v_day),
    probability = v_out.probability,
    roll = v_out.roll,
    resolved_at = now()
  where id = v_duel.id;

  return v_duel.id;
end;
$$;


ALTER FUNCTION "public"."arena_accept"("p_duel_id" bigint, "p_entry_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_assert_open"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
begin
  if now() < coalesce((select opens_at from public.arena_opening),
                      timestamptz '2026-12-01 00:00:00 Europe/Paris') then
    raise exception 'arene : l''arène ouvre le 1er décembre';
  end if;
end;
$$;


ALTER FUNCTION "public"."arena_assert_open"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_buy"("p_slug" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_art record;
  v_solde int;
  v_pack bigint;
begin
  perform public.arena_assert_open();
  if v_uid is null then
    raise exception 'arene : il faut être connecté pour acheter';
  end if;

  select * into v_art from public.arena_shop where slug = p_slug;
  if v_art.slug is null then
    raise exception 'boutique : article inconnu (%)', p_slug;
  end if;

  -- `for update` : deux achats simultanés ne doivent pas lire le même solde et le dépenser
  -- deux fois. Même raison que le verrou de `arena_accept`, sur une ressource différente.
  select pokedollars into v_solde from public.arena_wallet where user_id = v_uid for update;
  v_solde := coalesce(v_solde, 0);

  if v_solde < v_art.price then
    raise exception 'boutique : il manque % pokédollars', v_art.price - v_solde;
  end if;

  update public.arena_wallet set pokedollars = pokedollars - v_art.price where user_id = v_uid;

  insert into public.arena_packs (user_id, tier, gen, fresh)
  values (v_uid, v_art.tier, v_art.gen, v_art.fresh)
  returning id into v_pack;

  return v_pack;
end;
$$;


ALTER FUNCTION "public"."arena_buy"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_close_finished_seasons"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_season text;
  v_podium int[] := array[1000, 500, 250];
  v_n int := 0;
begin
  for v_season in
    select distinct p.season from public.arena_season_points p
    where p.season <> public.arena_season(now())
      -- Comparaison textuelle : le format `AAAA-SN` se trie dans l'ordre chronologique tant
      -- que le numéro tient sur un chiffre, ce que six saisons par an garantissent.
      and p.season >= public.arena_first_season()
      and not exists (select 1 from public.arena_seasons s where s.season = p.season)
    order by 1
  loop
    insert into public.arena_seasons (season) values (v_season);

    -- `rank` et non `row_number` : des ex aequo partagent la marche, comme au classement
    -- affiché. Un groupe de `n` ex aequo classé `r` occupe les places r à r + n - 1 ; il se
    -- partage les primes de celles qui sont sur le podium, arrondies à l'unité inférieure.
    with c as (
      select user_id, points,
             rank() over (order by points desc) :: int as r,
             count(*) over (partition by points) :: int as n
      from public.arena_season_points where season = v_season
    )
    insert into public.arena_season_podium (season, user_id, rank, prize)
    select v_season, c.user_id, c.r,
           (select coalesce(sum(v_podium[k]), 0) from generate_series(c.r, least(c.r + c.n - 1, 3)) k)
             / c.n
    from c where c.r <= 3;

    insert into public.arena_wallet (user_id, pokedollars)
    select user_id, prize from public.arena_season_podium where season = v_season and prize > 0
    on conflict (user_id) do update
      set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;


ALTER FUNCTION "public"."arena_close_finished_seasons"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_computer_pick"("seed" "text", "level_cap" integer) RETURNS TABLE("foe_species" integer, "foe_tier" "text", "foe_level" integer)
    LANGUAGE "sql" STABLE STRICT
    AS $$
  with t as (
    select case
      when public.fnv1a(arena_computer_pick.seed || ':ia-palier') :: double precision
             / 4294967296 :: double precision < 0.20 then 'c'
      when public.fnv1a(arena_computer_pick.seed || ':ia-palier') :: double precision
             / 4294967296 :: double precision < 0.65 then 'u'
      else 'r' end :: text as tier
  ),
  pool as (
    -- `order by` explicite : sans lui l'ordre d'agrégation dépendrait du plan, et la même
    -- graine ne rendrait pas toujours la même espèce.
    select t.tier, array_agg(s.species order by s.species) as ids
    from t join public.species_stats s on s.tier = t.tier
    group by t.tier
  )
  select pool.ids[(public.fnv1a(arena_computer_pick.seed || ':ia-espece')
                   % array_length(pool.ids, 1)) :: int + 1],
         pool.tier,
         (public.fnv1a(arena_computer_pick.seed || ':ia-niveau')
          % greatest(1, arena_computer_pick.level_cap)) :: int + 1
  from pool
$$;


ALTER FUNCTION "public"."arena_computer_pick"("seed" "text", "level_cap" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_covered_tier"("a" "text", "b" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select case when array_position(array['c', 'u', 'r', 'l'], a)
                <= array_position(array['c', 'u', 'r', 'l'], b)
              then a else b end
$$;


ALTER FUNCTION "public"."arena_covered_tier"("a" "text", "b" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_credits"("uid" "uuid", "at" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null and uid is distinct from auth.uid() then
    raise exception 'arene : crédits d''un autre joueur';
  end if;
  return greatest(0,
    least(5, extract(isodow from at at time zone 'Europe/Paris') :: int)
    - (
      select count(*) :: int
      from public.arena_duels d
      where (d.challenger_id = arena_credits.uid or d.opponent_id = arena_credits.uid)
        and d.created_at >= (public.arena_week_start(arena_credits.at) :: timestamp
                             at time zone 'Europe/Paris')
        and d.created_at <= arena_credits.at
    ));
end;
$$;


ALTER FUNCTION "public"."arena_credits"("uid" "uuid", "at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_engage"("p_entry_key" "text", "p_vs_computer" boolean DEFAULT false) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_species int;
  v_tier text;
  v_level int;
  v_destroyed timestamptz;
  v_duel_id bigint;
  v_foe_key text;
  v_stake text;
  v_foe record;
  v_out record;
  v_day text := to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD');
  v_seed text;
begin
  perform public.arena_assert_open();
  if v_uid is null then
    raise exception 'arene : appel non authentifié';
  end if;

  -- Sérialise les engagements d'un même joueur pour la durée de la transaction. Les crédits
  -- sont DÉDUITS des duels déjà enregistrés : deux appels simultanés liraient tous les deux le
  -- solde d'avant et dépenseraient un crédit qui n'existe qu'une fois — la classe de bug de la
  -- double dépense de bonbons déjà rencontrée dans ce projet. Le verrou ne gêne personne : il
  -- ne bloque qu'un joueur contre lui-même.
  perform pg_advisory_xact_lock(hashtextextended(v_uid :: text, 0));

  -- La propriété se lit dans `catches`, seule source de vérité sur ce qu'un joueur possède.
  -- `dex_species_of` et non une lecture directe de `catches` : un Pokémon obtenu par évolution
  -- n'a pas de ligne de capture, et l'arène l'excluait donc du jeu sans que personne l'ait
  -- décidé — les formes évoluées, souvent les plus belles bêtes, ne pouvaient pas combattre.
  -- La fonction cherche dans les deux endroits, et vérifie l'appartenance dans les deux.
  v_species := public.dex_species_of(v_uid, p_entry_key);

  if v_species is null then
    raise exception 'arene : exemplaire non possédé (%)', p_entry_key;
  end if;

  -- Consommé par une évolution : sa ligne de capture subsiste, mais l'exemplaire n'existe plus.
  -- Sans ce contrôle, on pouvait faire évoluer son Pikachu puis engager le Pikachu disparu — un
  -- duel sans rien à perdre, puisqu'il n'était déjà plus là.
  if exists (
    select 1 from public.evolutions where user_id = v_uid and from_key = p_entry_key
  ) then
    raise exception 'arene : exemplaire déjà évolué (%)', p_entry_key;
  end if;

  -- Aucune ligne `arena_exemplars` pour un exemplaire jamais engagé : c'est le cas NORMAL, et
  -- il vaut niveau 1, non détruit. On ne crée pas la ligne ici — un engagement ne change rien
  -- à l'exemplaire tant que le duel n'est pas résolu.
  select e.level, e.destroyed_at into v_level, v_destroyed
  from public.arena_exemplars e
  where e.user_id = v_uid and e.entry_key = p_entry_key;
  v_level := coalesce(v_level, 1);

  if v_destroyed is not null then
    raise exception 'arene : exemplaire détruit (%)', p_entry_key;
  end if;

  -- Les deux camps sont couverts : un exemplaire immobilisé l'est qu'on ait posté le défi ou
  -- qu'on l'ait relevé. Seuls les duels OUVERTS immobilisent — un duel résolu a rendu son
  -- exemplaire (ou l'a détruit, et c'est `destroyed_at` qui le dit).
  if exists (
    select 1 from public.arena_duels d
    where d.status = 'open'
      and ((d.challenger_id = v_uid and d.challenger_key = p_entry_key)
        or (d.opponent_id = v_uid and d.opponent_key = p_entry_key))
  ) then
    raise exception 'arene : exemplaire déjà engagé (%)', p_entry_key;
  end if;

  -- Vérifié APRÈS la propriété : « tu n'as plus de crédit » sur un exemplaire qu'on ne possède
  -- pas serait un diagnostic faux, et enverrait le joueur attendre demain pour rien.
  if public.arena_credits(v_uid) <= 0 then
    raise exception 'arene : aucun crédit d''engagement disponible cette semaine';
  end if;

  select s.tier into v_tier from public.species_stats s where s.species = v_species;
  if v_tier is null then
    raise exception 'arene : espèce inconnue (%)', v_species;
  end if;

  if not p_vs_computer then
    -- Un défi ouvert porte sa mise en base sans la rendre lisible : la policy exclut les duels
    -- ouverts et la vue `arena_open_challenges` n'expose pas la colonne. On relève à l'aveugle.
    insert into public.arena_duels (challenger_id, challenger_key, status, stake_tier, challenger_day)
    values (v_uid, p_entry_key, 'open', v_tier, v_day)
    returning id into v_duel_id;
    return v_duel_id;
  end if;

  -- Contre l'ordinateur, RIEN n'est détruit ni créé : il ne possède rien. S'il détruisait un
  -- exemplaire, un Pokémon disparaîtrait du monde sans contrepartie ; s'il donnait un pli, il
  -- en apparaîtrait un depuis rien. Il paye des pokédollars, et c'est tout.
  --
  -- La ligne est insérée d'abord parce que son identifiant EST la graine du duel : dérivée
  -- d'une clé d'identité, elle est stable une fois écrite, donc le client peut rejouer le
  -- combat et retomber sur le même vainqueur — ce que le résumé de combat exige.
  insert into public.arena_duels (challenger_id, challenger_key, status)
  values (v_uid, p_entry_key, 'computer')
  returning id into v_duel_id;

  v_seed := 'duel:' || v_duel_id;
  v_foe_key := 'ordinateur:' || v_duel_id;

  select * into v_foe from public.arena_computer_pick(v_seed, public.arena_field_level_cap());

  select * into v_out from public.arena_resolve(
    p_entry_key, v_species, v_level, v_day,
    v_foe_key, v_foe.foe_species, v_foe.foe_level, v_day,
    v_seed);

  -- L'enjeu, et non la mise du joueur : engager un légendaire contre un terrain de peu communs
  -- ne rapporte que le peu commun, exactement comme contre un humain.
  v_stake := public.arena_covered_tier(v_tier, v_foe.foe_tier);

  update public.arena_duels set
    opponent_key = v_foe_key,
    stake_tier = v_stake,
    -- `winner_id` nul sur un duel `computer` signifie que l'ordinateur a gagné : il n'a pas de
    -- compte, on ne peut donc pas l'y écrire. Le statut lève l'ambiguïté avec un duel en cours.
    winner_id = case when v_out.winner = 'left' then v_uid end,
    challenger_power = v_out.left_power,
    opponent_power = v_out.right_power,
    challenger_species = v_species,
    opponent_species = v_foe.foe_species,
    challenger_level = v_level,
    opponent_level = v_foe.foe_level,
    challenger_form = public.arena_form_index(p_entry_key, v_day),
    opponent_form = public.arena_form_index(v_foe_key, v_day),
    probability = v_out.probability,
    roll = v_out.roll,
    resolved_at = now()
  where id = v_duel_id;

  if v_out.winner = 'left' then
    -- Des pokédollars, au cinquième du tarif humain, et rien d'autre. Ni point de classement,
    -- ni pli, ni NIVEAU : sans cette dernière exclusion on monterait un champion sans jamais
    -- rien risquer, et le niveau cesserait de mesurer ce qu'on a osé. C'est pourquoi
    -- `v_out.level_after` est délibérément ignoré ici.
    insert into public.arena_wallet (user_id, pokedollars)
    values (v_uid, public.arena_reward_dollars(v_stake) / 5)
    on conflict (user_id) do update
      set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;
  end if;

  return v_duel_id;
end;
$$;


ALTER FUNCTION "public"."arena_engage"("p_entry_key" "text", "p_vs_computer" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_field_level_cap"() RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
  select greatest(1, least(10,
    coalesce(percentile_cont(0.5) within group (order by e.level) :: int, 1)))
  from public.arena_duels d
  join public.arena_exemplars e
    on (e.user_id = d.challenger_id and e.entry_key = d.challenger_key)
    or (e.user_id = d.opponent_id and e.entry_key = d.opponent_key)
  where d.created_at >= now() - interval '30 days'
$$;


ALTER FUNCTION "public"."arena_field_level_cap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_first_season"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$ select '2026-S6' $$;


ALTER FUNCTION "public"."arena_first_season"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_form_factor"("idx" integer) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select (array[0.90, 0.95, 1.00, 1.05, 1.10] :: double precision[])[idx + 1]
$$;


ALTER FUNCTION "public"."arena_form_factor"("idx" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_form_index"("entry_key" "text", "day" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select (public.fnv1a(entry_key || ':forme:' || day) % 5) :: int
$$;


ALTER FUNCTION "public"."arena_form_index"("entry_key" "text", "day" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_form_slug"("idx" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select (array['epuise', 'fatigue', 'normal', 'en-forme', 'pleine-forme'])[idx + 1]
$$;


ALTER FUNCTION "public"."arena_form_slug"("idx" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_level_factor"("level" integer) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select 1 + 0.05 :: double precision * (level - 1)
$$;


ALTER FUNCTION "public"."arena_level_factor"("level" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_level_gain"("mine" double precision, "theirs" double precision) RETURNS integer
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select case
    when theirs / mine < 0.75 :: double precision then 0
    when theirs / mine < 1.10 :: double precision then 1
    when theirs / mine < 1.50 :: double precision then 2
    when theirs / mine < 2.00 :: double precision then 3
    else 5
  end
$$;


ALTER FUNCTION "public"."arena_level_gain"("mine" double precision, "theirs" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_power"("species" integer, "level" integer, "form_idx" integer) RETURNS double precision
    LANGUAGE "sql" STABLE STRICT
    AS $$
  select s.stats * public.arena_tier_power(s.tier)
       * public.arena_level_factor(level) * public.arena_form_factor(form_idx)
  from public.species_stats s
  where s.species = arena_power.species
$$;


ALTER FUNCTION "public"."arena_power"("species" integer, "level" integer, "form_idx" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_resolve"("left_key" "text", "left_species" integer, "left_level" integer, "left_day" "text", "right_key" "text", "right_species" integer, "right_level" integer, "right_day" "text", "seed" "text") RETURNS TABLE("winner" "text", "probability" double precision, "roll" double precision, "left_power" double precision, "right_power" double precision, "gain" integer, "level_after" integer)
    LANGUAGE "sql" STABLE STRICT
    AS $$
  with f as (
    select public.arena_form_index(arena_resolve.left_key, arena_resolve.left_day) as lf,
           public.arena_form_index(arena_resolve.right_key, arena_resolve.right_day) as rf
  ),
  p as (
    select f.lf, f.rf,
           public.arena_power(arena_resolve.left_species, arena_resolve.left_level, f.lf) as lp,
           public.arena_power(arena_resolve.right_species, arena_resolve.right_level, f.rf) as rp
    from f
  ),
  d as (
    select p.lp, p.rp,
           public.arena_win_probability(p.lp, p.rp) as prob,
           public.fnv1a(arena_resolve.seed || ':issue') :: double precision
             / 4294967296 :: double precision as draw,
           public.arena_sort_key(arena_resolve.left_key, arena_resolve.left_species,
                                 arena_resolve.left_level, p.lf) collate "C"
             <= public.arena_sort_key(arena_resolve.right_key, arena_resolve.right_species,
                                      arena_resolve.right_level, p.rf) collate "C" as left_first
    from p
  ),
  i as (
    -- `firstWins` porte sur le camp canoniquement premier ; l'issue de `left` s'en déduit par
    -- négation quand c'est `right` qui est premier.
    select d.*,
           case when d.left_first then d.draw < d.prob
                else not (d.draw < public.arena_win_probability(d.rp, d.lp)) end as left_wins
    from d
  )
  select case when i.left_wins then 'left' else 'right' end,
         i.prob,
         i.draw,
         i.lp,
         i.rp,
         -- Le gain se lit du point de vue du VAINQUEUR : sa puissance en premier argument,
         -- celle du perdant en second.
         public.arena_level_gain(case when i.left_wins then i.lp else i.rp end,
                                 case when i.left_wins then i.rp else i.lp end),
         -- Plafond à 10 : un exploit rapporte cinq niveaux, jamais au-delà de `LEVEL_MAX`.
         least(10, (case when i.left_wins then arena_resolve.left_level
                         else arena_resolve.right_level end)
                   + public.arena_level_gain(case when i.left_wins then i.lp else i.rp end,
                                             case when i.left_wins then i.rp else i.lp end))
  from i
$$;


ALTER FUNCTION "public"."arena_resolve"("left_key" "text", "left_species" integer, "left_level" integer, "left_day" "text", "right_key" "text", "right_species" integer, "right_level" integer, "right_day" "text", "seed" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_resolve_expired"("older_than" interval DEFAULT '24:00:00'::interval) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_duel record;
  v_foe record;
  v_out record;
  v_seed text;
  v_foe_key text;
  v_stake text;
  v_species int;
  v_level int;
  v_tier text;
  v_day text;
  v_n int := 0;
begin
  -- `for update skip locked` : deux passages concurrents du travail planifié ne doivent pas
  -- résoudre deux fois le même défi. Celui qui arrive second saute simplement les lignes que
  -- l'autre tient déjà, plutôt que d'attendre puis de rejouer sur un état périmé.
  for v_duel in
    select * from public.arena_duels
    where status = 'open' and created_at < now() - older_than
    for update skip locked
  loop
    select c.species, coalesce(e.level, 1), s.tier
      into v_species, v_level, v_tier
    from public.catches c
    join public.species_stats s on s.species = c.species
    left join public.arena_exemplars e
      on e.user_id = v_duel.challenger_id and e.entry_key = v_duel.challenger_key
    where c.user_id = v_duel.challenger_id
      and c.source || ':' || c.external_id = v_duel.challenger_key;

    -- Un exemplaire introuvable ne doit pas bloquer le travail planifié pour tous les autres :
    -- le défi est refermé sans gain, et l'exemplaire libéré.
    if v_species is null then
      update public.arena_duels
        set status = 'computer', resolved_at = now()
        where id = v_duel.id;
      v_n := v_n + 1;
      continue;
    end if;

    v_day := to_char((now() at time zone 'Europe/Paris') :: date, 'YYYY-MM-DD');
    v_seed := 'duel:' || v_duel.id;
    v_foe_key := 'ordinateur:' || v_duel.id;

    select * into v_foe from public.arena_computer_pick(v_seed, public.arena_field_level_cap());

    select * into v_out from public.arena_resolve(
      v_duel.challenger_key, v_species, v_level, coalesce(v_duel.challenger_day, v_day),
      v_foe_key, v_foe.foe_species, v_foe.foe_level, v_day,
      v_seed);

    v_stake := public.arena_covered_tier(v_tier, v_foe.foe_tier);

    update public.arena_duels set
      status = 'computer',
      opponent_key = v_foe_key,
      stake_tier = v_stake,
      winner_id = case when v_out.winner = 'left' then v_duel.challenger_id end,
      challenger_power = v_out.left_power,
      opponent_power = v_out.right_power,
      challenger_species = v_species,
      opponent_species = v_foe.foe_species,
      challenger_level = v_level,
      opponent_level = v_foe.foe_level,
      challenger_form = public.arena_form_index(
        v_duel.challenger_key, coalesce(v_duel.challenger_day, v_day)),
      opponent_form = public.arena_form_index(v_foe_key, v_day),
      probability = v_out.probability,
      roll = v_out.roll,
      resolved_at = now()
    where id = v_duel.id;

    if v_out.winner = 'left' then
      insert into public.arena_wallet (user_id, pokedollars)
      values (v_duel.challenger_id, public.arena_reward_dollars(v_stake) / 5)
      on conflict (user_id) do update
        set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;
    end if;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;


ALTER FUNCTION "public"."arena_resolve_expired"("older_than" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_reward_dollars"("tier" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select case tier when 'c' then 50 when 'u' then 100 when 'r' then 250 when 'l' then 600 end
$$;


ALTER FUNCTION "public"."arena_reward_dollars"("tier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_reward_points"("tier" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select case tier when 'c' then 5 when 'u' then 10 when 'r' then 25 when 'l' then 60 end
$$;


ALTER FUNCTION "public"."arena_reward_points"("tier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_season"("at" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  -- Deux mois de calendrier, décalés d'un mois : la saison 6 part de décembre et englobe le
  -- janvier suivant. Elle garde le nom de son mois de DÉPART — donc l'année précédente pour
  -- janvier, seul cas que le `case` traite. Sans ça, décembre et janvier tomberaient dans deux
  -- codes différents et le classement se scinderait au milieu de la saison.
  with d as (
    select extract(month from timezone('Europe/Paris', arena_season.at)) :: int as mois,
           extract(year  from timezone('Europe/Paris', arena_season.at)) :: int as annee
  )
  select case when mois = 1 then (annee - 1) :: text || '-S6'
              else annee :: text || '-S' || (mois / 2) :: text end
  from d
$$;


ALTER FUNCTION "public"."arena_season"("at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_sort_key"("entry_key" "text", "species" integer, "level" integer, "form_idx" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select entry_key || ':' || species || ':' || level || ':' || public.arena_form_slug(form_idx)
$$;


ALTER FUNCTION "public"."arena_sort_key"("entry_key" "text", "species" integer, "level" integer, "form_idx" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_tier_power"("tier" "text") RETURNS double precision
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select case tier when 'c' then 1.00 when 'u' then 1.06
                   when 'r' then 1.15 when 'l' then 1.45 end :: double precision
$$;


ALTER FUNCTION "public"."arena_tier_power"("tier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_week_start"("at" timestamp with time zone) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select date_trunc('week', at at time zone 'Europe/Paris') :: date
$$;


ALTER FUNCTION "public"."arena_week_start"("at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arena_win_probability"("a" double precision, "b" double precision) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE STRICT
    AS $$
  select least(0.95 :: double precision,
               greatest(0.05 :: double precision, a ^ 3 / (a ^ 3 + b ^ 3)))
$$;


ALTER FUNCTION "public"."arena_win_probability"("a" double precision, "b" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_backfill_evolutions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_n int;
begin
  /**
   * Une seule fois, et pas « idempotente » au sens habituel.
   *
   * Le remappage des clés en chaîne change `evo:<rang>` en `evo:<identifiant>`. Un second
   * passage ne reconnaîtrait donc plus les entrées déjà reprises — leur clé a changé — et les
   * insérerait une seconde fois avant de buter sur l'unicité. Mieux vaut refuser franchement
   * que promettre une idempotence qui n'existe pas : dès qu'une évolution est en base, la
   * reprise a eu lieu, et il n'y a plus rien à reprendre.
   */
  if exists (select 1 from public.evolutions) then
    return 0;
  end if;

  -- Les lignes créées par cet appel, pour ne remapper qu'elles.
  create temporary table if not exists dex_reprises (id bigint primary key) on commit drop;
  delete from dex_reprises;

  with ajout as (
    insert into public.evolutions (user_id, from_species, to_species, from_key, day, created_at)
    select s.user_id,
           (e.item ->> 'from') :: int,
           (e.item ->> 'species') :: int,
           coalesce(e.item ->> 'fromKey', e.item ->> 'fromSha'),
           coalesce(e.item ->> 'date', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD')),
           -- Un instant croissant dans l'ordre du tableau : `created_at` ne sert qu'à
           -- départager, et l'ordre est la seule chose que l'ancien format garantissait.
           now() + (e.ord * interval '1 microsecond')
    from public.state s,
         lateral jsonb_array_elements(s.evolutions) with ordinality as e(item, ord)
    where e.item ->> 'from' is not null
      and coalesce(e.item ->> 'fromKey', e.item ->> 'fromSha') is not null
    on conflict (user_id, from_key) do nothing
    returning id
  )
  insert into dex_reprises (id) select id from ajout;
  get diagnostics v_n = row_count;

  /**
   * Les clés d'une évolution en chaîne changent de nature.
   *
   * L'ancien format désignait le Pokémon obtenu par son RANG dans le tableau — `evo:0` pour la
   * première évolution du joueur. Le nouveau le désigne par l'identifiant que la base lui
   * attribue. Reprises telles quelles, ces clés ne pointeraient sur rien : l'exemplaire
   * consommé passerait pour disponible, on pourrait le faire évoluer une seconde fois ou
   * l'engager à l'arène, et le chromatique hérité de sa source serait perdu.
   *
   * Le rang se retrouve dans l'ordre d'insertion, que la reprise a conservé.
   */
  with rangs as (
    select id, user_id, (row_number() over (partition by user_id order by id)) - 1 as rang
    from public.evolutions
  )
  update public.evolutions v
  set from_key = 'evo:' || cible.id
  from rangs source, rangs cible
  where v.id = source.id
    and v.id in (select id from dex_reprises)
    and v.from_key ~ '^evo:[0-9]+$'
    and cible.user_id = v.user_id
    and cible.rang = (substring(v.from_key from 5)) :: int;

  return v_n;
end;
$_$;


ALTER FUNCTION "public"."dex_backfill_evolutions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_candies"("uid" "uuid", "fam" integer) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dex_candies"("uid" "uuid", "fam" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_evolve"("p_from_key" "text", "p_to" integer, "p_day" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dex_evolve"("p_from_key" "text", "p_to" integer, "p_day" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_sale_price"("species" integer, "level" integer, "shiny" boolean) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select round(
           (case st.tier when 'c' then 5 when 'u' then 10 when 'r' then 25 when 'l' then 200 end)
           -- La Gen 2 coûte le double en boutique : elle se revend le double.
           * (case when dex_sale_price.species > 151 then 2 else 1 end)
           * (1 + (least(10, greatest(1, coalesce(dex_sale_price.level, 1))) - 1) / 6.0)
           * (case when coalesce(dex_sale_price.shiny, false) then 4 else 1 end)
         ) :: int
  from public.species_stats st
  where st.species = dex_sale_price.species
$$;


ALTER FUNCTION "public"."dex_sale_price"("species" integer, "level" integer, "shiny" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_sell"("p_keys" "text"[]) RETURNS TABLE("sold" integer, "total" integer, "balance" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_keys text[];
  v_key text;
  v_species int;
  v_level int;
  v_price int;
  v_total int := 0;
  v_n int := 0;
begin
  perform public.arena_assert_open();
  if v_uid is null then
    raise exception 'dex : appel non authentifié';
  end if;

  select array_agg(distinct k) into v_keys from unnest(coalesce(p_keys, '{}'::text[])) k;
  if v_keys is null then
    raise exception 'dex : aucun exemplaire à vendre';
  end if;

  -- Sérialise les ventes et les évolutions d'un même joueur pour la durée de la transaction.
  perform 1 from public.state where user_id = v_uid for update;

  foreach v_key in array v_keys loop
    v_species := public.dex_species_of(v_uid, v_key);
    if v_species is null then
      raise exception 'dex : exemplaire inconnu (%)', v_key;
    end if;

    if exists (
      select 1 from public.arena_exemplars
      where user_id = v_uid and entry_key = v_key
        and (sold_at is not null or destroyed_at is not null)
    ) then
      raise exception 'dex : cet exemplaire a déjà quitté ta collection (%)', v_key;
    end if;

    if exists (select 1 from public.evolutions where user_id = v_uid and from_key = v_key) then
      raise exception 'dex : cet exemplaire a servi à une évolution (%)', v_key;
    end if;

    -- Engagé dans un défi ouvert : immobilisé, pas disponible. Le vendre le ferait disparaître
    -- de sous le duel qui l'attend.
    if exists (
      select 1 from public.arena_duels d
      where d.status = 'open'
        and ((d.challenger_id = v_uid and d.challenger_key = v_key)
          or (d.opponent_id = v_uid and d.opponent_key = v_key))
    ) then
      raise exception 'dex : cet exemplaire est engagé dans un défi ouvert (%)', v_key;
    end if;

    if public.dex_stock(v_uid, v_species) <= 1 then
      raise exception 'dex : on ne vend pas son dernier exemplaire d''une espèce (%)', v_key;
    end if;

    select coalesce(x.level, 1) into v_level
    from (select 1) z
    left join public.arena_exemplars x on x.user_id = v_uid and x.entry_key = v_key;

    v_price := public.dex_sale_price(v_species, v_level, public.dex_shiny_of(v_uid, v_key));
    if v_price is null then
      raise exception 'dex : espèce sans prix (%)', v_species;
    end if;

    insert into public.arena_exemplars (user_id, entry_key, level, sold_at, sold_price)
    values (v_uid, v_key, v_level, now(), v_price)
    on conflict (user_id, entry_key) do update
      set sold_at = now(), sold_price = v_price;

    v_total := v_total + v_price;
    v_n := v_n + 1;
  end loop;

  insert into public.arena_wallet (user_id, pokedollars)
  values (v_uid, v_total)
  on conflict (user_id) do update
    set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;

  return query
    select v_n, v_total, w.pokedollars
    from public.arena_wallet w where w.user_id = v_uid;
end $$;


ALTER FUNCTION "public"."dex_sell"("p_keys" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_shiny_of"("uid" "uuid", "entry_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_key text := entry_key;
  v_shiny boolean;
  v_from text;
  v_pas int := 0;
begin
  loop
    -- Une chaîne d'évolutions est finie par construction, mais on ne parie pas la disponibilité
    -- du serveur sur une donnée : au-delà de toute lignée plausible, on rend le défaut.
    v_pas := v_pas + 1;
    if v_pas > 32 then return false; end if;

    select c.shiny into v_shiny from public.catches c
    where c.user_id = uid and c.source || ':' || c.external_id = v_key;
    if found then return coalesce(v_shiny, false); end if;

    select v.from_key into v_from from public.evolutions v
    where v.user_id = uid and 'evo:' || v.id = v_key;
    if not found then return false; end if;

    v_key := v_from;
  end loop;
end $$;


ALTER FUNCTION "public"."dex_shiny_of"("uid" "uuid", "entry_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_species_of"("uid" "uuid", "entry_key" "text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select c.species from public.catches c
      where c.user_id = dex_species_of.uid
        and c.source || ':' || c.external_id = dex_species_of.entry_key),
    (select v.to_species from public.evolutions v
      where v.user_id = dex_species_of.uid
        and 'evo:' || v.id = dex_species_of.entry_key)
  )
$$;


ALTER FUNCTION "public"."dex_species_of"("uid" "uuid", "entry_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dex_stock"("uid" "uuid", "species" integer) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with tout as (
    select c.source || ':' || c.external_id as entry_key
    from public.catches c
    where c.user_id = dex_stock.uid and c.species = dex_stock.species
    union all
    select 'evo:' || v.id
    from public.evolutions v
    where v.user_id = dex_stock.uid and v.to_species = dex_stock.species
  )
  select count(*) :: int from tout t
  where not exists (
          select 1 from public.evolutions e
          where e.user_id = dex_stock.uid and e.from_key = t.entry_key)
    and not exists (
          select 1 from public.arena_exemplars x
          where x.user_id = dex_stock.uid and x.entry_key = t.entry_key
            and (x.destroyed_at is not null or x.sold_at is not null))
$$;


ALTER FUNCTION "public"."dex_stock"("uid" "uuid", "species" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_pr_dex_data"("workflow" "text") RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select net.http_post(
    url := 'https://api.github.com/repos/LeonidevFR/pr-dex-data/actions/workflows/' || workflow || '/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_dispatch_token'),
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'pr-dex-cron',
      'Content-Type', 'application/json'
    )
  );
$$;


ALTER FUNCTION "public"."dispatch_pr_dex_data"("workflow" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fnv1a"("input" "text") RETURNS bigint
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    AS $$
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


ALTER FUNCTION "public"."fnv1a"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.provider = 'github' and new.identity_data ->> 'user_name' is not null then
    insert into public.identities (user_id, source, handle)
    values (new.user_id, 'github', new.identity_data ->> 'user_name')
    on conflict do nothing;
  elsif new.provider = 'slack_oidc'
    and new.identity_data -> 'custom_claims' ->> 'https://slack.com/team_id' = 'T04HSC3TM' then
    insert into public.identities (user_id, source, handle)
    values (new.user_id, 'slack', new.provider_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.state (user_id) values (new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_removed_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.identities
  where user_id = old.user_id
    and source = case old.provider when 'github' then 'github' when 'slack_oidc' then 'slack' end;
  return old;
end;
$$;


ALTER FUNCTION "public"."handle_removed_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leaderboard_players"() RETURNS TABLE("login" "text", "avatar_url" "text", "is_me" boolean, "catches" "jsonb", "evolutions" "jsonb", "achievements" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(
      u.raw_user_meta_data ->> 'user_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'full_name',
      'inconnu'
    ) as login,
    coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') as avatar_url,
    u.id = auth.uid() as is_me,
    opened.catches,
    coalesce(evos.evolutions, '[]'::jsonb) as evolutions,
    (select count(*)::integer from public.achievements a where a.user_id = u.id) as achievements
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
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'from_species', v.from_species,
        'to_species', v.to_species,
        'from_key', v.from_key
      )
      order by v.id
    ) as evolutions
    from public.evolutions v
    where v.user_id = u.id
  ) evos on true
  where opened.catches is not null;
$$;


ALTER FUNCTION "public"."leaderboard_players"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "code" "text" NOT NULL,
    "unlocked_at" "date" NOT NULL,
    "trigger_key" "text",
    "announced" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_duels" (
    "id" bigint NOT NULL,
    "challenger_id" "uuid" NOT NULL,
    "challenger_key" "text" NOT NULL,
    "opponent_id" "uuid",
    "opponent_key" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "challenger_day" "text",
    "winner_id" "uuid",
    "stake_tier" "text",
    "challenger_power" numeric,
    "opponent_power" numeric,
    "challenger_species" integer,
    "opponent_species" integer,
    "challenger_level" integer,
    "opponent_level" integer,
    "challenger_form" integer,
    "opponent_form" integer,
    "probability" numeric,
    "roll" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "arena_duels_stake_tier_check" CHECK (("stake_tier" = ANY (ARRAY['c'::"text", 'u'::"text", 'r'::"text", 'l'::"text"]))),
    CONSTRAINT "arena_duels_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'computer'::"text"])))
);


ALTER TABLE "public"."arena_duels" OWNER TO "postgres";


ALTER TABLE "public"."arena_duels" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."arena_duels_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."arena_exemplars" (
    "user_id" "uuid" NOT NULL,
    "entry_key" "text" NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "wins" integer DEFAULT 0 NOT NULL,
    "destroyed_at" timestamp with time zone,
    "sold_at" timestamp with time zone,
    "sold_price" integer,
    CONSTRAINT "arena_exemplars_level_check" CHECK ((("level" >= 1) AND ("level" <= 10))),
    CONSTRAINT "arena_exemplars_sold_price_check" CHECK ((("sold_price" IS NULL) OR ("sold_price" >= 0))),
    CONSTRAINT "arena_exemplars_une_seule_sortie" CHECK ((("destroyed_at" IS NULL) OR ("sold_at" IS NULL))),
    CONSTRAINT "arena_exemplars_wins_check" CHECK (("wins" >= 0))
);


ALTER TABLE "public"."arena_exemplars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identities" (
    "user_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "handle" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."identities" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."arena_identities" AS
 SELECT "i"."user_id",
    COALESCE("max"("i"."handle") FILTER (WHERE ("i"."source" = 'github'::"text")), "max"("i"."handle") FILTER (WHERE ("i"."source" = 'slack'::"text"))) AS "slug",
    COALESCE("max"(("u"."raw_user_meta_data" ->> 'user_name'::"text")), "max"(("u"."raw_user_meta_data" ->> 'name'::"text")), "max"(("u"."raw_user_meta_data" ->> 'full_name'::"text")), "max"("i"."handle") FILTER (WHERE ("i"."source" = 'github'::"text")), 'inconnu'::"text") AS "login",
    "max"(("u"."raw_user_meta_data" ->> 'avatar_url'::"text")) AS "avatar_url"
   FROM ("public"."identities" "i"
     JOIN "auth"."users" "u" ON (("u"."id" = "i"."user_id")))
  GROUP BY "i"."user_id";


ALTER VIEW "public"."arena_identities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_season_points" (
    "user_id" "uuid" NOT NULL,
    "season" "text" NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "arena_season_points_points_check" CHECK (("points" >= 0))
);


ALTER TABLE "public"."arena_season_points" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."arena_leaderboard" AS
 SELECT "p"."season",
    "p"."user_id",
    "i"."slug",
    "i"."login",
    "i"."avatar_url",
    "p"."points",
    "rank"() OVER (PARTITION BY "p"."season" ORDER BY "p"."points" DESC) AS "rank"
   FROM ("public"."arena_season_points" "p"
     JOIN "public"."arena_identities" "i" ON (("i"."user_id" = "p"."user_id")));


ALTER VIEW "public"."arena_leaderboard" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."arena_open_challenges" AS
 SELECT "d"."id",
    "d"."challenger_id",
    "i"."slug",
    "i"."login",
    "d"."created_at"
   FROM ("public"."arena_duels" "d"
     LEFT JOIN "public"."arena_identities" "i" ON (("i"."user_id" = "d"."challenger_id")))
  WHERE ("d"."status" = 'open'::"text");


ALTER VIEW "public"."arena_open_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_opening" (
    "id" boolean DEFAULT true NOT NULL,
    "opens_at" timestamp with time zone NOT NULL,
    CONSTRAINT "arena_opening_id_check" CHECK ("id")
);


ALTER TABLE "public"."arena_opening" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_packs" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier" "text" NOT NULL,
    "duel_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "gen" integer DEFAULT 1 NOT NULL,
    "fresh" boolean DEFAULT false NOT NULL,
    CONSTRAINT "arena_packs_gen_check" CHECK (("gen" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "arena_packs_tier_check" CHECK (("tier" = ANY (ARRAY['c'::"text", 'u'::"text", 'r'::"text", 'l'::"text"])))
);


ALTER TABLE "public"."arena_packs" OWNER TO "postgres";


ALTER TABLE "public"."arena_packs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."arena_packs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."arena_players" AS
 SELECT "user_id",
    "slug",
    "login"
   FROM "public"."arena_identities"
  WHERE ("slug" IS NOT NULL);


ALTER VIEW "public"."arena_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catches" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "ref" "text",
    "url" "text",
    "date" "date" NOT NULL,
    "species" integer NOT NULL,
    "shiny" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."catches" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."arena_public_dex" AS
 SELECT DISTINCT "user_id",
    "species"
   FROM "public"."catches";


ALTER VIEW "public"."arena_public_dex" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evolutions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "from_species" integer NOT NULL,
    "to_species" integer NOT NULL,
    "from_key" "text" NOT NULL,
    "day" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."evolutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state" (
    "user_id" "uuid" NOT NULL,
    "claimed" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "spent" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "evolutions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "version" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."state" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."arena_public_profile" AS
 SELECT "pr"."user_id",
    "ai"."slug",
    "ai"."login",
    "ai"."avatar_url",
    ( SELECT ("count"(*))::integer AS "count"
           FROM ( SELECT "c"."species"
                   FROM ("public"."catches" "c"
                     JOIN "public"."state" "s" ON (("s"."user_id" = "c"."user_id")))
                  WHERE (("c"."user_id" = "pr"."user_id") AND ("s"."claimed" ? (("c"."source" || ':'::"text") || "c"."external_id")))
                UNION
                 SELECT "v"."to_species"
                   FROM "public"."evolutions" "v"
                  WHERE ("v"."user_id" = "pr"."user_id")) "vues") AS "species",
    ("count"(*) FILTER (WHERE ("d"."winner_id" = "pr"."user_id")))::integer AS "wins",
    ("count"(*) FILTER (WHERE (("d"."status" <> 'open'::"text") AND ("d"."winner_id" IS DISTINCT FROM "pr"."user_id"))))::integer AS "losses"
   FROM (("public"."profiles" "pr"
     JOIN "public"."arena_identities" "ai" ON (("ai"."user_id" = "pr"."user_id")))
     LEFT JOIN "public"."arena_duels" "d" ON ((("d"."challenger_id" = "pr"."user_id") OR ("d"."opponent_id" = "pr"."user_id"))))
  WHERE ("ai"."slug" IS NOT NULL)
  GROUP BY "pr"."user_id", "ai"."slug", "ai"."login", "ai"."avatar_url";


ALTER VIEW "public"."arena_public_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_season_podium" (
    "season" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rank" integer NOT NULL,
    "prize" integer NOT NULL,
    CONSTRAINT "arena_season_podium_prize_check" CHECK (("prize" >= 0)),
    CONSTRAINT "arena_season_podium_rank_check" CHECK ((("rank" >= 1) AND ("rank" <= 3)))
);


ALTER TABLE "public"."arena_season_podium" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_seasons" (
    "season" "text" NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."arena_seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_shop" (
    "slug" "text" NOT NULL,
    "gen" integer NOT NULL,
    "tier" "text" NOT NULL,
    "fresh" boolean DEFAULT false NOT NULL,
    "price" integer NOT NULL,
    CONSTRAINT "arena_shop_gen_check" CHECK (("gen" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "arena_shop_price_check" CHECK (("price" > 0)),
    CONSTRAINT "arena_shop_tier_check" CHECK (("tier" = ANY (ARRAY['c'::"text", 'u'::"text", 'r'::"text", 'l'::"text"])))
);


ALTER TABLE "public"."arena_shop" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arena_wallet" (
    "user_id" "uuid" NOT NULL,
    "pokedollars" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "arena_wallet_pokedollars_check" CHECK (("pokedollars" >= 0))
);


ALTER TABLE "public"."arena_wallet" OWNER TO "postgres";


ALTER TABLE "public"."catches" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."catches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."evolutions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."evolutions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."species_evo" (
    "species" integer NOT NULL,
    "family" integer NOT NULL,
    "cost" integer,
    "targets" integer[] DEFAULT '{}'::integer[] NOT NULL
);


ALTER TABLE "public"."species_evo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."species_stats" (
    "species" integer NOT NULL,
    "stats" integer NOT NULL,
    "tier" "text" NOT NULL,
    CONSTRAINT "species_stats_stats_check" CHECK (("stats" > 0)),
    CONSTRAINT "species_stats_tier_check" CHECK (("tier" = ANY (ARRAY['c'::"text", 'u'::"text", 'r'::"text", 'l'::"text"])))
);


ALTER TABLE "public"."species_stats" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("user_id", "code");



ALTER TABLE ONLY "public"."arena_duels"
    ADD CONSTRAINT "arena_duels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."arena_exemplars"
    ADD CONSTRAINT "arena_exemplars_pkey" PRIMARY KEY ("user_id", "entry_key");



ALTER TABLE ONLY "public"."arena_opening"
    ADD CONSTRAINT "arena_opening_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."arena_packs"
    ADD CONSTRAINT "arena_packs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."arena_season_podium"
    ADD CONSTRAINT "arena_season_podium_pkey" PRIMARY KEY ("season", "user_id");



ALTER TABLE ONLY "public"."arena_season_points"
    ADD CONSTRAINT "arena_season_points_pkey" PRIMARY KEY ("user_id", "season");



ALTER TABLE ONLY "public"."arena_seasons"
    ADD CONSTRAINT "arena_seasons_pkey" PRIMARY KEY ("season");



ALTER TABLE ONLY "public"."arena_shop"
    ADD CONSTRAINT "arena_shop_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."arena_wallet"
    ADD CONSTRAINT "arena_wallet_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_user_id_source_external_id_key" UNIQUE ("user_id", "source", "external_id");



ALTER TABLE ONLY "public"."evolutions"
    ADD CONSTRAINT "evolutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evolutions"
    ADD CONSTRAINT "evolutions_user_id_from_key_key" UNIQUE ("user_id", "from_key");



ALTER TABLE ONLY "public"."identities"
    ADD CONSTRAINT "identities_pkey" PRIMARY KEY ("user_id", "source");



ALTER TABLE ONLY "public"."identities"
    ADD CONSTRAINT "identities_source_handle_key" UNIQUE ("source", "handle");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."species_evo"
    ADD CONSTRAINT "species_evo_pkey" PRIMARY KEY ("species");



ALTER TABLE ONLY "public"."species_stats"
    ADD CONSTRAINT "species_stats_pkey" PRIMARY KEY ("species");



ALTER TABLE ONLY "public"."state"
    ADD CONSTRAINT "state_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "arena_duels_challenger_idx" ON "public"."arena_duels" USING "btree" ("challenger_id");



CREATE UNIQUE INDEX "arena_duels_one_open_per_exemplar" ON "public"."arena_duels" USING "btree" ("challenger_id", "challenger_key") WHERE ("status" = 'open'::"text");



CREATE INDEX "arena_duels_open_idx" ON "public"."arena_duels" USING "btree" ("created_at") WHERE ("status" = 'open'::"text");



CREATE INDEX "arena_duels_opponent_idx" ON "public"."arena_duels" USING "btree" ("opponent_id") WHERE ("opponent_id" IS NOT NULL);



CREATE INDEX "evolutions_user_idx" ON "public"."evolutions" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_duels"
    ADD CONSTRAINT "arena_duels_challenger_id_fkey" FOREIGN KEY ("challenger_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_duels"
    ADD CONSTRAINT "arena_duels_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_duels"
    ADD CONSTRAINT "arena_duels_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."arena_exemplars"
    ADD CONSTRAINT "arena_exemplars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_packs"
    ADD CONSTRAINT "arena_packs_duel_id_fkey" FOREIGN KEY ("duel_id") REFERENCES "public"."arena_duels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_packs"
    ADD CONSTRAINT "arena_packs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_season_podium"
    ADD CONSTRAINT "arena_season_podium_season_fkey" FOREIGN KEY ("season") REFERENCES "public"."arena_seasons"("season") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_season_podium"
    ADD CONSTRAINT "arena_season_podium_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."arena_season_points"
    ADD CONSTRAINT "arena_season_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."arena_wallet"
    ADD CONSTRAINT "arena_wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catches"
    ADD CONSTRAINT "catches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evolutions"
    ADD CONSTRAINT "evolutions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."identities"
    ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."state"
    ADD CONSTRAINT "state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "achievements_insert_own" ON "public"."achievements" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "achievements_select_own" ON "public"."achievements" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "achievements_update_own" ON "public"."achievements" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."arena_duels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_duels_select_own_open" ON "public"."arena_duels" FOR SELECT USING ((("status" = 'open'::"text") AND ("auth"."uid"() = "challenger_id")));



CREATE POLICY "arena_duels_select_resolved_own" ON "public"."arena_duels" FOR SELECT USING ((("status" <> 'open'::"text") AND (("auth"."uid"() = "challenger_id") OR ("auth"."uid"() = "opponent_id"))));



ALTER TABLE "public"."arena_exemplars" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_exemplars_select_own" ON "public"."arena_exemplars" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."arena_opening" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."arena_packs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_packs_select_own" ON "public"."arena_packs" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."arena_season_podium" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_season_podium_select_all" ON "public"."arena_season_podium" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."arena_season_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_season_points_select_all" ON "public"."arena_season_points" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."arena_seasons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_seasons_select_all" ON "public"."arena_seasons" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."arena_shop" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_shop_select_all" ON "public"."arena_shop" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."arena_wallet" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arena_wallet_select_own" ON "public"."arena_wallet" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."catches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "catches_select_own" ON "public"."catches" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."evolutions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evolutions_select_own" ON "public"."evolutions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."identities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "identities_select_own" ON "public"."identities" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."species_evo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "species_evo_select_all" ON "public"."species_evo" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."species_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "species_stats_select_all" ON "public"."species_stats" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "state_select_own" ON "public"."state" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "state_update_own" ON "public"."state" FOR UPDATE USING (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."achievement_counts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."achievement_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."achievement_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_accept"("p_duel_id" bigint, "p_entry_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_accept"("p_duel_id" bigint, "p_entry_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."arena_accept"("p_duel_id" bigint, "p_entry_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."arena_assert_open"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_assert_open"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_buy"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_buy"("p_slug" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."arena_buy"("p_slug" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."arena_close_finished_seasons"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_close_finished_seasons"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_computer_pick"("seed" "text", "level_cap" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_computer_pick"("seed" "text", "level_cap" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_covered_tier"("a" "text", "b" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_covered_tier"("a" "text", "b" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_credits"("uid" "uuid", "at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_credits"("uid" "uuid", "at" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."arena_credits"("uid" "uuid", "at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."arena_engage"("p_entry_key" "text", "p_vs_computer" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_engage"("p_entry_key" "text", "p_vs_computer" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."arena_engage"("p_entry_key" "text", "p_vs_computer" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."arena_field_level_cap"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_field_level_cap"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_first_season"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_first_season"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_form_factor"("idx" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_form_factor"("idx" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_form_index"("entry_key" "text", "day" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_form_index"("entry_key" "text", "day" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_form_slug"("idx" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_form_slug"("idx" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_level_factor"("level" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_level_factor"("level" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_level_gain"("mine" double precision, "theirs" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_level_gain"("mine" double precision, "theirs" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_power"("species" integer, "level" integer, "form_idx" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_power"("species" integer, "level" integer, "form_idx" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_resolve"("left_key" "text", "left_species" integer, "left_level" integer, "left_day" "text", "right_key" "text", "right_species" integer, "right_level" integer, "right_day" "text", "seed" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_resolve"("left_key" "text", "left_species" integer, "left_level" integer, "left_day" "text", "right_key" "text", "right_species" integer, "right_level" integer, "right_day" "text", "seed" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_resolve_expired"("older_than" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_resolve_expired"("older_than" interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_reward_dollars"("tier" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_reward_dollars"("tier" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_reward_points"("tier" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_reward_points"("tier" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_season"("at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_season"("at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_sort_key"("entry_key" "text", "species" integer, "level" integer, "form_idx" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_sort_key"("entry_key" "text", "species" integer, "level" integer, "form_idx" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_tier_power"("tier" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_tier_power"("tier" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_week_start"("at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_week_start"("at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."arena_win_probability"("a" double precision, "b" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."arena_win_probability"("a" double precision, "b" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."dex_backfill_evolutions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_backfill_evolutions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dex_candies"("uid" "uuid", "fam" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_candies"("uid" "uuid", "fam" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."dex_evolve"("p_from_key" "text", "p_to" integer, "p_day" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_evolve"("p_from_key" "text", "p_to" integer, "p_day" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."dex_evolve"("p_from_key" "text", "p_to" integer, "p_day" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."dex_sale_price"("species" integer, "level" integer, "shiny" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_sale_price"("species" integer, "level" integer, "shiny" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."dex_sell"("p_keys" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_sell"("p_keys" "text"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."dex_sell"("p_keys" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."dex_shiny_of"("uid" "uuid", "entry_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_shiny_of"("uid" "uuid", "entry_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dex_species_of"("uid" "uuid", "entry_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_species_of"("uid" "uuid", "entry_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dex_stock"("uid" "uuid", "species" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dex_stock"("uid" "uuid", "species" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_pr_dex_data"("workflow" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_pr_dex_data"("workflow" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fnv1a"("input" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fnv1a"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_identity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_removed_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_removed_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_removed_identity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."leaderboard_players"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leaderboard_players"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."leaderboard_players"() TO "service_role";



GRANT ALL ON TABLE "public"."achievements" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."achievements" TO "authenticated";



GRANT UPDATE("announced") ON TABLE "public"."achievements" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_duels" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_duels" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."arena_duels_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."arena_exemplars" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_exemplars" TO "authenticated";



GRANT ALL ON TABLE "public"."identities" TO "anon";
GRANT ALL ON TABLE "public"."identities" TO "authenticated";
GRANT ALL ON TABLE "public"."identities" TO "service_role";



GRANT ALL ON TABLE "public"."arena_identities" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_identities" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_season_points" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_season_points" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_leaderboard" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_leaderboard" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_open_challenges" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_open_challenges" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_opening" TO "service_role";



GRANT ALL ON TABLE "public"."arena_packs" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_packs" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."arena_packs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."arena_players" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_players" TO "authenticated";



GRANT ALL ON TABLE "public"."catches" TO "anon";
GRANT ALL ON TABLE "public"."catches" TO "authenticated";
GRANT ALL ON TABLE "public"."catches" TO "service_role";



GRANT ALL ON TABLE "public"."arena_public_dex" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_public_dex" TO "authenticated";



GRANT ALL ON TABLE "public"."evolutions" TO "service_role";
GRANT SELECT ON TABLE "public"."evolutions" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."state" TO "anon";
GRANT ALL ON TABLE "public"."state" TO "authenticated";
GRANT ALL ON TABLE "public"."state" TO "service_role";



GRANT ALL ON TABLE "public"."arena_public_profile" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_public_profile" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_season_podium" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_season_podium" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_seasons" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_seasons" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_shop" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_shop" TO "authenticated";



GRANT ALL ON TABLE "public"."arena_wallet" TO "service_role";
GRANT SELECT ON TABLE "public"."arena_wallet" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."catches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."catches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."catches_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."evolutions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."species_evo" TO "service_role";
GRANT SELECT ON TABLE "public"."species_evo" TO "authenticated";



GRANT ALL ON TABLE "public"."species_stats" TO "service_role";
GRANT SELECT ON TABLE "public"."species_stats" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







-- Édition Noël (cartes équipe) : voir supabase/migrations/2026-11-23-cartes-equipe-noel.sql.

-- team_members : l'équipe telle que les cartes de Noël la montrent. Remplie à la main
-- (dashboard), jamais depuis le jeu. `photo` est un chemin dans le bucket privé `equipe` :
-- le repo du front est public, ni les visages ni les descriptions n'y entrent.
create table public.team_members (
  id text primary key,
  name text not null,
  blurb text not null,
  photo text,
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;

create policy "team_members_select_authenticated" on public.team_members
  for select to authenticated using (true);

revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to authenticated;

-- team_cards : les cartes équipe gagnées. Hors de `catches` à dessein : l'arène, la revente,
-- le classement, les bonbons et les succès lisent `catches`, et ces cartes sont décoratives.
-- Écrite par `catch.yml` (service_role) ; le joueur ne peut que marquer la sienne ouverte.
create table public.team_cards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  member text not null references public.team_members (id),
  date date not null,
  label text not null,
  ref text,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.team_cards enable row level security;

create policy "team_cards_select_own" on public.team_cards
  for select using (auth.uid() = user_id);

create policy "team_cards_update_own" on public.team_cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.team_cards from anon, authenticated;
grant select on public.team_cards to authenticated;
grant update (opened_at) on public.team_cards to authenticated;

-- Les photos : bucket privé, lisible par un joueur connecté (URL signée côté front).
insert into storage.buckets (id, name, public) values ('equipe', 'equipe', false)
  on conflict (id) do nothing;

create policy "equipe_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'equipe');
