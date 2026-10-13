-- PR-DEX — schéma Supabase. À coller dans SQL Editor (Supabase dashboard) et exécuter une fois.
-- Base déjà en service : ne pas rejouer ce fichier, appliquer `supabase/migrations/` à la place.

-- profiles : une ligne par personne connectée, créée automatiquement à la première connexion.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

-- identities : comment chaque source reconnaît une personne, une ligne par (personne, source).
--
-- Séparée de `profiles` parce que la façon dont on se connecte n'est pas la façon dont une
-- source nous reconnaît : quelqu'un hors de l'équipe technique n'a pas de compte GitHub, et
-- une même personne peut relever de plusieurs sources à la fois. `config` porte le réglage
-- propre à la source (ex. `{"repos": ["moi/atlas"]}` pour github).
--
-- `unique (source, handle)` n'est pas décoratif : sans lui, réclamer le handle de quelqu'un
-- d'autre suffirait à recevoir ses captures.
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

-- Lecture seule pour le joueur, volontairement : pouvoir réécrire son `handle` suffirait à
-- prendre celui d'un collègue pas encore inscrit, et `config.repos` à faire compter ses
-- dépôts personnels. Les lignes s'écrivent par le trigger `on_auth_identity_created` ou à la main.
create policy "identities_select_own" on public.identities
  for select using (auth.uid() = user_id);

-- catches : l'historique des captures, toutes sources confondues. Écrit uniquement par
-- l'Action (service_role, contourne RLS). Les joueurs n'ont qu'un accès en lecture sur leurs
-- propres lignes — jamais d'écriture directe : un seul écrivain par table.
--
-- `label`, `ref` et `url` sont ce que le front affiche, sans jamais savoir de quelle source
-- ils viennent — c'est au connecteur de les remplir dans le vocabulaire de son pôle.
create table public.catches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  external_id text not null,
  label text not null,
  ref text,
  url text,
  date date not null,
  species integer not null,
  shiny boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

alter table public.catches enable row level security;

create policy "catches_select_own" on public.catches
  for select using (auth.uid() = user_id);

-- state : équivalent de l'ancien state.json. `version` remplace le SHA de blob git comme
-- jeton de concurrence optimiste — même principe, autre mécanisme de stockage.
-- `claimed` et `evolutions[].fromKey` portent des clés d'exemplaire `source:external_id`
-- (cf. `shared/entry.js`), jamais un identifiant nu.
create table public.state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  claimed jsonb not null default '[]'::jsonb,
  spent jsonb not null default '{}'::jsonb,
  evolutions jsonb not null default '[]'::jsonb,
  version integer not null default 0
);

alter table public.state enable row level security;

create policy "state_select_own" on public.state
  for select using (auth.uid() = user_id);

create policy "state_update_own" on public.state
  for update using (auth.uid() = user_id);

-- Auto-création du profil et de l'état vide à l'inscription. Les identités viennent de
-- `handle_new_identity`, plus bas.
create function public.handle_new_user()
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Identité de chaque source qu'une connexion prouve : le login pour `github`, l'identifiant
-- de membre pour `slack`. Sur `auth.identities` plutôt que `auth.users` pour voir aussi la
-- liaison d'un compte après l'inscription : voir
-- supabase/migrations/2026-10-13-connexion-slack.sql pour le pourquoi. Seul le workspace
-- Slack de Guest Suite crée une identité. `on conflict do nothing` parce qu'un handle déjà
-- réclamé ne doit pas faire échouer la connexion elle-même.
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
    and new.identity_data -> 'custom_claims' ->> 'https://slack.com/team_id' = 'T_GUESTSUITE' then
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

-- leaderboard_players : voir supabase/migrations/2026-09-30-leaderboard.sql pour le pourquoi.
create function public.leaderboard_players()
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

-- `anon` est nommé explicitement : les privilèges par défaut de Supabase accordent EXECUTE
-- sur toute nouvelle fonction à anon/authenticated/service_role, et un `revoke ... from
-- public` ne retire pas un droit accordé nommément. Sans cette ligne, la clé anon — publique
-- par construction — suffirait à appeler la fonction sans compte.
revoke execute on function public.leaderboard_players() from public, anon;
grant execute on function public.leaderboard_players() to authenticated;
