-- Socle base de données du mode arène : la fonction de hachage partagée, les tables, leurs
-- policies et les vues qui exposent ce qu'un adversaire a le droit de voir.
--
-- À coller dans l'éditeur SQL du dashboard pour la mise en service, comme la bascule de
-- juillet. Tout est dans une transaction : en cas d'échec en cours de route, rien n'est
-- appliqué.

begin;

-- fnv1a — le SEUL endroit du projet où une logique existe en deux exemplaires, ici et dans
-- `shared/draw.js`. Le client affiche la forme du jour d'un Pokémon avant qu'on l'engage, le
-- serveur la recalcule pour résoudre le duel : les deux doivent tomber sur le même octet.
-- `scripts/fnv1a-parity.test.js` le vérifie sur les entrées réelles du jeu.
--
-- Limite assumée : `ascii()` rend le point de code Unicode là où `charCodeAt` rend une unité
-- UTF-16. La parité est donc garantie pour les chaînes dont tous les points de code sont sous
-- U+10000 et sans surrogate isolé — ce qui couvre tout ce que le jeu hache : des identifiants
-- de source, des sha, des dates. Un surrogate isolé casserait le transport UTF-8 avant même
-- d'atteindre cette fonction ; une clé d'exemplaire venant un jour d'un champ libre devrait
-- donc être validée en amont.
create or replace function public.fnv1a(input text) returns bigint
language plpgsql immutable strict as $$
declare
  h bigint := 2166136261;   -- 0x811c9dc5
  i int;
begin
  for i in 1 .. length(input) loop
    h := h # ascii(substr(input, i, 1)) :: bigint;
    h := (h * 16777619) & 4294967295;
  end loop;
  return h;
end;
$$;

-- Les stats de base, copie en base du module `shared/species-stats.js`. La fonction de combat
-- du lot 2b les lira ici ; le moteur JavaScript les lit là-bas. Le même passage du générateur
-- produit les deux, pour qu'elles ne puissent pas diverger en silence.
create table public.species_stats (
  species int primary key,
  stats int not null check (stats > 0)
);

alter table public.species_stats enable row level security;

-- Lisible par tout le monde, écrite par personne : la donnée n'a rien de secret, mais une
-- écriture y fausserait tous les duels à venir.
create policy "species_stats_select_all" on public.species_stats
  for select to authenticated using (true);

-- Niveau et destruction d'un exemplaire précis, repéré par sa clé `source:external_id`
-- (cf. `shared/entry.js`). Séparé de `state`, qui est modifiable par son propriétaire : un
-- niveau gagné et un exemplaire détruit engagent un adversaire, pas seulement soi-même.
create table public.arena_exemplars (
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_key text not null,
  level int not null default 1 check (level between 1 and 10),
  wins int not null default 0 check (wins >= 0),
  destroyed_at timestamptz,
  primary key (user_id, entry_key)
);

-- Un duel, de son engagement à sa résolution. Les puissances et la probabilité sont
-- conservées telles qu'elles ont été calculées : le résumé de combat les rejoue, et un
-- joueur qui vient de perdre un Pokémon a le droit de vérifier plutôt que de croire.
create table public.arena_duels (
  id bigint generated always as identity primary key,
  challenger_id uuid not null references auth.users (id) on delete cascade,
  challenger_key text not null,
  opponent_id uuid references auth.users (id) on delete cascade,
  opponent_key text,
  status text not null default 'open' check (status in ('open', 'resolved', 'computer')),
  winner_id uuid references auth.users (id),
  stake_tier text check (stake_tier in ('c', 'u', 'r', 'l')),
  challenger_power numeric,
  opponent_power numeric,
  probability numeric,
  roll numeric,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index arena_duels_open_idx on public.arena_duels (created_at) where status = 'open';

-- Portefeuille persistant, jamais remis à zéro : c'est ce qui rend la thésaurisation possible
-- sur plusieurs saisons. Le score de saison, lui, repart de zéro — d'où deux tables et non
-- deux colonnes.
create table public.arena_wallet (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pokedollars int not null default 0 check (pokedollars >= 0)
);

create table public.arena_season_points (
  user_id uuid not null references auth.users (id) on delete cascade,
  season text not null,
  points int not null default 0 check (points >= 0),
  primary key (user_id, season)
);

-- Les saisons closes et leur podium. Sans cette table, un badge permanent n'aurait plus aucun
-- référent une fois les points de la saison remis à zéro.
create table public.arena_seasons (
  season text primary key,
  closed_at timestamptz not null default now(),
  first_id uuid references auth.users (id),
  second_id uuid references auth.users (id),
  third_id uuid references auth.users (id)
);

alter table public.arena_exemplars enable row level security;
alter table public.arena_duels enable row level security;
alter table public.arena_wallet enable row level security;
alter table public.arena_season_points enable row level security;
alter table public.arena_seasons enable row level security;

-- Lecture seule, et rien d'autre. L'unique écrivain de ces tables sera la fonction
-- `security definer` du lot 2b : une policy d'écriture ici serait une faille, pas une
-- facilité — elle laisserait un joueur s'attribuer des niveaux ou effacer sa défaite.
create policy "arena_exemplars_select_own" on public.arena_exemplars
  for select using (auth.uid() = user_id);

create policy "arena_wallet_select_own" on public.arena_wallet
  for select using (auth.uid() = user_id);

create policy "arena_season_points_select_all" on public.arena_season_points
  for select to authenticated using (true);

create policy "arena_seasons_select_all" on public.arena_seasons
  for select to authenticated using (true);

-- Un duel résolu est lisible par ses deux participants. Un duel ouvert ne l'est par personne
-- en direct : la mise ne doit pas seulement être masquée à l'affichage, elle ne doit pas être
-- lisible du tout, sinon un appel direct à l'API la révélerait. Les défis ouverts passent par
-- la vue `arena_open_challenges`, qui n'en expose pas la mise.
create policy "arena_duels_select_resolved_own" on public.arena_duels
  for select using (
    status <> 'open' and (auth.uid() = challenger_id or auth.uid() = opponent_id)
  );

-- Droits explicites plutôt que privilèges par défaut. La lecture doit être accordée pour que
-- RLS ait quelque chose à filtrer : sans `grant`, un joueur est refusé au niveau des droits
-- et la policy n'est jamais évaluée — ce qui rendrait les tests d'isolation trompeurs et,
-- en production, le front incapable de lire l'arène.
--
-- Aucun `insert`, `update` ni `delete` n'est accordé à quiconque : l'unique écrivain de ces
-- tables sera la fonction `security definer` du lot 2b, qui s'exécute sous son propre droit.
grant select on public.species_stats, public.arena_exemplars, public.arena_duels,
                public.arena_wallet, public.arena_season_points, public.arena_seasons
  to authenticated;

commit;
