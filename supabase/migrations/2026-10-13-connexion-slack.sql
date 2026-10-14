-- Connexion Slack : identité `slack` à l'inscription et à la liaison d'un compte.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur la base en
-- service, AVANT de merger le front. Une base neuve part de `supabase/schema.sql`.
--
-- `T04HSC3TM` est l'identifiant du workspace Slack de Guest Suite, relevé le 2026-10-14 dans
-- `auth.identities` après une première liaison : Supabase le range sous
-- `identity_data -> 'custom_claims' ->> 'https://slack.com/team_id'`, et l'identifiant de
-- membre dans `provider_id`.
--
-- Ordre : `catch.yml` de pr-dex-data doit déjà passer `ATTRIBUTIONS_DIR`. Dès qu'une identité
-- `slack` existe, `planSources` arrête sinon chaque run, captures GitHub comprises.
--
-- Retour arrière :
--   drop trigger on_auth_identity_created on auth.identities;
--   drop function public.handle_new_identity();
--   puis réappliquer `handle_new_user` et `leaderboard_players` tels qu'avant (git).
--
-- Pourquoi un trigger sur `auth.identities` : `handle_new_user` ne se déclenche qu'une fois, à
-- la création du compte. Un dev connecté avec GitHub qui lie ensuite son compte Slack n'y
-- repasse pas. `auth.identities` reçoit une ligne dans les deux cas. La création de
-- l'identité GitHub y déménage aussi : quelqu'un arrivé par Slack qui lie GitHub reçoit
-- alors ses PR.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.state (user_id) values (new.id);
  return new;
end;
$$;

-- Seul le Slack de Guest Suite crée une identité : quelqu'un d'un autre workspace peut se
-- connecter, mais ne reçoit aucune carte et ne réclame aucun handle.
-- `on conflict do nothing` : un handle déjà réclamé ne doit pas faire échouer la connexion.
create function public.handle_new_identity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
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

create trigger on_auth_identity_created
  after insert on auth.identities
  for each row execute procedure public.handle_new_identity();

-- Rattrapage : les comptes Slack créés avant ce trigger (dont le compte de test).
insert into public.identities (user_id, source, handle)
select i.user_id, 'slack', i.provider_id
from auth.identities i
where i.provider = 'slack_oidc'
  and i.identity_data -> 'custom_claims' ->> 'https://slack.com/team_id' = 'T04HSC3TM'
on conflict do nothing;

-- Le classement nommait « inconnu » tout joueur sans login GitHub. Même signature : les
-- droits d'exécution posés par 2026-09-30-leaderboard.sql restent en place.
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
    coalesce(
      u.raw_user_meta_data ->> 'user_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'full_name',
      'inconnu'
    ) as login,
    coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') as avatar_url,
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

commit;
