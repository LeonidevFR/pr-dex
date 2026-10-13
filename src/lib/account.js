export const GITHUB = 'github'
export const SLACK = 'slack_oidc'

/**
 * Nom affiché d'un compte. Le login GitHub d'abord, parce que c'est celui que les devs
 * connaissent déjà ; le nom Slack sinon, pour qui n'a pas de compte GitHub.
 */
export function accountName(user) {
  const m = user?.user_metadata ?? {}
  return m.user_name ?? m.name ?? m.full_name ?? ''
}

/** Fournisseurs liés au compte, dans l'ordre où Supabase les rend. */
export function providersOf(user) {
  return [...new Set((user?.identities ?? []).map((i) => i.provider))]
}

const ERROR_KEYS = ['error', 'error_code', 'error_description']

/**
 * Supabase signale l'échec d'une connexion ou d'une liaison en revenant sur la page avec
 * l'erreur dans la query (flux PKCE) ou dans le fragment (flux implicite).
 */
export function readAuthError(href) {
  const url = new URL(href)
  for (const params of [url.searchParams, new URLSearchParams(url.hash.slice(1))]) {
    if (params.has('error')) {
      return { code: params.get('error_code') ?? params.get('error'), description: params.get('error_description') ?? '' }
    }
  }
  return null
}

/** La même URL sans l'erreur : un rechargement ne doit pas la réafficher. */
export function withoutAuthError(href) {
  const url = new URL(href)
  for (const k of ERROR_KEYS) url.searchParams.delete(k)
  const hash = new URLSearchParams(url.hash.slice(1))
  for (const k of ERROR_KEYS) hash.delete(k)
  url.hash = hash.toString()
  return url.toString()
}
