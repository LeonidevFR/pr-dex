-- Retire aux rôles publics les droits dont l'application ne se sert jamais.
--
-- À coller dans l'éditeur SQL du dashboard, comme les bascules précédentes.
--
-- POURQUOI. Supabase accorde historiquement `ALL` à `anon` et `authenticated` sur toutes les
-- tables du schéma public, et compte entièrement sur RLS pour restreindre. Ça fonctionne,
-- mais deux choses le rendent inconfortable ici :
--
--   1. `TRUNCATE` n'est PAS soumis à RLS — c'est une opération de table, pas de ligne, et
--      aucune policy ne l'arrête. Un rôle qui en dispose peut vider `catches` quelles que
--      soient les policies. Ce n'est pas atteignable par la clé publique aujourd'hui, puisque
--      PostgREST n'expose que les quatre verbes REST, mais le droit n'a aucune raison d'exister.
--
--   2. Ce qui empêche aujourd'hui quelqu'un d'écrire dans `catches` avec la clé publique,
--      c'est la seule ABSENCE d'une policy `insert`. Une policy permissive ajoutée par
--      inadvertance ouvrirait l'écriture immédiatement. Après ce revoke, il faudrait deux
--      fautes au lieu d'une.
--
-- CE QUI EST CONSERVÉ, et pourquoi :
--   - `select` sur les quatre tables : le front lit `profiles`, `catches` et `state`.
--   - `update` sur `state` : c'est la seule écriture du front (progression du joueur).
--   - `update` sur `identities` : prévu par la policy `identities_update_own`.
--   - tous les droits de `service_role`, que ce fichier ne touche pas : c'est lui qui écrit
--     `catches` depuis l'Action, et il contourne RLS de toute façon.
--
-- CE QUI A ÉTÉ VÉRIFIÉ avant d'écrire ce fichier, sur une base locale où les droits de
-- production avaient d'abord été reproduits à l'identique :
--   - les quatre opérations réelles du front passent toujours (3 `select`, 1 `update`) ;
--   - insertion dans `catches`, `truncate` par `authenticated`, `truncate` par `anon` et
--     suppression dans `state` sont toutes refusées ;
--   - la suite de tests du dépôt reste verte (445 tests).
--
-- RÉVERSIBLE d'un `grant` symétrique, si quelque chose d'imprévu s'en servait.

begin;

-- Aucune policy ne protège d'un TRUNCATE : c'est le seul droit de cette liste qui contourne
-- réellement RLS, et donc le seul dont le retrait change quelque chose en profondeur.
revoke truncate on public.profiles, public.identities, public.catches, public.state
  from anon, authenticated;

-- `catches` est l'historique des captures. Il n'est écrit que par l'Action via `service_role`,
-- jamais depuis un navigateur : le front n'y fait qu'un `select` de huit colonnes.
revoke insert, update, delete on public.catches from anon, authenticated;

-- Les lignes de `profiles` et `state` sont créées par le trigger `handle_new_user`, qui est
-- `security definer` et s'exécute donc sous son propriétaire — le retrait de `insert` ne le
-- gêne pas. Personne ne supprime jamais de ligne depuis l'application.
revoke insert, delete on public.profiles, public.identities, public.state
  from anon, authenticated;

commit;

-- POUR VÉRIFIER APRÈS COUP, dans le même éditeur :
--
--   select grantee || ' → ' || table_name || ' : ' || string_agg(privilege_type, ', ')
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--   group by grantee, table_name order by 1;
--
-- Attendu : `select` sur les quatre tables, plus `update` sur `identities` et `state`, plus
-- les droits inertes `references` et `trigger`. Aucun `insert`, `delete` ni `truncate`.
