-- ─────────────────────────────────────────────────────────────────────────────
-- Revente des exemplaires en trop
--
-- Un tirage donne trois bonbons ET un exemplaire, indépendamment : les bonbons sont encaissés au
-- tirage, et une évolution n'en consomme qu'UN, pas la pile. Le surplus est donc du poids mort,
-- et l'arène ne l'absorbe pas — engager quinze exemplaires l'un après l'autre est une corvée,
-- pas un usage. Cette migration lui donne une sortie : la revente à la maison, prix calculé.
--
-- Rien ici ne touche à une donnée existante. Deux colonnes s'ajoutent, trois fonctions naissent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Une vente et une destruction sont deux façons de quitter le stock : même ligne, pas deux
-- mécaniques parallèles qui finiraient par diverger. Le prix est consigné parce qu'il dépend du
-- niveau au jour de la vente — sans lui, l'historique ne serait pas relisible.
alter table public.arena_exemplars
  add column if not exists sold_at timestamptz,
  add column if not exists sold_price int check (sold_price is null or sold_price >= 0);

-- Un exemplaire ne peut pas être détruit ET vendu : ce sont deux sorties exclusives, et la base
-- doit le dire plutôt que de compter sur l'ordre des contrôles applicatifs.
alter table public.arena_exemplars
  drop constraint if exists arena_exemplars_une_seule_sortie;
alter table public.arena_exemplars
  add constraint arena_exemplars_une_seule_sortie
  check (destroyed_at is null or sold_at is null);

/**
 * Le prix de revente d'un exemplaire.
 *
 * Jumelle de `salePrice` dans `shared/arena-economy.js` — le serveur débite, le front affiche
 * avant de cliquer — avec un test de parité qui les aligne, comme pour `fnv1a`, les saisons et
 * la résolution des duels.
 *
 * La base est ancrée sur la BOUTIQUE (environ 2 % du pli du même palier, arrondie à des chiffres
 * qui se lisent), ce qui donne trois invariants testables plutôt que débattus : vendre rapporte
 * le quart d'une victoire, il faut VINGT reventes pour racheter un pli du même palier, et le
 * palier prime toujours sur le niveau puisque le multiplicateur plafonne à ×2,5.
 *
 * Le niveau est borné plutôt que cru : une valeur aberrante ne doit pas produire un prix
 * aberrant. Une espèce inconnue rend `null`, et `dex_sell` refuse plutôt que d'encaisser zéro.
 */
create or replace function public.dex_sale_price(species int, level int, shiny boolean)
returns int language sql immutable as $$
  select round(
           (case st.tier when 'c' then 5 when 'u' then 10 when 'r' then 25 when 'l' then 90 end)
           -- La Gen 2 coûte le double en boutique : elle se revend le double.
           * (case when dex_sale_price.species > 151 then 2 else 1 end)
           * (1 + (least(10, greatest(1, coalesce(dex_sale_price.level, 1))) - 1) / 6.0)
           * (case when coalesce(dex_sale_price.shiny, false) then 4 else 1 end)
         ) :: int
  from public.species_stats st
  where st.species = dex_sale_price.species
$$;

grant execute on function public.dex_sale_price(int, int, boolean) to authenticated;

/**
 * Le shiny d'un exemplaire, en remontant la chaîne d'évolutions jusqu'à la capture d'origine.
 *
 * Le front fait exactement ça : un Pokémon obtenu par évolution hérite du shiny de l'exemplaire
 * consommé, de proche en proche. Le prix en dépend (×4), donc le serveur doit lire la même chose
 * — sinon la vente débite autre chose que ce que l'écran annonçait.
 */
create or replace function public.dex_shiny_of(uid uuid, entry_key text)
returns boolean language plpgsql stable security definer set search_path = public as $$
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

revoke execute on function public.dex_shiny_of(uuid, text) from public;
grant execute on function public.dex_shiny_of(uuid, text) to authenticated;

/**
 * Combien d'exemplaires d'une espèce l'appelant a ENCORE en main.
 *
 * Même définition que `availableEntries` côté front : captures et évolutions, moins ce qu'une
 * évolution a consommé, moins ce que l'arène a détruit, moins ce qui a été vendu. Un exemplaire
 * engagé dans un défi ouvert compte encore — il est immobilisé, pas parti.
 *
 * Elle sert la règle « on ne vend pas son dernier exemplaire » : sans elle, le grind de PR
 * pourrait monétiser la collection elle-même, et non seulement le surplus.
 */
create or replace function public.dex_stock(uid uuid, species int)
returns int language sql stable security definer set search_path = public as $$
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

revoke execute on function public.dex_stock(uuid, int) from public;
grant execute on function public.dex_stock(uuid, int) to authenticated;

/**
 * Vendre un lot d'exemplaires. Rend le nombre vendu, le total encaissé et le nouveau solde.
 *
 * Le prix est CALCULÉ ICI, jamais reçu de l'appelant — sinon le prix est un champ de formulaire.
 *
 * `for update` sur la ligne d'état en premier, comme `dex_evolve` : c'est ce verrou qui sérialise
 * les opérations d'un même joueur. Sans lui, deux onglets qui vendent le même dernier exemplaire
 * liraient tous deux un stock de deux et le vendraient tous deux — une espèce disparue du stock
 * en échange d'un double paiement.
 *
 * Le lot est atomique : un seul refus annule la vente entière. Les clés sont dédoublonnées, faute
 * de quoi la même carte, passée deux fois, serait payée deux fois.
 *
 * La règle du dernier exemplaire se relit à chaque clé, sur le stock tel qu'il vient d'être
 * modifié : vendre douze Nidoran sur treize passe, le treizième est refusé.
 */
create or replace function public.dex_sell(p_keys text[])
returns table (sold int, total int, balance int)
language plpgsql
security definer
set search_path = public
as $$
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

revoke execute on function public.dex_sell(text[]) from public;
grant execute on function public.dex_sell(text[]) to authenticated;
