import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const id = 'slack'

/**
 * Chemin du dossier `attributions/` du checkout de pr-dex-data. Ce n'est pas un secret : le
 * contrat des connecteurs passe par une variable d'environnement, et `planSources` arrête le
 * run tout de suite si elle manque, avant la première insertion.
 */
export const secretEnv = 'ATTRIBUTIONS_DIR'

/**
 * C'est l'agent qui écrit `draws`. Une erreur de sa part ne doit pas distribuer plus d'un
 * booster par participation : le plafond vit ici, dans le code relu, pas dans un prompt.
 */
export const MAX_DRAWS = 10

const DATE = /^\d{4}-\d{2}-\d{2}$/
const SLACK_ID = /^[UW][A-Z0-9]+$/

/**
 * Vérifie un fichier d'attribution et n'en garde que ce que le connecteur lit. Les champs en
 * plus (`name`, `evidence`, `seen_until`) servent à la relecture humaine ou à l'agent : ils
 * passent sans erreur.
 */
export function parseAttribution(data, path, folder) {
  const fail = (why) => { throw new Error(`${path} : ${why}`) }
  if (!data || typeof data !== 'object') fail('le fichier ne contient pas un objet')
  if (data.activity !== folder) fail(`activity « ${data.activity} » ne correspond pas au dossier « ${folder} »`)
  if (typeof data.id !== 'string' || !data.id) fail('id manquant')
  if (typeof data.label !== 'string' || !data.label) fail('label manquant')
  if (typeof data.url !== 'string' || !data.url.startsWith('https://')) fail('url manquante ou pas en https')
  if (typeof data.date !== 'string' || !DATE.test(data.date)) fail('date attendue au format AAAA-MM-JJ')
  if (!Number.isInteger(data.draws) || data.draws < 1) fail('draws doit être un entier positif')
  if (!Array.isArray(data.recipients)) fail('recipients doit être une liste')
  for (const r of data.recipients) {
    if (typeof r?.slack_id !== 'string' || !SLACK_ID.test(r.slack_id)) fail(`slack_id invalide : ${JSON.stringify(r?.slack_id)}`)
  }
  const { activity, id, label, url, date, draws, recipients } = data
  return { activity, id, label, url, date, draws, recipients: recipients.map((r) => ({ slack_id: r.slack_id })) }
}

/** Fichiers `<dossier>/<activité>/*.json`, dans un ordre stable. */
async function listFiles(dir) {
  let folders
  try {
    folders = await readdir(dir, { withFileTypes: true })
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Dossier d’attributions introuvable : ${dir}`)
    throw e
  }
  const files = []
  for (const f of folders.filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const names = (await readdir(join(dir, f))).filter((n) => n.endsWith('.json')).sort()
    for (const name of names) files.push({ folder: f, rel: `${f}/${name}`, abs: join(dir, f, name) })
  }
  return files
}

/**
 * Contrat commun à tous les connecteurs : rendre les événements du handle. Ici, un handle est
 * un identifiant Slack, et un événement est un des `draws` tirages d'une participation.
 *
 * `since` est ignoré. Pour GitHub, la fenêtre borne le coût des appels à l'API ; lire des
 * fichiers locaux ne coûte rien, et une attribution n'a aucune raison d'expirer : quelqu'un
 * qui se connecte un mois après sa participation reçoit son booster. La déduplication ne
 * repose que sur les captures existantes.
 *
 * La clé contient la personne : elle sert de graine au tirage, et sans elle tous les
 * participants d'une session tireraient les mêmes Pokémon.
 */
export async function collect({ handle, secret, existing = [] }) {
  const known = new Set(existing.map((c) => c.external_id))
  const out = []
  for (const file of await listFiles(secret)) {
    let data
    try {
      data = JSON.parse(await readFile(file.abs, 'utf8'))
    } catch (e) {
      throw new Error(`${file.rel} : JSON illisible (${e.message})`)
    }
    const a = parseAttribution(data, file.rel, file.folder)
    if (!a.recipients.some((r) => r.slack_id === handle)) continue
    for (let n = 1; n <= Math.min(a.draws, MAX_DRAWS); n++) {
      const externalId = `${a.activity}:${a.id}:${handle}:${n}`
      if (known.has(externalId)) continue
      known.add(externalId)
      out.push({ externalId, label: a.label, ref: a.activity, url: a.url, date: a.date })
    }
  }
  return out
}
