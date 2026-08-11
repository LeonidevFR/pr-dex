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

commit;
