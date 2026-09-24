#!/usr/bin/env node
/**
 * Répétition générale du déploiement, sur une copie locale de la production.
 *
 * On ne colle pas trois fichiers SQL sur trois semaines de collections sans les avoir joués
 * ailleurs d'abord. Ce script rejoue exactement la mise en service : il remet la base locale
 * dans l'état du serveur AUJOURD'HUI — c'est-à-dire avec la seule migration de juillet —, y
 * verse les données exportées, applique les quatre fichiers dans l'ordre, puis vérifie.
 *
 * Ce qu'il vérifie, et qui est le seul vrai risque : la reprise des évolutions. Elles vivent
 * dans une colonne jsonb que le client réécrivait ; elles deviennent des lignes. Une entrée
 * perdue, c'est un exemplaire rendu à la vie et des bonbons recrédités.
 *
 * Usage :  node scripts/dry-run.mjs chemin/vers/prod.sql
 */
import { execFileSync } from 'node:child_process'
import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pg from 'pg'

/** En dur, comme le harnais de tests : aucun argument ne doit pouvoir viser la production. */
const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const MIGRATIONS = 'supabase/migrations'
const ARENE = `${MIGRATIONS}/20260811000000_arena.sql`
const EVOLUTIONS = `${MIGRATIONS}/20260814000000_evolutions.sql`
const REVENTE = `${MIGRATIONS}/20260924000000_revente.sql`
const SEED = 'supabase/seed.sql'

const dump = process.argv[2]
if (!dump || !existsSync(dump)) {
  console.error('Usage : node scripts/dry-run.mjs chemin/vers/prod.sql')
  process.exit(1)
}

const psql = (fichier, extra = []) =>
  execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', LOCAL, '-f', fichier, ...extra],
    { stdio: ['ignore', 'inherit', 'inherit'] })

const dire = (m) => console.log(m)

async function avec(fn) {
  const c = new pg.Client({ connectionString: LOCAL })
  await c.connect()
  try { return await fn(c) } finally { await c.end() }
}

/**
 * Remet la base locale dans l'état de la production : la migration de juillet, et rien d'autre.
 * Les trois nouvelles migrations et le seed sont écartés le temps de la remise à zéro, sinon
 * `supabase db reset` les appliquerait et l'on testerait un déploiement déjà fait.
 */
function etatDeLaProduction() {
  const ecartes = [
    [ARENE, `${ARENE}.hors`], [EVOLUTIONS, `${EVOLUTIONS}.hors`],
    [REVENTE, `${REVENTE}.hors`], [SEED, `${SEED}.hors`],
  ]
  for (const [de, vers] of ecartes) renameSync(de, vers)
  try {
    execFileSync('supabase', ['db', 'reset', '--local'], { stdio: ['ignore', 'ignore', 'inherit'] })
  } finally {
    for (const [de, vers] of ecartes) renameSync(vers, de)
  }
}

/**
 * Exécute un fichier SQL avec les contraintes de clé étrangère désarmées.
 *
 * L'export ne porte que le schéma `public` : ses lignes désignent des comptes `auth.users`
 * qu'on ne veut surtout PAS exporter — un dump d'authentification contient des empreintes de
 * mots de passe, qui n'ont rien à faire sur un poste de travail. Les comptes n'existent donc
 * pas ici, et toute clé étrangère qui les vise échouerait : celle des captures au chargement,
 * celle des évolutions à la reprise.
 *
 * Ce que la répétition vérifie n'en dépend pas — elle vérifie que les fichiers passent et que
 * la reprise est exacte, pas que Postgres sait tenir une clé étrangère. L'intégrité réelle sera
 * celle de la production, où les comptes existent.
 *
 * Le désarmement vaut pour UNE session : il voyage donc avec le fichier, dans une enveloppe.
 */
function sansContraintes(fichier) {
  const enveloppe = join(tmpdir(), 'dry-run-sans-contraintes.sql')
  writeFileSync(enveloppe, [
    'set session_replication_role = replica;',
    `\\i ${resolve(fichier)}`,
  ].join('\n'))
  psql(enveloppe)
}

const compte = (c, sql) => c.query(sql).then((r) => Number(Object.values(r.rows[0])[0]))

await avec(async (c) => {
  const { rows } = await c.query('select count(*) :: int as n from public.catches')
  dire(`Base locale accessible. ${rows[0].n} capture(s) avant remise à zéro.`)
})

dire('\n1. Base locale remise dans l’état de la production…')
etatDeLaProduction()

dire('2. Chargement de l’export…')
sansContraintes(dump)

const avant = await avec(async (c) => ({
  joueurs: await compte(c, 'select count(*) from public.profiles'),
  captures: await compte(c, 'select count(*) from public.catches'),
  etats: await compte(c, 'select count(*) from public.state'),
  evolutions: await compte(c,
    'select coalesce(sum(jsonb_array_length(evolutions)), 0) from public.state'),
}))
dire(`   ${avant.joueurs} joueur(s), ${avant.captures} capture(s), `
  + `${avant.evolutions} évolution(s) dans les états.`)

dire('\n3. Application des quatre fichiers, dans l’ordre du déploiement…')
for (const [nom, fichier] of [
  ['arène', ARENE], ['évolutions', EVOLUTIONS], ['revente', REVENTE], ['seed', SEED],
]) {
  sansContraintes(fichier)
  dire(`   ${nom} : appliqué.`)
}

dire('\n4. Vérifications.')
const ko = []
await avec(async (c) => {
  const reprises = await compte(c, 'select count(*) from public.evolutions')
  dire(`   Évolutions reprises : ${reprises} / ${avant.evolutions} attendues`)
  if (reprises !== avant.evolutions) {
    ko.push(`${avant.evolutions - reprises} évolution(s) perdue(s) à la reprise`)
  }

  // Les bonbons dépensés se recalculent depuis les évolutions : ils doivent retomber sur les
  // `spent` que le client avait matérialisés, joueur par joueur et famille par famille.
  const { rows: ecarts } = await c.query(`
    with attendu as (
      select s.user_id, (kv.key) :: int as famille, (kv.value) :: text :: int as depense
      from public.state s, lateral jsonb_each(s.spent) kv
    ),
    calcule as (
      select v.user_id, e.family as famille, sum(e.cost) :: int as depense
      from public.evolutions v join public.species_evo e on e.species = v.from_species
      group by 1, 2
    )
    select coalesce(a.user_id, c2.user_id) as user_id,
           coalesce(a.famille, c2.famille) as famille,
           coalesce(a.depense, 0) as ancien, coalesce(c2.depense, 0) as nouveau
    from attendu a full join calcule c2
      on a.user_id = c2.user_id and a.famille = c2.famille
    where coalesce(a.depense, 0) <> coalesce(c2.depense, 0)
  `)
  dire(`   Bonbons dépensés, écarts : ${ecarts.length}`)
  for (const e of ecarts.slice(0, 5)) {
    dire(`     famille ${e.famille} : ${e.ancien} avant, ${e.nouveau} après`)
  }
  if (ecarts.length) ko.push(`${ecarts.length} écart(s) de bonbons dépensés`)

  /**
   * Les clés en chaîne doivent désigner quelque chose. L'ancien format nommait le Pokémon
   * obtenu par son RANG (`evo:0`), le nouveau par son identifiant : une clé mal reprise ne
   * pointerait sur rien, et l'exemplaire consommé passerait pour disponible — évoluable une
   * seconde fois, engageable à l'arène.
   */
  const { rows: pendantes } = await c.query(`
    select v.id, v.from_key from public.evolutions v
    where v.from_key like 'evo:%'
      and not exists (
        select 1 from public.evolutions cible
        where cible.user_id = v.user_id and 'evo:' || cible.id = v.from_key
      )
  `)
  dire(`   Clés en chaîne pendantes : ${pendantes.length}`)
  if (pendantes.length) {
    ko.push(`${pendantes.length} évolution(s) désignent une source qui n'existe pas`)
  }

  // Les données de référence, sans lesquelles le combat n'a pas de stats et la boutique est vide.
  for (const [quoi, sql, attendu] of [
    ['species_stats', 'select count(*) from public.species_stats', 251],
    ['species_evo', 'select count(*) from public.species_evo', 251],
    ['arena_shop', 'select count(*) from public.arena_shop', 14],
  ]) {
    const n = await compte(c, sql)
    dire(`   ${quoi} : ${n} / ${attendu}`)
    if (n !== attendu) ko.push(`${quoi} : ${n} au lieu de ${attendu}`)
  }

  // Rien ne doit avoir bougé du côté des données existantes : la migration est additive.
  for (const [quoi, sql, attendu] of [
    ['captures', 'select count(*) from public.catches', avant.captures],
    ['joueurs', 'select count(*) from public.profiles', avant.joueurs],
    ['états', 'select count(*) from public.state', avant.etats],
  ]) {
    const n = await compte(c, sql)
    if (n !== attendu) ko.push(`${quoi} : ${n} au lieu de ${attendu} — la migration a touché à l’existant`)
  }
})

dire('')
if (ko.length) {
  dire('RÉPÉTITION ÉCHOUÉE — ne pas déployer :')
  for (const l of ko) dire(`  · ${l}`)
  process.exit(1)
}
dire('Répétition réussie. Les trois fichiers passent sur une copie de la production,')
dire('la reprise des évolutions est exacte et rien de l’existant n’a bougé.')
