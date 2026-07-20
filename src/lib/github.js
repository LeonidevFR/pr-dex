const API = 'https://api.github.com'
const CATCHES_PATH = 'data/catches.json'
const STATE_PATH = 'data/state.json'

const EMPTY_STATE = () => ({ claimed: [], spent: {}, evolutions: [] })

/** `kind` : 'revoked' | 'notfound' | 'conflict' | 'offline' | 'server' — chaque cas a un message distinct côté UI. */
export class GithubError extends Error {
  constructor(kind, message, status) {
    super(message)
    this.name = 'GithubError'
    this.kind = kind
    this.status = status
  }
}

function classify(status) {
  if (status === 401 || status === 403) return 'revoked'
  if (status === 404) return 'notfound'
  if (status === 409 || status === 422) return 'conflict'
  return 'server'
}

// L'API renvoie de l'UTF-8 encodé en base64 ; atob/btoa travaillent sur des octets latin-1.
const decode = (b64) => JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))))
const encode = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2) + '\n')))

export function createGithubClient({ repo, token }) {
  async function call(path, init = {}) {
    let res
    try {
      res = await fetch(`${API}/repos/${repo}${path ? `/${path}` : ''}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...init.headers,
        },
      })
    } catch {
      // fetch ne rejette que sur une panne réseau — jamais sur un statut HTTP.
      throw new GithubError('offline', 'Pas de connexion réseau.')
    }
    if (!res.ok) {
      throw new GithubError(classify(res.status), `GitHub a répondu ${res.status}.`, res.status)
    }
    return res.json()
  }

  /** Vérifie que le repo existe et que le jeton y a accès. Sert à distinguer 404-repo de 404-fichier. */
  async function checkAccess() {
    await call('')
    return true
  }

  async function readCatches() {
    try {
      const body = await call(`contents/${CATCHES_PATH}`)
      return decode(body.content)
    } catch (e) {
      // Premier lancement légitime : l'Action n'a encore rien écrit.
      if (e.kind === 'notfound') return []
      throw e
    }
  }

  async function readState() {
    try {
      const body = await call(`contents/${STATE_PATH}`)
      return { state: { ...EMPTY_STATE(), ...decode(body.content) }, blobSha: body.sha }
    } catch (e) {
      if (e.kind === 'notfound') return { state: EMPTY_STATE(), blobSha: null }
      throw e
    }
  }

  async function writeState(state, blobSha, message) {
    const body = await call(`contents/${STATE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: encode(state),
        ...(blobSha ? { sha: blobSha } : {}),
      }),
    })
    return { blobSha: body.content.sha }
  }

  return { checkAccess, readCatches, readState, writeState }
}
