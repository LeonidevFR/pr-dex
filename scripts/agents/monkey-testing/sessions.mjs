/** Une session est finie après une journée sans message : personne ne la clôture à la main. */
export const QUIET_SECONDS = 24 * 3600
/** Au-delà, une réponse tardive ne rapporte plus rien. */
export const LOOKBACK_SECONDS = 7 * 24 * 3600
/**
 * Hors de toute session ouverte, un message lance une session si au moins deux personnes, en
 * dehors de son auteur, ont répondu dans son thread. Un retour isolé reçoit en général une
 * seule réponse, celle du dev : il ne doit pas devenir une session, ni son auteur un
 * organisateur.
 */
export const MIN_REPLIERS = 2

const HUMAN_SUBTYPES = new Set([undefined, 'thread_broadcast', 'file_share'])
export const isHuman = (m) => Boolean(m.user) && !m.bot_id && HUMAN_SUBTYPES.has(m.subtype)

/** Les `ts` Slack ont toujours six décimales : comparés en entiers, sans arrondi flottant. */
const tsKey = (ts) => BigInt(ts.replace('.', ''))
const byTs = (a, b) => (tsKey(a.ts) < tsKey(b.ts) ? -1 : tsKey(a.ts) > tsKey(b.ts) ? 1 : 0)
const maxTs = (a, b) => (tsKey(a) >= tsKey(b) ? a : b)

const repliersOf = (root, replies) => {
  const users = new Set(replies.filter(isHuman).map((r) => r.user))
  users.delete(root.user)
  return users.size
}

/**
 * Découpe la room en sessions. `history` : les messages de premier niveau
 * (`conversations.history`). `repliesByRoot` : les réponses de chaque thread
 * (`conversations.replies`, message racine compris).
 *
 * Pendant une session ouverte, tout message de premier niveau est un retour posté dans la room
 * au lieu du thread, même si d'autres lui ont répondu : il revient à cette session, avec ses
 * réponses. Sinon un testeur dont le bug a suscité deux réponses deviendrait l'organisateur
 * d'une session à lui, et perdrait son booster. Le prix : deux sessions lancées à moins de
 * 24 h d'intervalle se fondent en une, sauf si la seconde est passée à la main.
 *
 * `thread` désigne le thread d'un message qui n'est pas celui de la session : il sert à
 * construire le lien vers ce message.
 */
export function buildSessions({ channel, history, repliesByRoot, forcedRoot = null }) {
  // Une réponse « aussi envoyée dans la room » y apparaît une seconde fois : on ne garde que
  // l'exemplaire du thread.
  const top = history.filter((m) => isHuman(m) && (!m.thread_ts || m.thread_ts === m.ts)).sort(byTs)
  const sessions = []
  for (const m of top) {
    const replies = (repliesByRoot[m.ts] ?? []).filter((r) => r.ts !== m.ts)
    const open = m.ts === forcedRoot
      ? null
      : [...sessions].reverse().find((s) => Number(m.ts) - Number(s.lastTs) < QUIET_SECONDS)
    if (!open && (m.ts === forcedRoot || repliersOf(m, replies) >= MIN_REPLIERS)) {
      const humans = replies.filter(isHuman).sort(byTs)
      sessions.push({
        id: m.ts,
        channel,
        organizer: m.user,
        rootText: m.text ?? '',
        messages: humans.map((r) => ({ ts: r.ts, user: r.user, text: r.text ?? '', where: 'thread' })),
        lastTs: humans.reduce((acc, r) => maxTs(acc, r.ts), m.ts),
      })
      continue
    }
    if (!open) continue
    const added = [
      { ts: m.ts, user: m.user, text: m.text ?? '', where: 'room' },
      ...replies.filter(isHuman).map((r) => ({ ts: r.ts, user: r.user, text: r.text ?? '', where: 'room', thread: m.ts })),
    ]
    open.messages.push(...added)
    open.messages.sort(byTs)
    open.lastTs = added.reduce((acc, r) => maxTs(acc, r.ts), open.lastTs)
  }
  return sessions
}

export const isClosed = (session, nowSec) => nowSec - Number(session.lastTs) >= QUIET_SECONDS

/**
 * Sessions à juger maintenant. Une session déjà jugée n'est rejugée que si un message est
 * arrivé depuis (`seen_until`) : rejuger à l'identique ferait grossir la liste au hasard des
 * tirages de Claude, puisqu'on ajoute sans jamais retirer.
 */
export function planJudgments({ sessions, existingById, nowSec, forcedId = null }) {
  // Un thread passé à la main est jugé seul : l'historique lu depuis lui contient des sessions
  // hors de la fenêtre de sept jours, qu'un lancement manuel ne doit pas récompenser au passage.
  if (forcedId) return sessions.filter((s) => s.id === forcedId)
  return sessions.filter((s) => {
    if (!isClosed(s, nowSec)) return false
    const seen = existingById[s.id]?.seen_until
    return !seen || tsKey(s.lastTs) > tsKey(seen)
  })
}
