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
-- UTF-16. Les deux coïncident sous U+10000, ce qui couvre tout ce que le jeu hache — des
-- identifiants de source, des sha, des dates. Un emoji dans une clé d'exemplaire les ferait
-- diverger.
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

commit;
