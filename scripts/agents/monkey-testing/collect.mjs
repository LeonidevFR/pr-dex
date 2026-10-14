import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildSessions, planJudgments, LOOKBACK_SECONDS } from './sessions.mjs'
import { ACTIVITY, judgmentInput } from './attribution.mjs'
import { slackClient, parseThreadUrl } from './slack.mjs'
import { paths, readExisting, writeJson } from './work.mjs'

const SLACK_ID = /^[UW][A-Z0-9]+$/

/**
 * Identifiants Slack des personnes autorisées à lancer une session, séparés par des virgules.
 * Absente ou mal formée, la liste arrête le run : sans elle, n'importe qui lancerait une session.
 */
export function readOrganizers(value) {
  const ids = (value ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  const bad = ids.filter((id) => !SLACK_ID.test(id))
  if (!ids.length || bad.length) {
    throw new Error(`MONKEY_TESTING_ORGANIZERS doit lister des identifiants Slack séparés par des virgules${bad.length ? ` (invalides : ${bad.join(', ')})` : ''}.`)
  }
  return ids
}

/**
 * Étape 1 : lire la room et préparer une entrée par session à juger. Aucun appel à Claude ici,
 * aucune écriture hors de `WORK_DIR`.
 */
export async function main(env = process.env, now = Date.now(), slack = slackClient(env.SLACK_BOT_TOKEN)) {
  const channel = env.SLACK_CHANNEL_ID
  if (!channel || !env.ATTRIBUTIONS_DIR || !env.WORK_DIR) {
    throw new Error('SLACK_CHANNEL_ID, ATTRIBUTIONS_DIR et WORK_DIR sont requis.')
  }
  const organizers = readOrganizers(env.MONKEY_TESTING_ORGANIZERS)
  const forced = env.THREAD_URL ? parseThreadUrl(env.THREAD_URL) : null
  if (forced && forced.channel !== channel) {
    throw new Error(`Le thread est dans ${forced.channel}, pas dans la room de monkey-testing (${channel}).`)
  }

  const nowSec = now / 1000
  // Un thread forcé peut être plus vieux que la fenêtre : on lit depuis lui.
  const oldest = forced ? String(Number(forced.ts) - 1) : String(Math.floor(nowSec - LOOKBACK_SECONDS))
  const history = await slack.history(channel, oldest)
  const repliesByRoot = {}
  for (const m of history) {
    if (m.reply_count > 0) repliesByRoot[m.ts] = await slack.replies(channel, m.ts)
  }

  const sessions = buildSessions({ channel, history, repliesByRoot, organizers, forcedRoot: forced?.ts ?? null })
  const existingById = await readExisting(join(env.ATTRIBUTIONS_DIR, ACTIVITY))
  const todo = planJudgments({ sessions, existingById, nowSec, forcedId: forced?.ts ?? null })

  for (const session of todo) {
    const names = {}
    for (const id of new Set([session.organizer, ...session.messages.map((m) => m.user)])) {
      names[id] = await slack.userName(id)
    }
    await writeJson(join(paths(env.WORK_DIR).inputs, `${session.id}.json`), {
      session,
      names,
      input: judgmentInput(session, names),
    })
  }
  console.log(`${sessions.length} session(s) lue(s), ${todo.length} à juger.`)
  return todo.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
