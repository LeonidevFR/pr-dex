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

-- La seule donnée personnelle qu'un adversaire lira. `unique` parce qu'un pseudo qu'on peut
-- usurper ne sert à rien dans une arène où l'on choisit qui l'on affronte.
alter table public.profiles add column pseudo text unique;

-- Un joueur choisit son pseudonyme, et celui-là seulement. `with check` autant que `using` :
-- sans lui, on pourrait passer la ligne d'autrui sous son propre identifiant.
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant update (pseudo) on public.profiles to authenticated;

-- L'unicité posée à la création de la colonne est sensible à la casse et aux espaces, donc
-- inopérante contre ce qu'elle vise : dans une arène où l'on choisit son adversaire sur la foi
-- d'un nom, `Leo` et `leo` côte à côte suffisent à se faire passer pour l'autre.
-- Un index unique sur expression ne peut pas être promu en contrainte (Postgres l'interdit :
-- « cannot create a unique constraint using such an index » dès que l'index porte sur une
-- expression, ici `lower(trim(...))`) ; il reste donc un index, visible dans `pg_indexes` et
-- non dans `pg_constraint`. Le test du lot 2a qui vérifiait l'unicité via `pg_constraint` est
-- mis à jour en conséquence dans `scripts/arena-visibility.test.js`.
alter table public.profiles drop constraint profiles_pseudo_key;
create unique index profiles_pseudo_unique on public.profiles (lower(trim(pseudo)));

-- Les vues appartiennent au propriétaire du schéma et s'exécutent sous ses droits : elles
-- traversent donc RLS. C'est voulu, et c'est pour ça qu'elles n'exposent QUE des colonnes
-- dont la publication a été tranchée dans la spec § 5.
create view public.arena_players as
  select user_id, pseudo from public.profiles where pseudo is not null;

-- `left join` et non `join` : le pseudonyme est facultatif, le défi ne l'est pas. Une jointure
-- interne ferait disparaître de la liste le défi d'un joueur sans pseudo — ou dont la ligne
-- `profiles` manquerait — alors que ce défi existe bel et bien et que sa mise est déjà
-- immobilisée. Le défi resterait ouvert sans que personne puisse le relever. Un `pseudo` nul
-- est un problème d'affichage, que le front résout par un libellé de repli ; un défi absent
-- est un problème de jeu, que rien ne rattrape.
create view public.arena_open_challenges as
  select d.id, d.challenger_id, p.pseudo, d.created_at
  from public.arena_duels d
  left join public.profiles p on p.user_id = d.challenger_id
  where d.status = 'open';

-- Quelles espèces, jamais combien d'exemplaires : le `distinct` n'est pas une optimisation,
-- c'est la règle produit. Le nombre d'espèces plafonne à 151 et sature vite ; le nombre
-- d'exemplaires, lui, ne plafonne jamais — c'est un compteur brut de pull requests mergées,
-- et le publier dans une entreprise revient à publier un classement de productivité.
create view public.arena_public_dex as
  select distinct user_id, species from public.catches;

-- Même piège que sur les tables : sans `grant` explicite, `authenticated` n'a aucun privilège
-- par défaut sur ce schéma et le joueur est refusé au niveau des droits — la vue ne servirait
-- à rien. Les trois vues sont couvertes.
grant select on public.arena_players, public.arena_open_challenges, public.arena_public_dex
  to authenticated;

-- La forme du jour se calcule des deux côtés et ne se stocke jamais : le client l'affiche
-- avant qu'on engage son Pokémon, le serveur la recalcule pour résoudre le duel. La chaîne
-- hachée est un CONTRAT — `${key}:forme:${day}` — répliquée caractère pour caractère depuis
-- `formOf` de `shared/battle.js` ; un deux-points de différence donnerait une autre forme
-- pour le même exemplaire. `scripts/arena-combat-parity.test.js` le vérifie.
create or replace function public.arena_form_index(entry_key text, day text)
returns int language sql immutable strict as $$
  select (public.fnv1a(entry_key || ':forme:' || day) % 5) :: int
$$;

-- Cinq états, du plus faible au plus fort, dans l'ordre de `FORMS`. `double precision` et non
-- `numeric` : le moteur JavaScript calcule en IEEE 754, et un écart au dernier bit suffirait à
-- changer le vainqueur d'un duel serré — donc quel Pokémon est détruit.
create or replace function public.arena_form_factor(idx int)
returns double precision language sql immutable strict as $$
  select (array[0.90, 0.95, 1.00, 1.05, 1.10] :: double precision[])[idx + 1]
$$;

commit;
