export const ACTIVITY = 'monkey-testing'
/** Le connecteur `slack` plafonne aussi à 10 : ce chiffre ne peut pas dériver d'un côté seul. */
export const DRAWS = 10

const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Jour de Paris d'un message : une session lancée à 0 h 30 appartient au jour qui commence. */
export const dateOf = (ts) => parisDay.format(new Date(Number(ts) * 1000))
/**
 * Libellé de la carte, au dos et dans le journal : le sujet de la session, comme le titre d'une
 * PR. À défaut de sujet, la date — le dos l'affiche déjà, mais la ligne ne reste pas vide.
 */
export const labelOf = (date, subject = '') =>
  `Monkey-testing · ${subject || shortDay.format(new Date(`${date}T00:00:00Z`))}`

const MAX_SUBJECT = 60

/**
 * Sujet d'une session : la première ligne du message qui la lance, débarrassée du balisage
 * Slack (mentions, liens, emojis, gras) et du mot « monkey-testing » que tout le monde y met.
 * Le dos de carte coupe à trois lignes : on coupe avant, au mot.
 */
export function subjectOf(text) {
  let s = (text ?? '').split('\n').find((line) => line.trim()) ?? ''
  s = s
    .replace(/<([^|>]+)\|([^>]+)>/g, (_, target, label) => (target.startsWith('#') ? `#${label}` : label))
    .replace(/<[^>]*>/g, '')
    .replace(/:[a-z][a-z0-9_+-]*:/gi, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^monkey[\s-]?testing\s*[:\-–—·]?\s*/i, '')
  if (!s) return ''
  s = s[0].toUpperCase() + s.slice(1)
  if (s.length <= MAX_SUBJECT) return s
  const cut = s.slice(0, MAX_SUBJECT)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.\-]+$/, '')}…`
}
export const fileNameOf = (sessionId) => `${dateOf(sessionId)}-${sessionId}.json`

export function permalink(base, channel, ts, threadTs = null) {
  const url = `${base}/archives/${channel}/p${ts.replace('.', '')}`
  return threadTs && threadTs !== ts ? `${url}?thread_ts=${threadTs}&cid=${channel}` : url
}

/** Ce que Claude voit : le périmètre annoncé, et chaque message avec son auteur. */
export function judgmentInput(session, names) {
  return {
    scope: session.rootText,
    organizer: session.organizer,
    messages: session.messages.map((m) => ({
      ts: m.ts,
      slack_id: m.user,
      name: names[m.user] ?? m.user,
      where: m.where,
      text: m.text,
      organizer: m.user === session.organizer,
    })),
  }
}

/**
 * Les messages Slack sont écrits par n'importe qui, et Claude les lit : un testeur peut y
 * glisser une consigne. Ces contrôles bornent ce qu'une injection peut obtenir. Le verdict ne
 * peut nommer que quelqu'un qui a posté dans la session, jamais l'organisateur, et chaque
 * preuve doit être un message de cette personne.
 */
export function validateVerdict(verdict, session) {
  if (!Array.isArray(verdict?.participants)) throw new Error('verdict sans liste participants')
  const own = new Map()
  for (const m of session.messages) {
    if (!own.has(m.user)) own.set(m.user, new Set())
    own.get(m.user).add(m.ts)
  }
  const out = new Map()
  for (const p of verdict.participants) {
    if (p.slack_id === session.organizer) throw new Error(`${p.slack_id} est l'organisateur, il ne gagne pas`)
    const posted = own.get(p.slack_id)
    if (!posted) throw new Error(`${p.slack_id} n'a rien posté dans la session`)
    if (!Array.isArray(p.evidence_ts) || !p.evidence_ts.length) throw new Error(`${p.slack_id} : aucune preuve`)
    for (const ts of p.evidence_ts) {
      if (!posted.has(ts)) throw new Error(`${p.slack_id} : la preuve ${ts} n'est pas un de ses messages dans la session`)
    }
    out.set(p.slack_id, [...new Set([...(out.get(p.slack_id) ?? []), ...p.evidence_ts])])
  }
  return [...out].map(([slack_id, evidence_ts]) => ({ slack_id, evidence_ts }))
}

/**
 * Ajoute les participants retenus au fichier de la session, sans jamais en retirer : leurs
 * cartes sont peut-être déjà tirées. `seen_until` note le dernier message vu, pour ne pas
 * rejuger la session tant que rien de neuf n'arrive.
 */
export function mergeAttribution({ existing, session, accepted, names, base }) {
  const date = existing?.date ?? dateOf(session.id)
  const data = existing
    ? structuredClone(existing)
    : {
        activity: ACTIVITY,
        id: session.id,
        label: labelOf(date, subjectOf(session.rootText)),
        url: permalink(base, session.channel, session.id),
        date,
        draws: DRAWS,
        recipients: [],
      }
  // Le thread de chaque message : celui de la session, celui d'un retour posté dans la room
  // (`thread`), ou aucun pour un message de la room.
  const threadOf = new Map(session.messages.map((m) => [m.ts, m.thread ?? (m.where === 'thread' ? session.id : null)]))
  const known = new Set(data.recipients.map((r) => r.slack_id))
  const added = []
  for (const p of accepted) {
    if (known.has(p.slack_id)) continue
    data.recipients.push({
      slack_id: p.slack_id,
      name: names[p.slack_id] ?? p.slack_id,
      evidence: p.evidence_ts.map((ts) => permalink(base, session.channel, ts, threadOf.get(ts))),
    })
    known.add(p.slack_id)
    added.push(p.slack_id)
  }
  data.seen_until = session.lastTs
  return { data, added, created: !existing }
}

/** Le récap public est la carotte : les autres voient qui a gagné. */
export function recapText({ created, added, prdexUrl }) {
  if (!added.length) return null
  const who = added.map((id) => `<@${id}>`).join(', ')
  return created
    ? `🎴 Merci pour vos retours ! Booster pr-dex de ${DRAWS} cartes pour ${who}. Ouvrez-le sur ${prdexUrl}, avec Slack si vous n'avez pas de compte GitHub.`
    : `🎴 En plus : booster pr-dex de ${DRAWS} cartes pour ${who}. À ouvrir sur ${prdexUrl}.`
}
