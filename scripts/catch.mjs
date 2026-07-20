import { drawFromSha } from '../shared/draw.js'

const API = 'https://api.github.com'

const ghHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
})

const sbHeaders = (key) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
})

/**
 * Point de départ de la recherche pour UN profil : sa capture la plus récente moins sept
 * jours de marge, ou la date de bootstrap au tout premier run. Par défaut (pas de
 * BOOTSTRAP_SINCE), le jour du run — jamais une date fixe dans le passé, sinon un profil
 * créé longtemps après la mise en service rattraperait tout son historique d'un coup.
 */
export function sinceDate(catches, bootstrap) {
  if (!catches.length) return bootstrap
  const latest = catches.reduce((max, c) => (c.date > max ? c.date : max), catches[0].date)
  const d = new Date(latest + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Retourne les entrées à ajouter pour un profil donné. Identique à la version historique
 * mono-repo : storage-agnostique, ne connaît que `existing` (sha/repo/pr déjà connus) et
 * les paramètres de recherche. `repos` vide ou absent : aucun filtre, tous les repos
 * accessibles au token sont retenus (son propre périmètre fait foi).
 */
export async function collectNewCatches(existing, { user, repos, token, since }, fetchFn = fetch) {
  const knownSha = new Set(existing.map((c) => c.sha))
  const knownPr = new Set(existing.map((c) => `${c.repo}#${c.pr}`))
  const watched = repos?.length ? new Set(repos) : null
  const out = []
  const seen = new Set()

  const query = `is:pr is:merged author:${user} merged:>=${since}`
  let page = 1

  for (;;) {
    const url = `${API}/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`
    const res = await fetchFn(url, { headers: ghHeaders(token) })
    if (!res.ok) throw new Error(`search/issues a répondu ${res.status}`)
    const body = await res.json()

    for (const it of body.items ?? []) {
      const repo = it.repository_url.replace(`${API}/repos/`, '')
      if (watched && !watched.has(repo)) continue
      if (knownPr.has(`${repo}#${it.number}`)) continue

      const detailRes = await fetchFn(`${API}/repos/${repo}/pulls/${it.number}`, { headers: ghHeaders(token) })
      if (!detailRes.ok) continue
      const detail = await detailRes.json()
      const sha = detail.merge_commit_sha
      if (!sha || knownSha.has(sha) || seen.has(sha)) continue
      seen.add(sha)

      const { species, shiny } = drawFromSha(sha)
      out.push({
        sha,
        repo,
        pr: it.number,
        title: it.title,
        date: (detail.merged_at ?? it.pull_request.merged_at).slice(0, 10),
        species,
        shiny,
      })
    }

    const link = res.headers?.get?.('link') ?? ''
    if (!link.includes('rel="next"')) break
    page++
  }

  return out
}

/** Tous les profils enregistrés — un par dev connecté au moins une fois via OAuth GitHub. */
export async function fetchProfiles(supabaseUrl, serviceKey, fetchFn = fetch) {
  const res = await fetchFn(`${supabaseUrl}/rest/v1/profiles?select=user_id,github_login,watch_repos`, {
    headers: sbHeaders(serviceKey),
  })
  if (!res.ok) throw new Error(`profiles a répondu ${res.status}`)
  return res.json()
}

/** Captures déjà connues d'un profil — sert de base à la déduplication et à `sinceDate`. */
export async function fetchExistingCatches(supabaseUrl, serviceKey, userId, fetchFn = fetch) {
  const res = await fetchFn(
    `${supabaseUrl}/rest/v1/catches?user_id=eq.${userId}&select=sha,repo,pr,date`,
    { headers: sbHeaders(serviceKey) },
  )
  if (!res.ok) throw new Error(`catches (lecture) a répondu ${res.status} pour ${userId}`)
  return res.json()
}

/**
 * `resolution=ignore-duplicates` : garde-fou d'idempotence côté base, en plus de la
 * déduplication déjà faite en mémoire — la contrainte unique (user_id, sha) absorbe un
 * rejeu sans jamais dupliquer ni réécrire une entrée existante.
 */
export async function insertCatches(supabaseUrl, serviceKey, userId, entries, fetchFn = fetch) {
  if (!entries.length) return
  const rows = entries.map((e) => ({ user_id: userId, ...e }))
  const res = await fetchFn(`${supabaseUrl}/rest/v1/catches`, {
    method: 'POST',
    headers: { ...sbHeaders(serviceKey), Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`catches (écriture) a répondu ${res.status} pour ${userId}`)
}

export async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const catchToken = process.env.CATCH_TOKEN
  const bootstrap = process.env.BOOTSTRAP_SINCE || new Date().toISOString().slice(0, 10)

  if (!supabaseUrl || !serviceKey || !catchToken) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et CATCH_TOKEN sont requis.')
  }

  const profiles = await fetchProfiles(supabaseUrl, serviceKey)
  let total = 0

  for (const profile of profiles) {
    const existing = await fetchExistingCatches(supabaseUrl, serviceKey, profile.user_id)
    const since = sinceDate(existing, bootstrap)
    const fresh = await collectNewCatches(existing, {
      user: profile.github_login,
      repos: profile.watch_repos,
      token: catchToken,
      since,
    })
    if (fresh.length) {
      await insertCatches(supabaseUrl, serviceKey, profile.user_id, fresh)
      total += fresh.length
    }
    console.log(`${profile.github_login} : ${fresh.length} nouvelle(s) capture(s).`)
  }

  console.log(`${total} nouvelle(s) capture(s) au total sur ${profiles.length} profil(s).`)
  return total
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
