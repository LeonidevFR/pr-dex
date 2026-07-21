// Déclenche l'Action `catch.yml` de pr-dex-data via l'API GitHub, à la place du cron
// horaire — pour le bouton de sync du front. Le PAT vit ici (secret de fonction), jamais
// côté navigateur : le front n'a que sa session Supabase (JWT vérifié par la plateforme,
// cf. réglage de déploiement), pas de jeton GitHub à lui.
//
// PAT requis en secret `CATCH_DISPATCH_TOKEN` : fine-grained, scopé au seul repo
// pr-dex-data, permission "Actions: Read and write" (rien d'autre — pas d'accès contenu).

const GITHUB_OWNER = 'LeonidevFR'
const GITHUB_REPO = 'pr-dex-data'
const WORKFLOW_FILE = 'catch.yml'
const REF = 'main'

// supabase-js envoie un preflight OPTIONS (Authorization/apikey sont des headers "non
// simples") avant le vrai POST — sans ces en-têtes, le navigateur bloque tout avant même
// d'émettre la requête réelle. L'origine n'est pas la vraie barrière de sécurité ici, le
// JWT vérifié par la plateforme l'est : origin '*' est sans conséquence, cf. plateformes
// serveur à serveur/curl qui ignorent CORS de toute façon.
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

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: REF }),
    },
  )

  // workflow_dispatch répond 204 sans corps quand GitHub a accepté la demande — ça ne
  // garantit pas que le run a déjà fini, juste qu'il a été mis en file.
  if (res.status !== 204) {
    const detail = await res.text()
    return json({ error: 'github dispatch failed', status: res.status, detail }, 502)
  }

  return json({ ok: true })
})
