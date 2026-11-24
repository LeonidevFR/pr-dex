-- Pile locale seulement : `supabase db reset` le joue après seed.sql (config.toml, [db.seed]).
-- NE PAS jouer en production : il ouvrirait l'arène avant son lancement.
--
-- `arena_assert_open` ferme l'arène avant le 1er décembre 2026. Les tests tournent avant cette
-- date, par PostgREST comme par des connexions directes : on recule la date d'ouverture de la
-- base locale. Le test du verrou remet la sienne, dans une transaction annulée.
update public.arena_opening set opens_at = timestamptz '2000-01-01 00:00:00+00';
