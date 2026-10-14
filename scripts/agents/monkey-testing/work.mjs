import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Les étapes du workflow se passent le relais par fichiers, dans `WORK_DIR`. */
export const paths = (workDir) => ({
  inputs: join(workDir, 'inputs'),
  verdicts: join(workDir, 'verdicts'),
  failures: join(workDir, 'failures.json'),
  announcements: join(workDir, 'announcements.json'),
})

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return fallback
    throw e
  }
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
}

/** Un échec ne bloque que sa session : on le note, et la dernière étape fait finir le run en rouge. */
export async function addFailure(workDir, message) {
  const file = paths(workDir).failures
  await writeJson(file, [...(await readJson(file, [])), message])
  console.error(message)
}

/** Fichiers d'attribution déjà écrits, par id de session. */
export async function readExisting(dir) {
  const out = {}
  let names = []
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json'))
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  for (const name of names) {
    const data = JSON.parse(await readFile(join(dir, name), 'utf8'))
    out[data.id] = { ...data, file: name }
  }
  return out
}
