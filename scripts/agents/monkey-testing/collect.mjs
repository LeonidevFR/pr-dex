import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildSessions, planJudgments, LOOKBACK_SECONDS } from './sessions.mjs'
import { ACTIVITY, judgmentInput } from './attribution.mjs'
import { slackClient, parseThreadUrl } from './slack.mjs'
import { paths, readExisting, writeJson } from './work.mjs'

/**
 * Étape 1 : lire la room et préparer une entrée par session à juger. Aucun appel à Claude ici,
 * aucune écriture hors de `WORK_DIR`.
 */
export async function main(env = process.env, now = Date.now(), slack = slackClient(env.SLACK_BOT_TOKEN)) {
  const channel = env.SLACK_CHANNEL_ID
  if (!channel || !env.ATTRIBUTIONS_DIR || !env.WORK_DIR) {
    throw new Error('SLACK_CHANNEL_ID, ATTRIBUTIONS_DIR et WORK_DIR sont requis.')
  }
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

  const sessions = buildSessions({ channel, history, repliesByRoot, forcedRoot: forced?.ts ?? null })
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
