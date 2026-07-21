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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = Deno.env.get('CATCH_DISPATCH_TOKEN')
  if (!token) {
    return new Response(JSON.stringify({ error: 'server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

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
    return new Response(JSON.stringify({ error: 'github dispatch failed', status: res.status, detail }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
