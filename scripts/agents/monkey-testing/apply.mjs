import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ACTIVITY, fileNameOf, mergeAttribution, recapText, validateVerdict } from './attribution.mjs'
import { paths, readJson, writeJson, addFailure, readExisting } from './work.mjs'

/**
 * Étape 3 : contrôler chaque verdict, puis écrire le fichier d'attribution de sa session. Un
 * verdict rejeté n'écrit rien et n'annonce rien ; les autres sessions passent.
 */
export async function main(env = process.env) {
  for (const key of ['WORK_DIR', 'ATTRIBUTIONS_DIR', 'SLACK_WORKSPACE_URL', 'PRDEX_URL']) {
    if (!env[key]) throw new Error(`${key} est requis.`)
  }
  const p = paths(env.WORK_DIR)
  const dir = join(env.ATTRIBUTIONS_DIR, ACTIVITY)
  const existingById = await readExisting(dir)
  const announcements = []
  let written = 0

  let verdicts = []
  try {
    verdicts = (await readdir(p.verdicts)).filter((n) => n.endsWith('.json')).sort()
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  for (const name of verdicts) {
    const id = name.replace(/\.json$/, '')
    try {
      const { session, names } = await readJson(join(p.inputs, name))
      const accepted = validateVerdict(await readJson(join(p.verdicts, name)), session)
      const existing = existingById[id] ?? null
      const { file, ...previous } = existing ?? {}
      const { data, added, created } = mergeAttribution({
        existing: existing ? previous : null, session, accepted, names, base: env.SLACK_WORKSPACE_URL,
      })
      await writeJson(join(dir, file ?? fileNameOf(id)), data)
      written++
      const text = recapText({ created, added, prdexUrl: env.PRDEX_URL })
      if (text) announcements.push({ channel: session.channel, thread_ts: session.id, text })
    } catch (e) {
      await addFailure(env.WORK_DIR, `${id} : ${e.message}`)
    }
  }
  await writeJson(p.announcements, announcements)
  console.log(`${written} fichier(s) écrit(s), ${announcements.length} récap(s) à poster.`)
  return { written, announcements: announcements.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
