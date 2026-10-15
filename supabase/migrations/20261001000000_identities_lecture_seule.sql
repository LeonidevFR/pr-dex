-- `identities` passe en lecture seule pour les joueurs.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur la base en
-- service. Une base neuve part de `supabase/schema.sql`. Indépendante du front : aucun
-- ordre de déploiement à respecter.
--
-- Ne retire qu'une policy. Aucune table modifiée, aucune donnée touchée. Retour arrière :
--   create policy "identities_update_own" on public.identities
--     for update using (auth.uid() = user_id);
--
-- La policy laissait chacun réécrire sa propre ligne, `handle` compris. `unique (source,
-- handle)` n'arrête que les handles déjà réclamés : il suffisait de prendre celui d'un
-- collègue pas encore inscrit pour recevoir ses captures, et l'empêcher de créer la sienne.
-- Un handle invalide faisait aussi échouer la recherche GitHub à chaque run. Même problème
-- avec `config.repos`, qui permettait de faire compter ses dépôts personnels.
--
-- Rien dans le front n'écrit dans cette table : la ligne `github` vient du trigger
-- d'inscription, les autres se déclarent à la main (SQL Editor, qui contourne RLS).

drop policy if exists "identities_update_own" on public.identities;
