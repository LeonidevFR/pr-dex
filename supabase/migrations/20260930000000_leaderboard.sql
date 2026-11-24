-- Classement et stats d'équipe : première lecture des données d'un autre joueur.
-- À coller dans SQL Editor (Supabase dashboard) et exécuter UNE fois, sur la base en
-- service, AVANT de merger le front. Une base neuve part de `supabase/schema.sql`.
--
-- Ne crée qu'une fonction et son droit d'exécution. Aucune table modifiée, aucune donnée
-- touchée, aucun rattrapage. Retour arrière : `drop function public.leaderboard_players()`.

begin;

-- `security definer` parce que RLS ne laisse voir à chacun que ses propres lignes : c'est la
-- fonction qui décide ce qui sort, et elle ne laisse sortir que ce que le classement a
-- besoin de connaître. Ni `label`, ni `ref`, ni `url` (le titre et le lien des PR restent
-- privés), ni `user_id` — `is_me` suffit au front pour reconnaître sa ligne.
--
-- Le login est lu dans `auth.users` plutôt que dans `identities` : le trigger d'inscription
-- fait `on conflict do nothing`, donc un joueur dont le handle était déjà réclamé n'a pas de
-- ligne `identities` ; et les métadonnées OAuth sont rafraîchies à chaque connexion.
--
-- Seules les captures OUVERTES sortent (clé `source:external_id` présente dans
-- `state.claimed`) : même règle que le dex, et pas de spoiler d'un légendaire avant que son
-- propriétaire l'ait retourné. Un joueur sans capture ouverte n'est pas renvoyé.
create function public.leaderboard_players()
returns table (
  login text,
  avatar_url text,
  is_me boolean,
  catches jsonb,
  evolutions jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(u.raw_user_meta_data ->> 'user_name', 'inconnu') as login,
    u.raw_user_meta_data ->> 'avatar_url' as avatar_url,
    u.id = auth.uid() as is_me,
    opened.catches,
    s.evolutions
  from auth.users u
  join public.state s on s.user_id = u.id
  join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'source', c.source,
        'external_id', c.external_id,
        'species', c.species,
        'shiny', c.shiny,
        'date', c.date
      )
      order by c.date, c.id
    ) as catches
    from public.catches c
    where c.user_id = u.id
      and s.claimed ? (c.source || ':' || c.external_id)
  ) opened on true
  where opened.catches is not null;
$$;

-- `anon` est nommé explicitement : les privilèges par défaut de Supabase accordent EXECUTE
-- sur toute nouvelle fonction à anon/authenticated/service_role, et un `revoke ... from
-- public` ne retire pas un droit accordé nommément. Sans cette ligne, la clé anon — publique
-- par construction — suffirait à appeler la fonction sans compte.
revoke execute on function public.leaderboard_players() from public, anon;
grant execute on function public.leaderboard_players() to authenticated;

commit;
