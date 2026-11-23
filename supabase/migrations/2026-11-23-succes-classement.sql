-- Classement : le nombre de succès de chaque joueur.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur la base en
-- service, AVANT de merger le front. Une base neuve part de `supabase/schema.sql`.
--
-- Ajoute une colonne `achievements` à `leaderboard_players()`. Changer les colonnes
-- renvoyées oblige à supprimer puis recréer la fonction (`create or replace` refuse), d'où
-- les droits redonnés à la fin. Aucune table modifiée, aucune donnée touchée.
--
-- Seul le nombre sort, pas les codes : comme `achievement_counts()`, la fonction ne dit pas
-- quel succès caché un autre joueur a obtenu, ni quand.
--
-- Retour arrière : rejouer le `create function` de 2026-10-13-connexion-slack.sql après un
-- `drop function public.leaderboard_players();`, puis ses deux lignes de droits.

begin;

drop function public.leaderboard_players();

create function public.leaderboard_players()
returns table (
  login text,
  avatar_url text,
  is_me boolean,
  catches jsonb,
  evolutions jsonb,
  achievements integer
)
language sql
security definer
set search_path = public
stable
as $$
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
    s.evolutions,
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
  where opened.catches is not null;
$$;

revoke execute on function public.leaderboard_players() from public, anon;
grant execute on function public.leaderboard_players() to authenticated;

commit;
