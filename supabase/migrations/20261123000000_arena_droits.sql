-- Droits de l'arène : ne laisser aux rôles publics que ce que le front utilise.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, APRÈS les migrations de
-- l'arène (20260811, 20260814, 20260924, 20261014) et avant de merger le front.
--
-- Pourquoi : Supabase accorde par défaut tous les droits à `anon` et `authenticated` sur toute
-- table, vue, séquence ou fonction créée dans `public`. Les migrations de l'arène n'accordaient
-- que des `select` et des `execute` explicites, en supposant qu'il n'y avait rien d'autre :
--   - les tables restaient protégées par RLS seule, sans policy d'écriture. Une policy ajoutée
--     par erreur aurait ouvert l'écriture, et `truncate` n'est pas soumis à RLS. C'est ce que
--     `migrations-appliquees/2026-08-11-revoke-droits-inutilises.sql` a déjà retiré aux tables
--     d'origine ;
--   - surtout, n'importe quel joueur, et même un visiteur sans compte, pouvait appeler les
--     fonctions `security definer` réservées aux tâches planifiées. `arena_resolve_expired`
--     avec un intervalle nul aurait fait résoudre par l'ordinateur les défis ouverts de tout
--     le monde. Les fonctions qui prennent un `uuid` (bonbons, stock, crédits) laissaient lire
--     les données d'un autre joueur.
--
-- Rien n'est cassé : les vues s'exécutent avec les droits de leur propriétaire, aucune policy
-- n'appelle de fonction, et le front n'appelle que les six RPC ré-accordées plus bas.
--
-- Retour arrière : réaccorder ce qui manquerait, par exemple
--   grant execute on function public.<fonction>(<arguments>) to authenticated;

begin;

-- Tables et vues : lecture seule, filtrée par RLS pour les tables.
revoke all on
  public.species_stats, public.species_evo, public.evolutions,
  public.arena_exemplars, public.arena_duels, public.arena_wallet, public.arena_packs,
  public.arena_season_points, public.arena_seasons, public.arena_season_podium, public.arena_shop,
  public.arena_identities, public.arena_players, public.arena_open_challenges,
  public.arena_public_dex, public.arena_leaderboard, public.arena_public_profile
  from anon, authenticated;
-- La date d'ouverture : ni lecture ni écriture pour les joueurs, seul le verrou la consulte.
revoke all on public.arena_opening from anon, authenticated;
grant select on
  public.species_stats, public.species_evo, public.evolutions,
  public.arena_exemplars, public.arena_duels, public.arena_wallet, public.arena_packs,
  public.arena_season_points, public.arena_seasons, public.arena_season_podium, public.arena_shop,
  public.arena_identities, public.arena_players, public.arena_open_challenges,
  public.arena_public_dex, public.arena_leaderboard, public.arena_public_profile
  to authenticated;

-- Séquences : seules les fonctions `security definer` insèrent.
revoke all on sequence public.arena_duels_id_seq, public.arena_packs_id_seq, public.evolutions_id_seq
  from anon, authenticated;

-- Fonctions : plus aucune n'est appelable sans y avoir été autorisée nommément.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'arena\_%' or p.proname like 'dex\_%' or p.proname = 'fnv1a')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$$;

-- `arena_credits` reste appelable par le front, qui lui passe son propre identifiant. Un joueur
-- connecté ne peut plus y lire les crédits d'un autre. Sans session (tâches planifiées, autres
-- fonctions `security definer`), `auth.uid()` est nul et l'appel reste libre.
create or replace function public.arena_credits(uid uuid, at timestamptz default now())
returns int language plpgsql stable security definer set search_path = public as $$
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

-- Les six RPC du front.
grant execute on function
  public.arena_engage(text, boolean), public.arena_accept(bigint, text), public.arena_buy(text),
  public.arena_credits(uuid, timestamptz), public.dex_evolve(text, integer, text), public.dex_sell(text[])
  to authenticated;

-- Les tâches planifiées, qui passent par la clé de service.
grant execute on function
  public.arena_resolve_expired(interval), public.arena_close_finished_seasons(), public.dex_backfill_evolutions()
  to service_role;

commit;
