// Dit au front où en est la capture lancée par un clic sur ⟳ : en attente chez GitHub, en
// cours, réussie ou en échec. Sans elle, le front ne savait pas qu'une capture était finie
// quand elle ne trouvait rien, et le joueur rechargeait la page en boucle.
//
// Même jeton que `trigger-catch` (`CATCH_DISPATCH_TOKEN`, « Actions: Read and write » sur
// pr-dex-data) : la lecture des runs fait partie de ce droit. Le JWT du joueur est vérifié par
// la plateforme, comme pour `trigger-catch`.

import { runStatus } from '../_shared/runStatus.js'

const GITHUB_OWNER = 'LeonidevFR'
const GITHUB_REPO = 'pr-dex-data'
const WORKFLOW_FILE = 'catch.yml'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const token = Deno.env.get('CATCH_DISPATCH_TOKEN')
  if (!token) return json({ error: 'server misconfigured' }, 500)

  let since
  try {
    since = (await req.json()).since
  } catch {
    since = null
  }
  if (typeof since !== 'string' || Number.isNaN(Date.parse(since))) return json({ error: 'since attendu (date ISO)' }, 400)

  // Une marge d'une minute avant le clic : `runStatus` affine, mais la requête ne doit rien perdre.
  const from = new Date(Date.parse(since) - 60_000).toISOString()
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?created=${encodeURIComponent(`>=${from}`)}&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pr-dex-catch-status',
      },
    },
  )
  if (!res.ok) return json({ error: 'github runs failed', status: res.status, detail: await res.text() }, 502)

  const { workflow_runs: runs = [] } = await res.json()
  return json({ status: runStatus(runs, since) })
})
