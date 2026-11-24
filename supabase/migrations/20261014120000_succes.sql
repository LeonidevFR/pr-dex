-- Succès : ce que chaque joueur a débloqué.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur la base en
-- service, AVANT de merger le front. Une base neuve part de `supabase/schema.sql`.
--
-- Crée une table et une fonction. Aucune table existante modifiée, aucun rattrapage : le front
-- insère au premier chargement les succès que les données remplissent déjà.
-- Retour arrière : `drop function public.achievement_counts(); drop table public.achievements;`

begin;

-- Écrite par le front, en insertion seule : les règles vivent dans `src/lib/achievements.js`,
-- qui tourne au retournement d'une carte, chose que l'Action ne voit pas. Un joueur peut donc
-- s'insérer un succès depuis la console ; c'est déjà vrai de `state.evolutions`.
--
-- `announced` dit si le succès a été montré (toast ou récap). C'est la seule colonne
-- modifiable : un succès obtenu ne se retire ni ne se réécrit.
create table public.achievements (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null,
  unlocked_at date not null,
  trigger_key text,
  announced boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.achievements enable row level security;

create policy "achievements_select_own" on public.achievements
  for select using (auth.uid() = user_id);

create policy "achievements_insert_own" on public.achievements
  for insert with check (auth.uid() = user_id);

create policy "achievements_update_own" on public.achievements
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Les privilèges par défaut de Supabase accordent tout à anon et authenticated sur une
-- nouvelle table. On repart de rien, puis on n'ouvre que la lecture, l'insertion et la mise à
-- jour de `announced`.
revoke all on public.achievements from anon, authenticated;
grant select, insert on public.achievements to authenticated;
grant update (announced) on public.achievements to authenticated;

-- Le nombre de joueurs par succès, seule lecture qui traverse RLS. Ne renvoie ni qui, ni quand.
create function public.achievement_counts()
returns table (code text, players integer)
language sql
security definer
set search_path = public
stable
as $$
  select a.code, count(*)::integer from public.achievements a group by a.code;
$$;

-- Même raison que pour `leaderboard_players()` : sans `anon` nommé, la clé publique suffirait.
revoke execute on function public.achievement_counts() from public, anon;
grant execute on function public.achievement_counts() to authenticated;

commit;
