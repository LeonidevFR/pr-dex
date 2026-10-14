import { pathToFileURL } from 'node:url'
import { slackClient } from './slack.mjs'
import { paths, readJson } from './work.mjs'

/**
 * Étape 5, après le push : un récap annoncé avant que le fichier soit commité promettrait des
 * cartes qui n'arriveraient jamais.
 */
export async function main(env = process.env, slack = slackClient(env.SLACK_BOT_TOKEN)) {
  const list = await readJson(paths(env.WORK_DIR).announcements, [])
  for (const a of list) await slack.post(a.channel, a.thread_ts, a.text)
  console.log(`${list.length} récap(s) posté(s).`)
  return list.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
