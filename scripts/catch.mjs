import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drawFromSha } from '../shared/draw.js'

const API = 'https://api.github.com'

/**
 * Point de départ de la recherche : la capture la plus récente moins sept jours de marge,
 * ou la date de bootstrap au premier run. La marge couvre les PR mergées entre deux passes.
 */
export function sinceDate(catches, bootstrap) {
  if (!catches.length) return bootstrap
  const latest = catches.reduce((max, c) => (c.date > max ? c.date : max), catches[0].date)
  const d = new Date(latest + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

const headers = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
})

/**
 * Retourne les entrées à ajouter à `catches.json`.
 *
 * Deux niveaux de déduplication, et les deux sont nécessaires :
 *  - sur `(repo, pr)` AVANT l'appel de détail, parce que `merge_commit_sha` n'est connu
 *    qu'après cet appel : sans ce pré-filtre, l'Action réinterroge toute la fenêtre de
 *    sept jours à chacune de ses 48 exécutions quotidiennes ;
 *  - sur `sha` APRÈS, comme garde-fou d'idempotence — deux PR peuvent partager un merge
 *    commit, et le script doit rester rejouable sans dommage.
 */
export async function collectNewCatches(existing, { user, repos, token, since }, fetchFn = fetch) {
  const knownSha = new Set(existing.map((c) => c.sha))
  const knownPr = new Set(existing.map((c) => `${c.repo}#${c.pr}`))
  // Liste vide ou absente : pas de filtre côté script, on fait confiance au périmètre du
  // PAT (CATCH_TOKEN doit alors être créé en "All repositories" sur l'organisation).
  const watched = repos.length ? new Set(repos) : null
  const out = []
  const seen = new Set()

  const query = `is:pr is:merged author:${user} merged:>=${since}`
  let page = 1

  for (;;) {
    const url = `${API}/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`
    const res = await fetchFn(url, { headers: headers(token) })
    if (!res.ok) throw new Error(`search/issues a répondu ${res.status}`)
    const body = await res.json()

    for (const it of body.items ?? []) {
      const repo = it.repository_url.replace(`${API}/repos/`, '')
      if (watched && !watched.has(repo)) continue
      if (knownPr.has(`${repo}#${it.number}`)) continue

      // L'API search ne renvoie pas merge_commit_sha : un appel de détail par PR inconnue.
      const detailRes = await fetchFn(`${API}/repos/${repo}/pulls/${it.number}`, { headers: headers(token) })
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

const readJson = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback }
}

export async function main() {
  // `??` ne rattraperait pas une variable de dépôt GitHub Actions non définie : celle-ci arrive
  // comme une chaîne vide, jamais `undefined`. `||` est donc volontairement utilisé ici.
  const path = process.env.CATCHES_PATH || 'data/catches.json'
  const user = process.env.WATCH_USER
  // Vide (variable absente) : aucun filtre de repo, voir le commentaire dans collectNewCatches.
  const repos = (process.env.WATCH_REPOS ?? '').split(',').map((r) => r.trim()).filter(Boolean)
  const token = process.env.CATCH_TOKEN
  // Par défaut, aucun rattrapage rétroactif : le point de départ est le jour du run. Un
  // BOOTSTRAP_SINCE fixe dans le passé capturerait d'un coup tout l'historique de quelqu'un
  // qui active l'outil des années après sa mise en service.
  const bootstrap = process.env.BOOTSTRAP_SINCE || new Date().toISOString().slice(0, 10)

  if (!user || !token) {
    throw new Error('WATCH_USER et CATCH_TOKEN sont requis.')
  }

  const existing = readJson(path, [])
  const since = sinceDate(existing, bootstrap)
  const fresh = await collectNewCatches(existing, { user, repos, token, since })

  if (!fresh.length) {
    console.log('Aucune nouvelle capture.')
    return 0
  }

  // Append puis tri par date croissante. Les entrées existantes ne sont jamais recalculées.
  const merged = [...existing, ...fresh].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n')
  console.log(`${fresh.length} nouvelle(s) capture(s).`)
  return fresh.length
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
