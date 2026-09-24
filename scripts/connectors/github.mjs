const API = 'https://api.github.com'

const ghHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
})

export const id = 'github'

/** PAT fine-grained en lecture seule, commun à tous les profils : chacun n'est filtré que par son handle. */
export const secretEnv = 'CATCH_TOKEN'

const pullUrl = (repo, number) => `https://github.com/${repo}/pull/${number}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Au-delà, le run échoue : mieux vaut une notification qu'un job qui tourne indéfiniment. */
const MAX_RATE_LIMIT_RETRIES = 3
const MAX_WAIT_MS = 120_000

/**
 * Délai à respecter avant de rejouer une requête refusée pour dépassement de quota, ou null
 * si le refus n'en est pas un (jeton invalide, accès manquant) — celui-là doit casser le run.
 *
 * L'API search a son propre quota (30 requêtes/minute) et une limite secondaire sur les
 * rafales : quelques runs manuels enchaînés suffisent à la déclencher, et GitHub répond alors
 * 403 (ou 429) au milieu de la liste des identités. On suit l'ordre documenté par GitHub :
 * `retry-after`, sinon la remise à zéro du quota primaire, sinon une minute.
 */
export async function rateLimitDelay(res, now = Date.now()) {
  if (res.status !== 403 && res.status !== 429) return null
  const h = res.headers
  const retryAfter = Number(h?.get?.('retry-after'))
  const exhausted = h?.get?.('x-ratelimit-remaining') === '0'
  let message = ''
  try { message = (await res.json())?.message ?? '' } catch { /* corps absent ou illisible */ }
  if (res.status === 403 && !retryAfter && !exhausted && !/rate limit/i.test(message)) return null

  if (retryAfter) return Math.min(retryAfter * 1000, MAX_WAIT_MS)
  if (exhausted) {
    const reset = Number(h.get('x-ratelimit-reset')) * 1000
    if (reset) return Math.min(Math.max(reset - now, 0) + 1000, MAX_WAIT_MS)
  }
  return 60_000
}

async function ghFetch(url, secret, fetchFn, wait) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn(url, { headers: ghHeaders(secret) })
    if (res.ok || attempt === MAX_RATE_LIMIT_RETRIES) return res
    const delay = await rateLimitDelay(res)
    if (delay === null) return res
    console.warn(`GitHub limite le débit, nouvel essai dans ${Math.round(delay / 1000)} s.`)
    await wait(delay)
  }
}

/**
 * `moi/atlas#142` relu depuis l'URL d'une capture déjà connue. Sert à écarter une PR déjà
 * capturée AVANT d'aller chercher son détail : le sha de merge, seul identifiant externe
 * retenu, n'apparaît pas dans la réponse de recherche. Sans ce raccourci, la fenêtre de
 * recouvrement de sept jours coûterait un appel de détail par PR déjà connue.
 */
export function pullRefOf(url) {
  const m = /^https:\/\/github\.com\/(.+)\/pull\/(\d+)$/.exec(url ?? '')
  return m ? `${m[1]}#${m[2]}` : null
}

/**
 * Organisation surveillée par défaut quand une identité ne restreint pas `config.repos`
 * explicitement. Sans ça, tout PAT fine-grained garde un accès lecture implicite à
 * n'importe quel dépôt public sur GitHub, quel que soit son scope réel — un dépôt perso
 * public (ex. pr-dex lui-même) remontait donc comme capture au même titre qu'un dépôt
 * Guest Suite.
 */
const DEFAULT_ORG = 'Guest-Suite'

/**
 * Contrat commun à tous les connecteurs : rendre les événements du handle survenus depuis
 * `since`, sans tirage ni écriture — `catch.mjs` s'en charge, seul endroit où vit la règle
 * du tirage. `config.repos` vide ou absent : repli sur `DEFAULT_ORG`, pas sur l'absence
 * totale de filtre.
 */
export async function collect({ handle, config = {}, since, secret, existing = [], fetchFn = fetch, wait = sleep }) {
  const knownExternal = new Set(existing.map((c) => c.external_id))
  const knownPulls = new Set(existing.map((c) => pullRefOf(c.url)).filter(Boolean))
  const watched = config.repos?.length ? new Set(config.repos) : null
  const out = []
  const seen = new Set()

  const query = `is:pr is:merged author:${handle} merged:>=${since}`
  let page = 1

  for (;;) {
    const url = `${API}/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`
    const res = await ghFetch(url, secret, fetchFn, wait)
    if (!res.ok) throw new Error(`search/issues a répondu ${res.status}`)
    const body = await res.json()

    for (const it of body.items ?? []) {
      const repo = it.repository_url.replace(`${API}/repos/`, '')
      if (watched ? !watched.has(repo) : repo.split('/')[0] !== DEFAULT_ORG) continue
      if (knownPulls.has(`${repo}#${it.number}`)) continue

      const detailRes = await ghFetch(`${API}/repos/${repo}/pulls/${it.number}`, secret, fetchFn, wait)
      if (!detailRes.ok) continue
      const detail = await detailRes.json()
      const sha = detail.merge_commit_sha
      if (!sha || knownExternal.has(sha) || seen.has(sha)) continue
      seen.add(sha)

      out.push({
        externalId: sha,
        label: it.title,
        ref: `${repo}#${it.number} · ${sha.slice(0, 7)}`,
        url: pullUrl(repo, it.number),
        date: (detail.merged_at ?? it.pull_request.merged_at).slice(0, 10),
      })
    }

    const link = res.headers?.get?.('link') ?? ''
    if (!link.includes('rel="next"')) break
    page++
  }

  return out
}
