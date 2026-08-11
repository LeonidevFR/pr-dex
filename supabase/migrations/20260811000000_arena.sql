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

-- Son propre défi ouvert, en revanche, reste lisible par celui qui l'a posé — sa mise comprise.
-- Le secret de la mise protège le pari contre l'ADVERSAIRE, pas contre soi-même : l'exemplaire
-- engagé est immobilisé tant que le défi tient, et son propriétaire doit pouvoir savoir lequel
-- il a mis en jeu. Sans cette policy, il verrait un Pokémon bloqué sans pouvoir dire pourquoi.
create policy "arena_duels_select_own_open" on public.arena_duels
  for select using (status = 'open' and auth.uid() = challenger_id);

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
-- `security definer`, et ce n'est pas un confort : sous RLS, un joueur ne voit PAS ses propres
-- duels ouverts (leur mise est dans la ligne, cf. la policy plus haut). Une lecture en droit
-- d'appelant compterait donc zéro dépense pour un défi posté, et le front afficherait un
-- crédit que `arena_engage` refuse ensuite d'honorer — un compteur qui ment, exactement ce que
-- la déduction plutôt que le stockage cherchait à éviter.
--
-- Conséquence assumée : un joueur peut interroger le solde d'un autre. Ce que cela publie est
-- un entier de 0 à 5 qui ne dit ni la mise, ni l'exemplaire, ni l'issue d'un duel — moins que
-- le classement de saison, déjà public par conception (§ 5).
create or replace function public.arena_credits(uid uuid, at timestamptz default now())
returns int language sql stable security definer set search_path = public as $$
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

-- Même raison que pour `arena_engage` : Postgres accorde `execute` à `public` par défaut, et
-- `public` inclut les visiteurs anonymes. Une fonction `security definer` laissée ouverte à
-- `public` serait lisible sans compte.
revoke execute on function public.arena_credits(uuid, timestamptz) from public;
grant execute on function public.arena_credits(uuid, timestamptz) to authenticated;

-- Les plis dus. Un pli gagné n'est pas encore une capture : il le devient quand le lot 2d le
-- matérialise en ligne `catches` de source `arene`, tirée par `drawFrom` sur sa propre clé
-- (spec § 6). D'où `claimed_at` — la dette et son règlement sont deux moments distincts, et
-- une panne entre les deux ne doit pas faire disparaître le dû.
--
-- `duel_id` porte l'origine du pli et sert de garde-fou : un pli sans duel n'aurait aucune
-- justification relisible. `on delete cascade` parce qu'un duel effacé n'a jamais eu lieu.
create table public.arena_packs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('c', 'u', 'r', 'l')),
  duel_id bigint not null references public.arena_duels (id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

alter table public.arena_packs enable row level security;

-- Lecture de ses propres plis, et rien d'autre. Aucune policy d'écriture : un joueur qui
-- pourrait insérer une ligne ici s'offrirait des plis, et un joueur qui pourrait la mettre à
-- jour rejouerait le sien autant de fois qu'il veut. L'unique écrivain est la fonction
-- `security definer`, qui s'exécute sous son propre droit et ignore ces policies.
create policy "arena_packs_select_own" on public.arena_packs
  for select using (auth.uid() = user_id);

grant select on public.arena_packs to authenticated;

-- Tarif humain en pokédollars, table du § 4. L'ordinateur en paye le CINQUIÈME, dérivé et non
-- recopié : `shared/arena-economy.js` pose exactement la même relation
-- (`COMPUTER_REWARD[t] === REWARD[t].dollars / 5`) et son test la vérifie, si bien que les
-- deux ne peuvent pas diverger en silence. Les quatre tarifs sont multiples de cinq, la
-- division entière est donc exacte.
create or replace function public.arena_reward_dollars(tier text)
returns int language sql immutable strict as $$
  select case tier when 'c' then 50 when 'u' then 100 when 'r' then 250 when 'l' then 600 end
$$;

-- « L'enjeu du duel » : le plus PETIT des deux engagements, la règle du poker. C'est elle qui
-- supprime d'un seul mouvement les deux stratégies dégénérées — écraser un Roucool avec un
-- légendaire, et venir en Roucool pour tenter l'exploit. Portage de `coveredTier`.
create or replace function public.arena_covered_tier(a text, b text)
returns text language sql immutable strict as $$
  select case when array_position(array['c', 'u', 'r', 'l'], a)
                <= array_position(array['c', 'u', 'r', 'l'], b)
              then a else b end
$$;

-- Plafond de niveau du combattant de l'ordinateur : le niveau MÉDIAN des exemplaires
-- réellement engagés dans l'arène ces trente derniers jours (spec § 2). Un plafond fixe ferait
-- de l'ordinateur un adversaire de plus en plus dérisoire à mesure que l'équipe monte ses
-- champions ; la médiane le fait suivre le terrain sans jamais le dépasser.
--
-- Le niveau lu est le niveau ACTUEL de l'exemplaire, pas celui qu'il avait le jour du duel :
-- l'arène ne conserve pas l'historique des niveaux, et l'approximation ne coûte rien ici — on
-- cherche l'ordre de grandeur du terrain, pas une valeur exacte.
--
-- Aucun duel encore joué rend 1 et non zéro : le premier joueur de l'arène doit trouver un
-- adversaire, et `arena_power` sur un niveau nul rendrait une puissance négative.
create or replace function public.arena_field_level_cap()
returns int language sql stable as $$
  select greatest(1, least(10,
    coalesce(percentile_cont(0.5) within group (order by e.level) :: int, 1)))
  from public.arena_duels d
  join public.arena_exemplars e
    on (e.user_id = d.challenger_id and e.entry_key = d.challenger_key)
    or (e.user_id = d.opponent_id and e.entry_key = d.opponent_key)
  where d.created_at >= now() - interval '30 days'
$$;

-- Le combattant de l'ordinateur, tiré d'une graine et de rien d'autre.
--
-- La signature EST la garantie : elle ne prend pas la mise du joueur, donc elle ne peut pas en
-- dépendre. Une version antérieure faisait tirer l'ordinateur dans le pool du palier de la
-- mise adverse ; les deux paliers étant alors égaux par construction, l'enjeu valait toujours
-- la mise du joueur et la règle de l'enjeu était inopérante contre l'ordinateur — engager plus
-- haut payait davantage sans contrepartie, seul endroit du modèle où c'était le cas.
--
-- Le terrain ordinaire n'est PAS la distribution des tirages (`WEIGHTS` de `shared/draw.js`,
-- 45 % de communs) : on tire beaucoup de communs et on n'en engage presque pas — un joueur
-- envoie son champion, pas son stock. D'où une distribution propre, majoritairement du peu
-- commun et du rare, conforme au § 2.
--
-- Aucun légendaire, et c'est délibéré : le § 4 assume que « les légendaires ne descendront
-- jamais dans l'arène », personne n'en tirant assez (~1 par saison) pour encaisser d'en perdre
-- un sur deux. Un ordinateur qui en sortirait ferait payer l'enjeu légendaire — 120 $ — à un
-- adversaire qui ne risque rien, exactement ce que le cinquième cherche à éviter.
--
-- Les trois graines dérivées portent des suffixes distincts : réutiliser la même graine pour
-- le palier et l'espèce corrélerait les deux tirages, et certaines espèces ne sortiraient
-- jamais.
--
-- `stable` : les pools d'espèces viennent de `species_stats`.
create or replace function public.arena_computer_pick(seed text, level_cap int)
returns table (foe_species int, foe_tier text, foe_level int)
language sql stable strict as $$
  with t as (
    select case
      when public.fnv1a(arena_computer_pick.seed || ':ia-palier') :: double precision
             / 4294967296 :: double precision < 0.20 then 'c'
      when public.fnv1a(arena_computer_pick.seed || ':ia-palier') :: double precision
             / 4294967296 :: double precision < 0.65 then 'u'
      else 'r' end :: text as tier
  ),
  pool as (
    -- `order by` explicite : sans lui l'ordre d'agrégation dépendrait du plan, et la même
    -- graine ne rendrait pas toujours la même espèce.
    select t.tier, array_agg(s.species order by s.species) as ids
    from t join public.species_stats s on s.tier = t.tier
    group by t.tier
  )
  select pool.ids[(public.fnv1a(arena_computer_pick.seed || ':ia-espece')
                   % array_length(pool.ids, 1)) :: int + 1],
         pool.tier,
         (public.fnv1a(arena_computer_pick.seed || ':ia-niveau')
          % greatest(1, arena_computer_pick.level_cap)) :: int + 1
  from pool
$$;

-- Un exemplaire ne peut figurer que dans UN défi ouvert à la fois. La fonction le vérifie déjà
-- et rend alors un message clair ; cet index est le filet en dessous : deux appels simultanés
-- passeraient tous les deux la vérification, et le joueur miserait deux fois le même Pokémon
-- pour n'en perdre qu'un. Une contrainte structurelle ne se laisse pas contourner par une
-- fenêtre de concurrence.
create unique index arena_duels_one_open_per_exemplar
  on public.arena_duels (challenger_id, challenger_key) where status = 'open';

-- Engager un exemplaire : poster un défi ouvert, ou affronter l'ordinateur tout de suite.
--
-- `security definer` parce que c'est l'unique écrivain des tables d'arène : aucun joueur n'a
-- de droit d'écriture, donc tout ce qui s'écrit passe par ici et par les règles écrites ici.
-- `set search_path = public` pour qu'un schéma placé devant par un appelant ne puisse pas
-- substituer sa propre `catches`.
--
-- L'appelant vient de `auth.uid()` et JAMAIS d'un paramètre : un identifiant passé en argument
-- est ce que le client prétend être, et laisserait n'importe qui engager les Pokémon d'autrui.
create or replace function public.arena_engage(
  p_entry_key text, p_vs_computer boolean default false)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_species int;
  v_tier text;
  v_level int;
  v_destroyed timestamptz;
  v_duel_id bigint;
  v_foe_key text;
  v_stake text;
  v_foe record;
  v_out record;
  v_day text := to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD');
  v_seed text;
begin
  if v_uid is null then
    raise exception 'arene : appel non authentifié';
  end if;

  -- Sérialise les engagements d'un même joueur pour la durée de la transaction. Les crédits
  -- sont DÉDUITS des duels déjà enregistrés : deux appels simultanés liraient tous les deux le
  -- solde d'avant et dépenseraient un crédit qui n'existe qu'une fois — la classe de bug de la
  -- double dépense de bonbons déjà rencontrée dans ce projet. Le verrou ne gêne personne : il
  -- ne bloque qu'un joueur contre lui-même.
  perform pg_advisory_xact_lock(hashtextextended(v_uid :: text, 0));

  -- La propriété se lit dans `catches`, seule source de vérité sur ce qu'un joueur possède.
  -- `user_id` fait partie de la condition : sans lui, on vérifierait que la clé existe et non
  -- qu'elle est à l'appelant.
  select c.species into v_species
  from public.catches c
  where c.user_id = v_uid and c.source || ':' || c.external_id = p_entry_key;

  if v_species is null then
    raise exception 'arene : exemplaire non possédé (%)', p_entry_key;
  end if;

  -- Aucune ligne `arena_exemplars` pour un exemplaire jamais engagé : c'est le cas NORMAL, et
  -- il vaut niveau 1, non détruit. On ne crée pas la ligne ici — un engagement ne change rien
  -- à l'exemplaire tant que le duel n'est pas résolu.
  select e.level, e.destroyed_at into v_level, v_destroyed
  from public.arena_exemplars e
  where e.user_id = v_uid and e.entry_key = p_entry_key;
  v_level := coalesce(v_level, 1);

  if v_destroyed is not null then
    raise exception 'arene : exemplaire détruit (%)', p_entry_key;
  end if;

  -- Les deux camps sont couverts : un exemplaire immobilisé l'est qu'on ait posté le défi ou
  -- qu'on l'ait relevé. Seuls les duels OUVERTS immobilisent — un duel résolu a rendu son
  -- exemplaire (ou l'a détruit, et c'est `destroyed_at` qui le dit).
  if exists (
    select 1 from public.arena_duels d
    where d.status = 'open'
      and ((d.challenger_id = v_uid and d.challenger_key = p_entry_key)
        or (d.opponent_id = v_uid and d.opponent_key = p_entry_key))
  ) then
    raise exception 'arene : exemplaire déjà engagé (%)', p_entry_key;
  end if;

  -- Vérifié APRÈS la propriété : « tu n'as plus de crédit » sur un exemplaire qu'on ne possède
  -- pas serait un diagnostic faux, et enverrait le joueur attendre demain pour rien.
  if public.arena_credits(v_uid) <= 0 then
    raise exception 'arene : aucun crédit d''engagement disponible cette semaine';
  end if;

  select s.tier into v_tier from public.species_stats s where s.species = v_species;
  if v_tier is null then
    raise exception 'arene : espèce inconnue (%)', v_species;
  end if;

  if not p_vs_computer then
    -- Un défi ouvert porte sa mise en base sans la rendre lisible : la policy exclut les duels
    -- ouverts et la vue `arena_open_challenges` n'expose pas la colonne. On relève à l'aveugle.
    insert into public.arena_duels (challenger_id, challenger_key, status, stake_tier)
    values (v_uid, p_entry_key, 'open', v_tier)
    returning id into v_duel_id;
    return v_duel_id;
  end if;

  -- Contre l'ordinateur, RIEN n'est détruit ni créé : il ne possède rien. S'il détruisait un
  -- exemplaire, un Pokémon disparaîtrait du monde sans contrepartie ; s'il donnait un pli, il
  -- en apparaîtrait un depuis rien. Il paye des pokédollars, et c'est tout.
  --
  -- La ligne est insérée d'abord parce que son identifiant EST la graine du duel : dérivée
  -- d'une clé d'identité, elle est stable une fois écrite, donc le client peut rejouer le
  -- combat et retomber sur le même vainqueur — ce que le résumé de combat exige.
  insert into public.arena_duels (challenger_id, challenger_key, status)
  values (v_uid, p_entry_key, 'computer')
  returning id into v_duel_id;

  v_seed := 'duel:' || v_duel_id;
  v_foe_key := 'ordinateur:' || v_duel_id;

  select * into v_foe from public.arena_computer_pick(v_seed, public.arena_field_level_cap());

  select * into v_out from public.arena_resolve(
    p_entry_key, v_species, v_level,
    v_foe_key, v_foe.foe_species, v_foe.foe_level,
    v_day, v_seed);

  -- L'enjeu, et non la mise du joueur : engager un légendaire contre un terrain de peu communs
  -- ne rapporte que le peu commun, exactement comme contre un humain.
  v_stake := public.arena_covered_tier(v_tier, v_foe.foe_tier);

  update public.arena_duels set
    opponent_key = v_foe_key,
    stake_tier = v_stake,
    -- `winner_id` nul sur un duel `computer` signifie que l'ordinateur a gagné : il n'a pas de
    -- compte, on ne peut donc pas l'y écrire. Le statut lève l'ambiguïté avec un duel en cours.
    winner_id = case when v_out.winner = 'left' then v_uid end,
    challenger_power = v_out.left_power,
    opponent_power = v_out.right_power,
    probability = v_out.probability,
    roll = v_out.roll,
    resolved_at = now()
  where id = v_duel_id;

  if v_out.winner = 'left' then
    -- Des pokédollars, au cinquième du tarif humain, et rien d'autre. Ni point de classement,
    -- ni pli, ni NIVEAU : sans cette dernière exclusion on monterait un champion sans jamais
    -- rien risquer, et le niveau cesserait de mesurer ce qu'on a osé. C'est pourquoi
    -- `v_out.level_after` est délibérément ignoré ici.
    insert into public.arena_wallet (user_id, pokedollars)
    values (v_uid, public.arena_reward_dollars(v_stake) / 5)
    on conflict (user_id) do update
      set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;
  end if;

  return v_duel_id;
end;
$$;

-- `public` inclut les visiteurs anonymes, et Postgres accorde `execute` à `public` par défaut
-- sur toute fonction créée : sans ce `revoke`, la fonction serait appelable sans compte.
revoke execute on function public.arena_engage(text, boolean) from public;
grant execute on function public.arena_engage(text, boolean) to authenticated;

-- Points de classement, table du § 4. Ils suivent exactement le dixième des pokédollars, mais
-- la relation est écrite en toutes lettres plutôt que dérivée : c'est une coïncidence de
-- barème, pas une règle du jeu, et le jour où l'un des deux bouge on ne veut pas que l'autre
-- suive en silence.
create or replace function public.arena_reward_points(tier text)
returns int language sql immutable strict as $$
  select case tier when 'c' then 5 when 'u' then 10 when 'r' then 25 when 'l' then 60 end
$$;

-- La saison à laquelle se rattachent les points d'un duel. Deux mois, sur des bornes de
-- calendrier FIXES — du 1ᵉʳ d'un mois impair au dernier jour du suivant (§ 4) — pour que
-- personne n'ait de saison personnelle et que le classement compare bien la même période pour
-- tout le monde. `(mois + 1) / 2` en division entière donne 1 pour janvier-février, 2 pour
-- mars-avril, et ainsi de suite.
--
-- En heure de Paris, pour la même raison que `arena_week_start` : une frontière de saison est
-- un instant, et un duel joué le 31 août à 23 h à Paris appartient à la saison qui s'achève,
-- pas à celle qui commence deux heures plus tard en UTC.
create or replace function public.arena_season(at timestamptz)
returns text language sql immutable strict as $$
  select to_char(timezone('Europe/Paris', arena_season.at), 'YYYY') || '-S'
         || (((extract(month from timezone('Europe/Paris', arena_season.at)) :: int) + 1)
             / 2) :: text
$$;

-- Relever un défi : la fonction qui justifie tout le lot.
--
-- L'ORDRE DES OPÉRATIONS N'EST PAS NÉGOCIABLE, et le verrou vient en premier. Toute
-- vérification faite avant lui porterait sur un état déjà périmé : deux acceptations
-- concurrentes du même défi liraient toutes deux « ouvert », résoudraient toutes deux, et
-- DÉTRUIRAIENT DEUX EXEMPLAIRES pour un seul duel — un Pokémon disparu du monde sans
-- contrepartie. C'est exactement la classe de bug qui a produit dans ce projet une double
-- dépense de bonbons (cf. NOTES.md), dont la conclusion était qu'il fallait une opération
-- atomique. La voici. `scripts/arena-concurrency.test.js` la met à l'épreuve avec deux
-- connexions distinctes, et vérifie qu'en retirant ce `for update` le test rougit.
--
-- `security definer` parce que c'est, avec `arena_engage`, l'unique écrivain des tables
-- d'arène : aucun joueur n'a de droit d'écriture, donc tout ce qui s'écrit passe par ici et
-- par les règles écrites ici. `set search_path = public` pour qu'un schéma placé devant par un
-- appelant ne puisse pas substituer sa propre `catches`.
--
-- L'appelant vient de `auth.uid()` et JAMAIS d'un paramètre : un identifiant passé en argument
-- est ce que le client prétend être, et laisserait n'importe qui relever un défi avec les
-- Pokémon d'autrui — ou s'attribuer la victoire d'un duel joué par un autre.
create or replace function public.arena_accept(p_duel_id bigint, p_entry_key text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_duel record;
  v_species int;
  v_tier text;
  v_level int;
  v_destroyed timestamptz;
  v_foe_species int;
  v_foe_tier text;
  v_foe_level int;
  v_stake text;
  v_out record;
  v_winner uuid;
  v_winner_key text;
  v_loser uuid;
  v_loser_key text;
  v_day text := to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD');
begin
  if v_uid is null then
    raise exception 'arene : appel non authentifié';
  end if;

  -- 1. LE VERROU, avant toute vérification. `for update` bloque la seconde transaction jusqu'à
  -- la fin de la première ; elle relit alors la ligne dans son état COMMITTÉ le plus récent,
  -- y voit `status = 'resolved'` et échoue proprement à l'étape suivante. Sans lui, les deux
  -- liraient « ouvert » en même temps.
  select * into v_duel from public.arena_duels d where d.id = p_duel_id for update;

  if v_duel.id is null then
    raise exception 'arene : défi introuvable (%)', p_duel_id;
  end if;

  -- 2. Le défi est-il encore à prendre ? C'est la vérification que le verrou rend fiable :
  -- posée après lui, elle porte sur l'état réel et non sur une lecture d'il y a un instant.
  if v_duel.status <> 'open' then
    raise exception 'arene : ce défi n''est plus ouvert';
  end if;

  -- 3. On ne joue pas contre soi-même : ni la destruction, ni le pli, ni les points n'auraient
  -- de sens, et le plafond hebdomadaire par paire deviendrait contournable.
  if v_duel.challenger_id = v_uid then
    raise exception 'arene : on ne relève pas son propre défi';
  end if;

  -- Sérialise les acceptations d'un même preneur, pour la même raison que dans `arena_engage`
  -- et sans conflit avec le verrou ci-dessus : les crédits et le plafond par paire sont DÉDUITS
  -- des duels enregistrés, donc deux acceptations simultanées de DEUX défis différents par le
  -- même joueur liraient toutes deux le solde d'avant. Pris après le verrou de ligne, jamais
  -- avant : l'ordre est le même pour tout le monde, donc aucun interblocage.
  perform pg_advisory_xact_lock(hashtextextended(v_uid :: text, 0));

  -- 4. La propriété se lit dans `catches`, seule source de vérité sur ce qu'un joueur possède.
  -- `user_id` fait partie de la condition : sans lui, on vérifierait que la clé existe et non
  -- qu'elle est à l'appelant.
  select c.species into v_species
  from public.catches c
  where c.user_id = v_uid and c.source || ':' || c.external_id = p_entry_key;

  if v_species is null then
    raise exception 'arene : exemplaire non possédé (%)', p_entry_key;
  end if;

  select e.level, e.destroyed_at into v_level, v_destroyed
  from public.arena_exemplars e
  where e.user_id = v_uid and e.entry_key = p_entry_key;
  v_level := coalesce(v_level, 1);

  if v_destroyed is not null then
    raise exception 'arene : exemplaire détruit (%)', p_entry_key;
  end if;

  -- Un exemplaire déjà posé sur un autre défi ouvert serait misé deux fois pour n'en perdre
  -- qu'un. Le duel qu'on relève ne compte pas : il appartient au challenger, pas à nous.
  if exists (
    select 1 from public.arena_duels d
    where d.status = 'open'
      and ((d.challenger_id = v_uid and d.challenger_key = p_entry_key)
        or (d.opponent_id = v_uid and d.opponent_key = p_entry_key))
  ) then
    raise exception 'arene : exemplaire déjà engagé (%)', p_entry_key;
  end if;

  -- 5. Vérifié APRÈS la propriété : « tu n'as plus de crédit » sur un exemplaire qu'on ne
  -- possède pas serait un diagnostic faux, et enverrait le joueur attendre demain pour rien.
  if public.arena_credits(v_uid) <= 0 then
    raise exception 'arene : aucun crédit d''engagement disponible cette semaine';
  end if;

  -- 6. Deux duels par semaine et par paire (§ 2). Le compte porte sur les duels DÉJÀ joués
  -- entre ces deux joueurs cette semaine — celui qu'on est en train de relever n'a pas encore
  -- d'opponent_id, il ne peut donc pas se compter lui-même. Même convention de semaine que les
  -- crédits, `arena_week_start`, pour que les deux limites ne se décalent jamais l'une de
  -- l'autre.
  if (
    select count(*) from public.arena_duels d
    where ((d.challenger_id = v_uid and d.opponent_id = v_duel.challenger_id)
        or (d.challenger_id = v_duel.challenger_id and d.opponent_id = v_uid))
      and d.created_at >= (public.arena_week_start(now()) :: timestamp
                           at time zone 'Europe/Paris')
  ) >= 2 then
    raise exception 'arene : deux duels par semaine maximum contre le même joueur';
  end if;

  -- Le palier des deux camps. Celui du challenger se relit de son espèce, elle-même relue de
  -- sa capture : la mise n'est jamais recopiée dans le duel autrement que comme `stake_tier`,
  -- qui portera l'ENJEU et non l'engagement.
  select c.species into v_foe_species
  from public.catches c
  where c.user_id = v_duel.challenger_id
    and c.source || ':' || c.external_id = v_duel.challenger_key;

  if v_foe_species is null then
    raise exception 'arene : le défi porte un exemplaire introuvable (%)', v_duel.challenger_key;
  end if;

  select coalesce(e.level, 1) into v_foe_level
  from public.arena_exemplars e
  where e.user_id = v_duel.challenger_id and e.entry_key = v_duel.challenger_key;
  v_foe_level := coalesce(v_foe_level, 1);

  select s.tier into v_tier from public.species_stats s where s.species = v_species;
  select s.tier into v_foe_tier from public.species_stats s where s.species = v_foe_species;
  if v_tier is null or v_foe_tier is null then
    raise exception 'arene : espèce inconnue (% ou %)', v_species, v_foe_species;
  end if;

  -- 7. La résolution, et rien d'autre : le moteur est `arena_resolve`, on ne recalcule rien
  -- ici. Le challenger est le camp `left` — mais `arena_resolve` confronte le tirage au camp
  -- canoniquement premier, donc l'issue ne dépend pas de cet ordre. La graine est
  -- l'identifiant du duel, dérivé d'une clé d'identité : stable une fois écrite, elle laisse
  -- le client rejouer le combat et retomber sur le même vainqueur.
  select * into v_out from public.arena_resolve(
    v_duel.challenger_key, v_foe_species, v_foe_level,
    p_entry_key, v_species, v_level,
    v_day, 'duel:' || v_duel.id);

  -- L'enjeu : le plus PETIT des deux engagements. Battre un rare ne rapporte 250 que si les
  -- DEUX ont engagé un rare.
  v_stake := public.arena_covered_tier(v_tier, v_foe_tier);

  if v_out.winner = 'left' then
    v_winner := v_duel.challenger_id;
    v_winner_key := v_duel.challenger_key;
    v_loser := v_uid;
    v_loser_key := p_entry_key;
  else
    v_winner := v_uid;
    v_winner_key := p_entry_key;
    v_loser := v_duel.challenger_id;
    v_loser_key := v_duel.challenger_key;
  end if;

  -- 8. Les écritures. Toutes dans la même transaction que le verrou : ou bien elles arrivent
  -- ensemble, ou bien aucune n'arrive.

  -- L'exemplaire du perdant est détruit. Espèce et bonbons sont conservés — c'est l'exemplaire
  -- qui meurt, avec le niveau qu'on avait mis à le monter, et c'est là tout l'enjeu du mode.
  insert into public.arena_exemplars (user_id, entry_key, destroyed_at)
  values (v_loser, v_loser_key, now())
  on conflict (user_id, entry_key) do update set destroyed_at = excluded.destroyed_at;

  -- Le niveau du vainqueur vient de `arena_resolve`, plafond de 10 compris : un seul calcul du
  -- rapport de puissance sert au combat et au barème, aucune seconde formule.
  insert into public.arena_exemplars (user_id, entry_key, level, wins)
  values (v_winner, v_winner_key, v_out.level_after, 1)
  on conflict (user_id, entry_key) do update
    set level = excluded.level, wins = arena_exemplars.wins + 1;

  -- Pokédollars, points et pli : au vainqueur SEULEMENT, et tous trois au palier de l'enjeu.
  -- Le perdant ne reçoit rien — un lot de consolation rendrait la défaite indolore alors
  -- qu'elle vient de coûter un Pokémon.
  insert into public.arena_wallet (user_id, pokedollars)
  values (v_winner, public.arena_reward_dollars(v_stake))
  on conflict (user_id) do update
    set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;

  insert into public.arena_season_points (user_id, season, points)
  values (v_winner, public.arena_season(now()), public.arena_reward_points(v_stake))
  on conflict (user_id, season) do update
    set points = arena_season_points.points + excluded.points;

  -- Un pli DÛ, pas encore une capture : le lot 2d le matérialisera en ligne `catches` de
  -- source `arene`. La dette et son règlement sont deux moments distincts, et une panne entre
  -- les deux ne doit pas faire disparaître le dû.
  insert into public.arena_packs (user_id, tier, duel_id) values (v_winner, v_stake, v_duel.id);

  -- Les deux puissances, la probabilité et le tirage sont CONSERVÉS. Ce n'est pas de la
  -- traçabilité de confort : une issue probabiliste sans explication passe pour arbitraire,
  -- surtout quand elle vient de détruire un Pokémon. Le résumé de combat les rejoue, et
  -- n'importe qui peut refaire le calcul.
  update public.arena_duels set
    opponent_id = v_uid,
    opponent_key = p_entry_key,
    status = 'resolved',
    winner_id = v_winner,
    stake_tier = v_stake,
    challenger_power = v_out.left_power,
    opponent_power = v_out.right_power,
    probability = v_out.probability,
    roll = v_out.roll,
    resolved_at = now()
  where id = v_duel.id;

  return v_duel.id;
end;
$$;

-- `public` inclut les visiteurs anonymes, et Postgres accorde `execute` à `public` par défaut
-- sur toute fonction créée : sans ce `revoke`, la fonction serait appelable sans compte.
revoke execute on function public.arena_accept(bigint, text) from public;
grant execute on function public.arena_accept(bigint, text) to authenticated;

-- Un défi que personne ne relève sous 24 h se résout contre l'ordinateur.
--
-- Ce n'est pas une règle de jeu, c'est un garde-fou : tant que le défi reste ouvert,
-- l'exemplaire engagé est immobilisé — il ne peut ni évoluer ni servir ailleurs. Sans
-- péremption, un défi que personne ne relève gèlerait un Pokémon indéfiniment, et son
-- propriétaire aurait dépensé un crédit pour rien.
--
-- Aucun crédit n'est reconsommé : il l'a été à l'engagement. Et comme partout ailleurs,
-- l'ordinateur ne détruit ni ne crée : le challengeur récupère son exemplaire intact et, s'il
-- l'emporte, des pokédollars au cinquième du tarif humain — ni point, ni pli, ni niveau.
create or replace function public.arena_resolve_expired(older_than interval default interval '24 hours')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_foe record;
  v_out record;
  v_seed text;
  v_foe_key text;
  v_stake text;
  v_species int;
  v_level int;
  v_tier text;
  v_day text;
  v_n int := 0;
begin
  -- `for update skip locked` : deux passages concurrents du travail planifié ne doivent pas
  -- résoudre deux fois le même défi. Celui qui arrive second saute simplement les lignes que
  -- l'autre tient déjà, plutôt que d'attendre puis de rejouer sur un état périmé.
  for v_duel in
    select * from public.arena_duels
    where status = 'open' and created_at < now() - older_than
    for update skip locked
  loop
    select c.species, coalesce(e.level, 1), s.tier
      into v_species, v_level, v_tier
    from public.catches c
    join public.species_stats s on s.species = c.species
    left join public.arena_exemplars e
      on e.user_id = v_duel.challenger_id and e.entry_key = v_duel.challenger_key
    where c.user_id = v_duel.challenger_id
      and c.source || ':' || c.external_id = v_duel.challenger_key;

    -- Un exemplaire introuvable ne doit pas bloquer le travail planifié pour tous les autres :
    -- le défi est refermé sans gain, et l'exemplaire libéré.
    if v_species is null then
      update public.arena_duels
        set status = 'computer', resolved_at = now()
        where id = v_duel.id;
      v_n := v_n + 1;
      continue;
    end if;

    v_day := to_char((now() at time zone 'Europe/Paris') :: date, 'YYYY-MM-DD');
    v_seed := 'duel:' || v_duel.id;
    v_foe_key := 'ordinateur:' || v_duel.id;

    select * into v_foe from public.arena_computer_pick(v_seed, public.arena_field_level_cap());

    select * into v_out from public.arena_resolve(
      v_duel.challenger_key, v_species, v_level,
      v_foe_key, v_foe.foe_species, v_foe.foe_level,
      v_day, v_seed);

    v_stake := public.arena_covered_tier(v_tier, v_foe.foe_tier);

    update public.arena_duels set
      status = 'computer',
      opponent_key = v_foe_key,
      stake_tier = v_stake,
      winner_id = case when v_out.winner = 'left' then v_duel.challenger_id end,
      challenger_power = v_out.left_power,
      opponent_power = v_out.right_power,
      probability = v_out.probability,
      roll = v_out.roll,
      resolved_at = now()
    where id = v_duel.id;

    if v_out.winner = 'left' then
      insert into public.arena_wallet (user_id, pokedollars)
      values (v_duel.challenger_id, public.arena_reward_dollars(v_stake) / 5)
      on conflict (user_id) do update
        set pokedollars = arena_wallet.pokedollars + excluded.pokedollars;
    end if;

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- Appelée par le travail planifié avec la clé `service_role`, jamais par un joueur : rien dans
-- le jeu ne justifie qu'on déclenche soi-même la péremption des défis des autres.
revoke execute on function public.arena_resolve_expired(interval) from public;
grant execute on function public.arena_resolve_expired(interval) to service_role;


commit;
