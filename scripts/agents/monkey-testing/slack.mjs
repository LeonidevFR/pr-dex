const API = 'https://slack.com/api'
const MAX_RETRIES = 3
const MAX_WAIT_MS = 120_000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** `…/archives/C1/p1791878460000100?thread_ts=…` → le canal et le message racine. */
export function parseThreadUrl(url) {
  const m = /\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/.exec(url ?? '')
  if (!m) throw new Error(`Pas un lien de message Slack : ${url}`)
  const threadTs = new URL(url).searchParams.get('thread_ts')
  return { channel: m[1], ts: threadTs ?? `${m[2]}.${m[3]}` }
}

/**
 * Client minimal de l'API Web Slack. Le jeton bot demande `channels:history`, `chat:write` et
 * `users:read`, et le bot doit être invité dans la room.
 */
export function slackClient(token, fetchFn = fetch, wait = sleep) {
  async function call(method, params, post = false) {
    for (let attempt = 0; ; attempt++) {
      const res = post
        ? await fetchFn(`${API}/${method}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(params),
          })
        : await fetchFn(`${API}/${method}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 429) {
        if (attempt === MAX_RETRIES) throw new Error(`Slack ${method} : 429, quota toujours dépassé`)
        await wait(Math.min(Number(res.headers.get('retry-after') || 30) * 1000, MAX_WAIT_MS))
        continue
      }
      const body = await res.json()
      if (!body.ok) throw new Error(`Slack ${method} : ${body.error}`)
      return body
    }
  }

  async function paginate(method, params) {
    const out = []
    let cursor = ''
    do {
      const body = await call(method, { ...params, limit: '200', ...(cursor ? { cursor } : {}) })
      out.push(...body.messages)
      cursor = body.response_metadata?.next_cursor ?? ''
    } while (cursor)
    return out
  }

  const names = new Map()
  async function userName(id) {
    if (!names.has(id)) {
      const { user } = await call('users.info', { user: id })
      names.set(id, user.profile?.display_name || user.profile?.real_name || user.name || id)
    }
    return names.get(id)
  }

  return {
    history: (channel, oldest) => paginate('conversations.history', { channel, oldest }),
    replies: (channel, ts) => paginate('conversations.replies', { channel, ts }),
    userName,
    post: (channel, threadTs, text) => call('chat.postMessage', { channel, thread_ts: threadTs, text }, true),
  }
}
