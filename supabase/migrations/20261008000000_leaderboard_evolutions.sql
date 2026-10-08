-- Le classement d'équipe lisait les évolutions dans `state.evolutions` — la colonne jsonb que
-- le client écrivait lui-même. Le mode arène les a sorties de là : elles vivent désormais dans
-- `public.evolutions`, que le serveur valide, et `state.evolutions` n'est plus alimentée.
--
-- Sans cette bascule, le panneau de classement figerait les évolutions au dernier état écrit
-- avant la migration : les lignées complétées depuis n'y apparaîtraient jamais, et le compte
-- d'espèces d'un joueur reculerait sous ses yeux.
--
-- Le format change avec la source. L'ancien disait `{ species, from, fromKey }`, le nouveau
-- `{ to_species, from_species, from_key }` ; `playerStats` lit les deux, le temps que tous les
-- joueurs soient passés par la reprise.
create or replace function public.leaderboard_players()
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
    coalesce(evos.evolutions, '[]'::jsonb) as evolutions
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
