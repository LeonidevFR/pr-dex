-- Export de la production, à lancer dans l'éditeur SQL du dashboard.
--
-- Pour la répétition générale du déploiement (`scripts/dry-run.mjs`), quand on n'a pas la
-- chaîne de connexion sous la main — elle vit derrière le bouton `Connect` du dashboard, et
-- réclame le mot de passe de la base, qui n'est pas celui du compte.
--
-- Marche à suivre : coller cette requête dans l'éditeur SQL, lancer, copier l'unique cellule
-- de résultat, l'enregistrer sous `prod.sql`, puis `node scripts/dry-run.mjs prod.sql`.
--
-- Il ne lit que les quatre tables qui portent le jeu, et n'écrit rien. Le résultat est une
-- seule ligne de texte : c'est le fichier `prod.sql` à enregistrer en local.
--
-- Rien du schéma `auth` n'en sort — un export d'authentification porte des empreintes de mots
-- de passe, qui n'ont aucune raison de quitter le serveur.
select string_agg(ligne, E'\n') as prod_sql from (
  select 'insert into public.profiles (user_id, created_at) values ('
       || quote_literal(user_id::text) || '::uuid, ' || quote_literal(created_at::text) || ');' as ligne
  from public.profiles

  union all
  select 'insert into public.identities (user_id, source, handle, config) values ('
       || quote_literal(user_id::text) || '::uuid, ' || quote_literal(source) || ', '
       || quote_literal(handle) || ', ' || quote_literal(config::text) || '::jsonb);'
  from public.identities

  union all
  select 'insert into public.catches (user_id, source, external_id, label, ref, url, date, species, shiny) values ('
       || quote_literal(user_id::text) || '::uuid, ' || quote_literal(source) || ', '
       || quote_literal(external_id) || ', ' || quote_literal(label) || ', '
       || coalesce(quote_literal(ref), 'null') || ', ' || coalesce(quote_literal(url), 'null') || ', '
       || quote_literal(date::text) || '::date, ' || species || ', ' || shiny || ');'
  from public.catches

  union all
  select 'insert into public.state (user_id, claimed, spent, evolutions, version) values ('
       || quote_literal(user_id::text) || '::uuid, ' || quote_literal(claimed::text) || '::jsonb, '
       || quote_literal(spent::text) || '::jsonb, ' || quote_literal(evolutions::text) || '::jsonb, '
       || version || ');'
  from public.state
) tout;
