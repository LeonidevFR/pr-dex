-- Bascule d'une source unique (GitHub) vers un registre de sources.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur une base déjà en
-- service. Une base neuve part directement de `supabase/schema.sql`.
--
-- Ordre de déploiement : appliquer cette migration AVANT de merger le front. Le front lu
-- depuis Pages lit `source`/`external_id`/`label` ; tant que la base porte encore
-- `sha`/`repo`/`pr`/`title`, il ne lit rien.
--
-- Tout est dans une transaction : en cas d'échec en cours de route, rien n'est appliqué.

begin;

-- 1. identities — reprise de ce que `profiles` portait de spécifique à GitHub.

create table public.identities (
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  handle text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, source),
  unique (source, handle)
);

alter table public.identities enable row level security;

create policy "identities_select_own" on public.identities
  for select using (auth.uid() = user_id);

create policy "identities_update_own" on public.identities
  for update using (auth.uid() = user_id);

insert into public.identities (user_id, source, handle, config)
select
  user_id,
  'github',
  github_login,
  case
    when coalesce(array_length(watch_repos, 1), 0) = 0 then '{}'::jsonb
    else jsonb_build_object('repos', to_jsonb(watch_repos))
  end
from public.profiles
where github_login is not null;

-- 2. catches — colonnes génériques, remplies depuis les colonnes GitHub avant de les retirer.

alter table public.catches
  add column source text,
  add column external_id text,
  add column label text,
  add column ref text,
  add column url text;

update public.catches set
  source = 'github',
  external_id = sha,
  label = title,
  ref = repo || '#' || pr || ' · ' || left(sha, 7),
  url = 'https://github.com/' || repo || '/pull/' || pr;

alter table public.catches
  alter column source set not null,
  alter column external_id set not null,
  alter column label set not null;

-- Nom de contrainte auto-généré par Postgres pour `unique (user_id, sha)`. S'il diffère sur
-- cette base, le retrouver avec `\d public.catches` avant de rejouer.
alter table public.catches drop constraint catches_user_id_sha_key;

alter table public.catches
  add constraint catches_user_id_source_external_id_key unique (user_id, source, external_id);

alter table public.catches
  drop column sha,
  drop column repo,
  drop column pr,
  drop column title;

-- 3. state — les clés d'exemplaire prennent leur préfixe de source.
--
-- `claimed` et `evolutions[].fromKey` référençaient un sha nu, qui n'identifie plus rien à
-- lui seul. Les clés d'évolution (`evo:N`) désignent un exemplaire produit par le jeu, pas
-- par une source : elles ne prennent aucun préfixe. `fromSha` (écrit par une version
-- antérieure à `fromKey`) est préfixé sans être restructuré — le front sait encore le lire.

update public.state set
  claimed = coalesce((
    select jsonb_agg('github:' || value order by ord)
    from jsonb_array_elements_text(claimed) with ordinality as t(value, ord)
  ), '[]'::jsonb),
  evolutions = coalesce((
    select jsonb_agg(
      case
        when e ? 'fromKey' and e ->> 'fromKey' not like 'evo:%'
          then jsonb_set(e, '{fromKey}', to_jsonb('github:' || (e ->> 'fromKey')))
        when e ? 'fromSha'
          then jsonb_set(e, '{fromSha}', to_jsonb('github:' || (e ->> 'fromSha')))
        else e
      end
      order by ord
    )
    from jsonb_array_elements(evolutions) with ordinality as t(e, ord)
  ), '[]'::jsonb);

-- 4. profiles — ne porte plus rien de spécifique à une source, donc plus rien à y écrire.

drop policy if exists "profiles_update_own" on public.profiles;

alter table public.profiles
  drop column github_login,
  drop column watch_repos;

-- 5. Trigger d'inscription — crée désormais l'identité GitHub au lieu de la coller au profil.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.state (user_id) values (new.id);

  if new.raw_user_meta_data ->> 'user_name' is not null then
    insert into public.identities (user_id, source, handle)
    values (new.id, 'github', new.raw_user_meta_data ->> 'user_name')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

commit;
