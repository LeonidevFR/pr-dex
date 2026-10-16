-- Déclenchements planifiés de pr-dex-data, depuis Supabase.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois. Indépendante du front.
--
-- Pourquoi : GitHub Actions retarde ou saute les passages planifiés d'un petit repo. Constaté
-- les 15 et 16 octobre 2026 : `catch.yml`, réglé toutes les heures, a démarré avec deux à trois
-- heures de retard et a sauté la plupart de ses créneaux ; `monkey-testing.yml` n'a pas tourné
-- le 16 au matin. pg_cron, lui, tourne à l'heure : il demande à GitHub de lancer les workflows
-- (workflow_dispatch), comme le bouton de sync de l'app.
--
-- Les crons de GitHub restent en place, en secours. Un passage en double ne refait rien : les
-- captures et les attributions sont dédupliquées.
--
-- Prérequis, dans le dashboard :
--   1. Integrations → Cron : activer (extension pg_cron).
--   2. Database → Extensions : activer pg_net.
--   3. Vault (Integrations → Vault) : un secret nommé `github_dispatch_token`. PAT fine-grained
--      GitHub, repo `pr-dex-data` seul, permission « Actions: Read and write », rien d'autre.
--      Le même droit que `CATCH_DISPATCH_TOKEN` de la fonction Edge `trigger-catch`.
--
-- Vérifier après coup :
--   select jobname, schedule, active from cron.job;
--   select created, status_code from net._http_response order by created desc limit 5;  -- 204 attendu
--
-- Retour arrière :
--   select cron.unschedule('pr-dex-monkey-testing');
--   select cron.unschedule('pr-dex-catch');
--   drop function public.dispatch_pr_dex_data(text);

begin;

-- `security definer` pour lire le Vault ; personne d'autre que pg_cron n'a à l'appeler. `anon`
-- et `authenticated` sont nommés : les privilèges par défaut de Supabase leur accordent
-- EXECUTE sur toute nouvelle fonction, et un `revoke ... from public` ne le retire pas.
create function public.dispatch_pr_dex_data(workflow text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := 'https://api.github.com/repos/LeonidevFR/pr-dex-data/actions/workflows/' || workflow || '/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_dispatch_token'),
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'pr-dex-cron',
      'Content-Type', 'application/json'
    )
  );
$$;

revoke execute on function public.dispatch_pr_dex_data(text) from public, anon, authenticated;

-- L'agent du monkey-testing : chaque jour ouvré à 8 h UTC, comme son cron GitHub.
select cron.schedule('pr-dex-monkey-testing', '0 8 * * 1-5', $$select public.dispatch_pr_dex_data('monkey-testing.yml')$$);

-- La capture : toutes les heures de 6 h à 17 h UTC, cinq minutes après l'heure.
select cron.schedule('pr-dex-catch', '5 6-17 * * *', $$select public.dispatch_pr_dex_data('catch.yml')$$);

commit;
