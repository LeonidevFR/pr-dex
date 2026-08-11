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

-- Le palier est une propriété de la planche, au même titre que le total des stats : il vit
-- donc dans la même table, peuplée par le même passage du générateur, plutôt que dans une
-- table `species` séparée qu'il faudrait joindre partout et tenir synchronisée à part.
--
-- Ni valeur par défaut ni `not null` rétroactif à négocier : la colonne est ajoutée alors que
-- la table vient d'être créée dans cette même transaction et qu'elle est encore vide — le
-- seed la remplit juste après. Un défaut serait un palier faux pour toute espèce que le seed
-- oublierait, là où `not null` sans défaut fait échouer l'insertion bruyamment.
alter table public.species_stats
  add column tier text not null check (tier in ('c', 'u', 'r', 'l'));

-- Coefficients de rareté. Légers sur les trois premiers paliers, parce que les stats portent
-- déjà l'écart et qu'un coefficient lourd le compterait deux fois ; marqué sur le légendaire,
-- dont le pool (580-680) chevauche le haut du pool rare (jusqu'à 600) — les stats seules ne
-- séparent pas ces deux paliers-là.
create or replace function public.arena_tier_power(tier text)
returns double precision language sql immutable strict as $$
  select case tier when 'c' then 1.00 when 'u' then 1.06
                   when 'r' then 1.15 when 'l' then 1.45 end :: double precision
$$;

-- `0.05` est explicitement en `double precision` : laissé en `numeric`, Postgres calculerait
-- `0.05 * 6` en décimal exact (1,30) là où JavaScript rend 1,3000000000000003. Les deux
-- puissances divergeraient dès le niveau 7, et avec elles la probabilité du duel.
create or replace function public.arena_level_factor(level int)
returns double precision language sql immutable strict as $$
  select 1 + 0.05 :: double precision * (level - 1)
$$;

-- `stable` et non `immutable` : la puissance dépend d'une table. Même ordre de multiplication
-- que `power()` de `shared/battle.js` — en flottant, `(a * b) * c` et `a * (b * c)` ne donnent
-- pas toujours le même dernier bit.
--
-- Espèce inconnue : aucune ligne, donc `null`, et non un zéro silencieux. Un zéro se
-- propagerait jusqu'à la probabilité et rendrait un duel plausible et faux ; `null` remonte.
create or replace function public.arena_power(species int, level int, form_idx int)
returns double precision language sql stable strict as $$
  select s.stats * public.arena_tier_power(s.tier)
       * public.arena_level_factor(level) * public.arena_form_factor(form_idx)
  from public.species_stats s
  where s.species = arena_power.species
$$;

-- Élévation au cube et non rapport direct : un rapport direct laisserait un Rattata battre
-- Électhor près d'une fois sur trois, ce que l'écart de stats ne justifie pas. Le bornage à
-- [0,10 ; 0,90] garantit qu'aucun duel n'est gagné d'avance et que tout légendaire descendu
-- régulièrement finit par tomber.
--
-- Seul endroit du combat où SQL et JavaScript ne peuvent PAS coïncider au dernier bit : `^`
-- appelle le `pow()` de la glibc, correctement arrondi, là où le `**` de V8 s'en écarte d'un
-- ulp sur certaines entrées. Mesuré sur les 151 espèces × 6 niveaux × 5 formes : `a ^ 3`
-- s'écarte du JavaScript sur 7,6 % des duels, `a * a * a` sur 20,8 % — d'où `^`, et non la
-- multiplication répétée qui paraîtrait pourtant plus « exacte ». L'écart relatif plafonne à
-- 4,3e-16, soit deux ulp : il ne peut changer un vainqueur que si le tirage tombe dans cette
-- fenêtre, une fois sur 1e15 environ. Le test de parité tolère donc 12 décimales ici, et
-- seulement ici — partout ailleurs l'égalité est stricte.
create or replace function public.arena_win_probability(a double precision, b double precision)
returns double precision language sql immutable strict as $$
  select least(0.90 :: double precision,
               greatest(0.10 :: double precision, a ^ 3 / (a ^ 3 + b ^ 3)))
$$;

-- Seuils croissants sur le rapport ADVERSAIRE / SOI, et jamais l'inverse. Écraser plus faible
-- que soi rend 0 : c'est ce qui rend stérile l'acharnement sur les petits joueurs, sans qu'une
-- règle ait à l'interdire. Le rapport inversé donnerait exactement la stratégie contraire —
-- c'est le seul endroit du portage où une erreur de sens ne casse rien et change tout.
--
-- Comparaisons strictes (`<`) et seuils en `double precision` : un seuil laissé en `numeric`
-- ferait remonter la division en décimal exact et le rapport tomberait du bon côté d'un seuil
-- que le JavaScript place de l'autre.
create or replace function public.arena_level_gain(mine double precision, theirs double precision)
returns int language sql immutable strict as $$
  select case
    when theirs / mine < 0.75 :: double precision then 0
    when theirs / mine < 1.10 :: double precision then 1
    when theirs / mine < 1.50 :: double precision then 2
    when theirs / mine < 2.00 :: double precision then 3
    else 5
  end
$$;

-- Les slugs de `FORMS`, dans l'ordre. Ils ne servent qu'à la clé de tri du duel : la forme
-- elle-même passe par son facteur. Ce sont donc bien les slugs du JavaScript qu'il faut, et
-- pas des noms d'affichage — ils entrent dans une comparaison de chaînes.
create or replace function public.arena_form_slug(idx int)
returns text language sql immutable strict as $$
  select (array['epuise', 'fatigue', 'normal', 'en-forme', 'pleine-forme'])[idx + 1]
$$;

-- Clé de tri canonique d'un exemplaire, reprise de `sortKey` dans `shared/battle.js`. La clé
-- d'exemplaire vient en tête parce qu'elle est la seule des quatre composantes à être unique :
-- espèce, niveau et forme laissent ex æquo deux exemplaires jumeaux — deux joueurs engageant la
-- même espèce au même niveau, avec la même forme du jour une fois sur cinq.
create or replace function public.arena_sort_key(entry_key text, species int, level int, form_idx int)
returns text language sql immutable strict as $$
  select entry_key || ':' || species || ':' || level || ':' || public.arena_form_slug(form_idx)
$$;

-- Résolution complète d'un duel, portage de `resolveDuel`. Le serveur l'appelle pour écrire
-- l'issue, le client rejoue la même chose en JavaScript pour l'afficher : les deux doivent
-- désigner le même vainqueur, sinon le résumé de combat devient une affirmation à croire sur
-- parole. `scripts/arena-combat-parity.test.js` compare les deux moteurs sur 2 200 duels.
--
-- Trois points de portage à ne pas relâcher :
--
--  1. Le tirage vient de `fnv1a(seed || ':issue') / 2^32`, exactement comme en JavaScript — la
--     division par une puissance de deux est exacte des deux côtés, donc le tirage se compare
--     au bit près (contrairement à la probabilité, qui passe par `pow()`).
--
--  2. Le tirage est confronté au camp canoniquement PREMIER et non à `left`. Sans cela,
--     échanger les deux camps à seed égal change le vainqueur près d'une fois sur trois — le
--     bug a existé dans le JavaScript et y a été corrigé. Or le serveur résout un duel
--     challenger / preneur et le client le rejoue dans l'ordre qui l'arrange.
--
--  3. `collate "C"` sur la comparaison des clés de tri : JavaScript compare les chaînes unité
--     de code par unité de code, là où la collation par défaut de la base range les signes de
--     ponctuation selon des règles linguistiques. Les clés contiennent `:` et `-` — sous une
--     collation linguistique, le camp canoniquement premier ne serait pas le même des deux
--     côtés, et l'anti-symétrie se retournerait contre nous.
--
-- `stable` : la puissance dépend de `species_stats`.
create or replace function public.arena_resolve(
  left_key text, left_species int, left_level int,
  right_key text, right_species int, right_level int,
  day text, seed text)
returns table (
  winner text, probability double precision, roll double precision,
  left_power double precision, right_power double precision,
  gain int, level_after int)
language sql stable strict as $$
  with f as (
    select public.arena_form_index(arena_resolve.left_key, arena_resolve.day) as lf,
           public.arena_form_index(arena_resolve.right_key, arena_resolve.day) as rf
  ),
  p as (
    select f.lf, f.rf,
           public.arena_power(arena_resolve.left_species, arena_resolve.left_level, f.lf) as lp,
           public.arena_power(arena_resolve.right_species, arena_resolve.right_level, f.rf) as rp
    from f
  ),
  d as (
    select p.lp, p.rp,
           public.arena_win_probability(p.lp, p.rp) as prob,
           public.fnv1a(arena_resolve.seed || ':issue') :: double precision
             / 4294967296 :: double precision as draw,
           public.arena_sort_key(arena_resolve.left_key, arena_resolve.left_species,
                                 arena_resolve.left_level, p.lf) collate "C"
             <= public.arena_sort_key(arena_resolve.right_key, arena_resolve.right_species,
                                      arena_resolve.right_level, p.rf) collate "C" as left_first
    from p
  ),
  i as (
    -- `firstWins` porte sur le camp canoniquement premier ; l'issue de `left` s'en déduit par
    -- négation quand c'est `right` qui est premier.
    select d.*,
           case when d.left_first then d.draw < d.prob
                else not (d.draw < public.arena_win_probability(d.rp, d.lp)) end as left_wins
    from d
  )
  select case when i.left_wins then 'left' else 'right' end,
         i.prob,
         i.draw,
         i.lp,
         i.rp,
         -- Le gain se lit du point de vue du VAINQUEUR : sa puissance en premier argument,
         -- celle du perdant en second.
         public.arena_level_gain(case when i.left_wins then i.lp else i.rp end,
                                 case when i.left_wins then i.rp else i.lp end),
         -- Plafond à 10 : un exploit rapporte cinq niveaux, jamais au-delà de `LEVEL_MAX`.
         least(10, (case when i.left_wins then arena_resolve.left_level
                         else arena_resolve.right_level end)
                   + public.arena_level_gain(case when i.left_wins then i.lp else i.rp end,
                                             case when i.left_wins then i.rp else i.lp end))
  from i
$$;

-- Le lundi de la semaine de `at`, en heure de Paris.
--
-- Le fuseau n'est pas une coquetterie d'affichage : « remise à zéro le dimanche à 23h59 » ne
-- désigne aucun instant tant qu'on n'a pas dit 23h59 où, et l'équipe est à Paris. Un
-- `date_trunc('week', at)` laissé en UTC ferait basculer la semaine deux heures trop tard de
-- mars à octobre, une heure trop tard le reste de l'année — c'est-à-dire au mauvais moment
-- toute l'année, et d'un décalage qui change en cours de route.
--
-- `immutable` est ici exact et non optimiste : `timezone(text, timestamptz)` et le
-- `date_trunc` sur un `timestamp` nu ne dépendent ni de la transaction ni du `TimeZone` de la
-- session, seulement de leurs arguments.
create or replace function public.arena_week_start(at timestamptz)
returns date language sql immutable strict as $$
  select date_trunc('week', at at time zone 'Europe/Paris') :: date
$$;

-- Crédits d'engagement restants, entre 0 et 5.
--
-- Déduits, jamais stockés. Un compteur en table finit toujours par diverger de ce qu'il
-- prétend décrire : un duel annulé, une transaction interrompue, un correctif appliqué à la
-- main, et le chiffre ment sans que personne ne s'en aperçoive. Une soustraction recalculée à
-- chaque appel ne le peut pas — elle ne dérive que du calendrier et des duels réellement
-- enregistrés, deux choses qu'on peut relire.
--
-- Acquis : un crédit par jour ouvré écoulé depuis le lundi. Le jour en cours compte dès son
-- premier instant, sinon un joueur devrait attendre minuit pour dépenser le crédit du jour.
-- `least(5, isodow)` suffit à dire les deux règles à la fois : lundi 1 … vendredi 5, puis le
-- week-end reste à 5 puisqu'il n'ouvre aucun crédit et que le plafond est atteint. Pas besoin
-- de dérouler la semaine jour par jour pour compter ce que la position dans la semaine dit
-- déjà.
--
-- Dépensé : tout duel de la semaine où `uid` figure, qu'il ait posté le défi ou qu'il l'ait
-- relevé — la spec ne distingue pas les deux, et le statut du duel n'entre pas en compte :
-- c'est l'engagement qui coûte, pas son issue.
--
-- La borne haute `created_at <= at` fait de la fonction une lecture d'un instant donné et non
-- de « maintenant » : interrogée sur un lundi passé, elle ne se laisse pas amputer par des
-- duels qui n'avaient pas encore eu lieu. Sans elle, les tests d'un solde daté seraient à la
-- merci de l'historique postérieur.
create or replace function public.arena_credits(uid uuid, at timestamptz default now())
returns int language sql stable as $$
  select greatest(0,
    least(5, extract(isodow from at at time zone 'Europe/Paris') :: int)
    - (
      select count(*) :: int
      from public.arena_duels d
      where (d.challenger_id = arena_credits.uid or d.opponent_id = arena_credits.uid)
        -- Le lundi est une date parisienne : la reconvertir en instant dans ce même fuseau,
        -- et non par le cast implicite qui utiliserait le `TimeZone` de la session.
        and d.created_at >= (public.arena_week_start(arena_credits.at) :: timestamp
                             at time zone 'Europe/Paris')
        and d.created_at <= arena_credits.at
    ))
$$;

commit;
