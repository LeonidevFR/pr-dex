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
 * Contrat commun à tous les connecteurs : rendre les événements du handle survenus depuis
 * `since`, sans tirage ni écriture — `catch.mjs` s'en charge, seul endroit où vit la règle
 * du tirage. `config.repos` vide ou absent : aucun filtre, le périmètre du jeton fait foi.
 */
export async function collect({ handle, config = {}, since, secret, existing = [], fetchFn = fetch }) {
  const knownExternal = new Set(existing.map((c) => c.external_id))
  const knownPulls = new Set(existing.map((c) => pullRefOf(c.url)).filter(Boolean))
  const watched = config.repos?.length ? new Set(config.repos) : null
  const out = []
  const seen = new Set()

  const query = `is:pr is:merged author:${handle} merged:>=${since}`
  let page = 1

  for (;;) {
    const url = `${API}/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}`
    const res = await fetchFn(url, { headers: ghHeaders(secret) })
    if (!res.ok) throw new Error(`search/issues a répondu ${res.status}`)
    const body = await res.json()

    for (const it of body.items ?? []) {
      const repo = it.repository_url.replace(`${API}/repos/`, '')
      if (watched && !watched.has(repo)) continue
      if (knownPulls.has(`${repo}#${it.number}`)) continue

      const detailRes = await fetchFn(`${API}/repos/${repo}/pulls/${it.number}`, { headers: ghHeaders(secret) })
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
