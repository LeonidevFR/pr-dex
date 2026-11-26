-- Cartes équipe de Noël : l'équipe, ses cartes gagnées, et le bucket des photos.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur la base en
-- service, AVANT de merger le front. Une base neuve part de `supabase/schema.sql`.
--
-- Crée deux tables, un bucket et une politique de lecture. Aucune table existante modifiée.
-- Retour arrière : `drop policy "equipe_select_authenticated" on storage.objects;
-- drop table public.team_cards; drop table public.team_members;` puis vider et supprimer le
-- bucket `equipe` depuis le dashboard.

begin;

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
-- Sauté quand Storage est absent : la base locale le coupe (supabase/config.toml), la
-- production l'a toujours.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage absent : bucket equipe non créé.';
    return;
  end if;

  insert into storage.buckets (id, name, public) values ('equipe', 'equipe', false)
    on conflict (id) do nothing;

  create policy "equipe_select_authenticated" on storage.objects
    for select to authenticated using (bucket_id = 'equipe');
end
$$;

commit;
