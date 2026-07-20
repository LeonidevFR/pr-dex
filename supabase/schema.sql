-- PR-DEX — schéma Supabase. À coller dans SQL Editor (Supabase dashboard) et exécuter une fois.

-- profiles : une ligne par dev connecté, créée automatiquement à la première connexion OAuth GitHub.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  github_login text not null,
  watch_repos text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);

-- catches : l'historique des captures. Écrit uniquement par l'Action (service_role, contourne RLS).
-- Les devs n'ont qu'un accès en lecture sur leurs propres lignes — jamais d'écriture directe,
-- même règle qu'avant : un seul écrivain par table.
create table public.catches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sha text not null,
  repo text not null,
  pr integer not null,
  title text not null,
  date date not null,
  species integer not null,
  shiny boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, sha)
);

alter table public.catches enable row level security;

create policy "catches_select_own" on public.catches
  for select using (auth.uid() = user_id);

-- state : équivalent de l'ancien state.json. `version` remplace le SHA de blob git comme
-- jeton de concurrence optimiste — même principe, autre mécanisme de stockage.
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

-- Auto-création du profil et de l'état vide à l'inscription. `raw_user_meta_data->>'user_name'`
-- est le login GitHub tel que peuplé par le provider OAuth GitHub de Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, github_login)
  values (new.id, new.raw_user_meta_data ->> 'user_name');

  insert into public.state (user_id) values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
