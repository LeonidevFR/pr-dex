import { drawFrom } from '../shared/draw.js'
import { entryKey } from '../shared/entry.js'
import * as github from './connectors/github.mjs'

/**
 * Registre des sources : ajouter un pôle, c'est écrire un connecteur et l'inscrire ici.
 * Ni le schéma, ni le front, ni la logique de jeu n'ont à bouger — c'est le critère auquel
 * ce découpage se juge.
 */
export const CONNECTORS = Object.fromEntries([github].map((c) => [c.id, c]))

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
})

/**
 * Point de départ de la recherche pour UNE identité : sa capture la plus récente sur CETTE
 * source moins sept jours de marge, ou la date de bootstrap au tout premier run.
 *
 * Le curseur est par source, pas par personne : une source active tirerait sinon la fenêtre
 * d'une source plus lente en avant, dont les événements passeraient alors hors fenêtre sans
 * jamais être vus.
 *
 * Par défaut (pas de BOOTSTRAP_SINCE), le jour du run — jamais une date fixe dans le passé,
 * sinon un profil créé longtemps après la mise en service rattraperait tout son historique
 * d'un coup.
 */
export function sinceDate(catches, bootstrap) {
  if (!catches.length) return bootstrap
  const latest = catches.reduce((max, c) => (c.date > max ? c.date : max), catches[0].date)
  const d = new Date(latest + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Le tirage vit ici, et nulle part ailleurs : un connecteur rend des événements bruts, il
 * n'attribue aucune espèce. C'est ce qui garantit que toutes les sources jouent au même jeu.
 */
export function toRows(userId, source, events) {
  return events.map((e) => {
    const { species, shiny } = drawFrom(entryKey(source, e.externalId))
    return {
      user_id: userId,
      source,
      external_id: e.externalId,
      label: e.label,
      ref: e.ref ?? null,
      url: e.url ?? null,
      date: e.date,
      species,
      shiny,
    }
  })
}

/** Une ligne par (personne, source) — créée à la connexion pour GitHub, ajoutée à la main sinon. */
export async function fetchIdentities(supabaseUrl, serviceKey, fetchFn = fetch) {
  const res = await fetchFn(`${supabaseUrl}/rest/v1/identities?select=user_id,source,handle,config`, {
    headers: sbHeaders(serviceKey),
  })
  if (!res.ok) throw new Error(`identities a répondu ${res.status}`)
  return res.json()
}

/** Captures déjà connues d'une identité — base de la déduplication et de `sinceDate`. */
export async function fetchExistingCatches(supabaseUrl, serviceKey, userId, source, fetchFn = fetch) {
  const res = await fetchFn(
    `${supabaseUrl}/rest/v1/catches?user_id=eq.${userId}&source=eq.${source}&select=external_id,url,date`,
    { headers: sbHeaders(serviceKey) },
  )
  if (!res.ok) throw new Error(`catches (lecture) a répondu ${res.status} pour ${userId}/${source}`)
  return res.json()
}

/**
 * `resolution=ignore-duplicates` : garde-fou d'idempotence côté base, en plus de la
 * déduplication déjà faite en mémoire — la contrainte unique (user_id, source, external_id)
 * absorbe un rejeu sans jamais dupliquer ni réécrire une entrée existante.
 */
export async function insertCatches(supabaseUrl, serviceKey, rows, fetchFn = fetch) {
  if (!rows.length) return
  const res = await fetchFn(`${supabaseUrl}/rest/v1/catches`, {
    method: 'POST',
    headers: { ...sbHeaders(serviceKey), Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`catches (écriture) a répondu ${res.status} pour ${rows[0].user_id}`)
}

/**
 * Secrets des seules sources réellement présentes en base, vérifiés avant la première
 * requête : un secret manquant doit arrêter le run tout de suite, pas après quelques
 * insertions. Une source déclarée sans connecteur n'arrête rien — le run continue sur les
 * autres, sinon un pôle en cours d'installation gèlerait la capture de tout le monde.
 */
export function planSources(identities) {
  const sources = [...new Set(identities.map((i) => i.source))]
  const unknown = sources.filter((s) => !CONNECTORS[s])
  const missing = [...new Set(
    sources.filter((s) => CONNECTORS[s]).map((s) => CONNECTORS[s].secretEnv).filter((env) => !process.env[env]),
  )]
  return { unknown, missing }
}

export async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bootstrap = process.env.BOOTSTRAP_SINCE || new Date().toISOString().slice(0, 10)

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  }

  const identities = await fetchIdentities(supabaseUrl, serviceKey)
  const { unknown, missing } = planSources(identities)
  if (missing.length) throw new Error(`Secret(s) de source manquant(s) : ${missing.join(', ')}.`)
  if (unknown.length) console.warn(`Source(s) sans connecteur, ignorée(s) : ${unknown.join(', ')}.`)

  let total = 0

  for (const identity of identities) {
    const connector = CONNECTORS[identity.source]
    if (!connector) continue

    const existing = await fetchExistingCatches(supabaseUrl, serviceKey, identity.user_id, identity.source)
    const events = await connector.collect({
      handle: identity.handle,
      config: identity.config,
      since: sinceDate(existing, bootstrap),
      secret: process.env[connector.secretEnv],
      existing,
    })

    const rows = toRows(identity.user_id, identity.source, events)
    if (rows.length) {
      await insertCatches(supabaseUrl, serviceKey, rows)
      total += rows.length
    }
    console.log(`${identity.source}/${identity.handle} : ${rows.length} nouvelle(s) capture(s).`)
  }

  console.log(`${total} nouvelle(s) capture(s) au total sur ${identities.length} identité(s).`)
  return total
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
