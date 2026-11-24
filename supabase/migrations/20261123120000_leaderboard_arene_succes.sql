-- Classement : les évolutions tenues par le serveur ET le nombre de succès de chaque joueur.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, APRÈS les migrations de
-- l'arène, dont 20261014000000_leaderboard_evolutions.
--
-- Pourquoi : deux migrations redéfinissent `leaderboard_players()` chacune de son côté.
-- 20261123100000_succes_classement (déjà en production) lui ajoute le nombre de succès mais lit
-- encore `state.evolutions` ; 20261014000000_leaderboard_evolutions (arène) lit la table
-- `evolutions` mais ne connaît pas les succès. Celle-ci réunit les deux.
--
-- Retour arrière : rejouer 20261123100000_succes_classement.

begin;

drop function if exists public.leaderboard_players();

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

revoke execute on function public.leaderboard_players() from public, anon;
grant execute on function public.leaderboard_players() to authenticated;

commit;
