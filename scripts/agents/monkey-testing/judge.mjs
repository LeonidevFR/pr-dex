import { spawnSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { paths, readJson, writeJson, addFailure } from './work.mjs'

// `fileURLToPath` plutôt que `new URL('../../../', import.meta.url)` : sous Vitest, jsdom
// remplace le `URL` global, qui résout alors le chemin relatif contre http://localhost.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Claude juge, et rien d'autre : `--tools ""` lui retire shell, réseau et écriture. Une
 * consigne glissée dans un message Slack ne peut donc changer que la liste des gagnants, que
 * `apply.mjs` contrôle ensuite.
 *
 * Pas de `--bare` : ce mode n'accepte qu'une clé API et ignore `CLAUDE_CODE_OAUTH_TOKEN`, le
 * jeton d'abonnement sur lequel l'agent doit tourner.
 */
export function claudeArgs({ systemPrompt, schema, model }) {
  return [
    '-p',
    '--tools', '',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--system-prompt', systemPrompt,
    '--setting-sources', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--model', model,
  ]
}

export function readVerdict(stdout) {
  const result = JSON.parse(stdout)
  if (result.is_error) throw new Error(`jugement en échec : ${result.subtype ?? ''} ${result.result ?? ''}`.trim())
  if (!result.structured_output) throw new Error('jugement sans sortie structurée')
  return result.structured_output
}

function runClaude(args, stdin) {
  const r = spawnSync('claude', args, { input: stdin, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`claude a échoué (${r.status}) : ${r.stderr || r.stdout}`)
  return r.stdout
}

/** Étape 2 : un appel à Claude par session préparée. */
export async function main(env = process.env, run = runClaude) {
  const p = paths(env.WORK_DIR)
  const systemPrompt = await readFile(join(ROOT, 'agents/monkey-testing.md'), 'utf8')
  const schema = await readJson(join(ROOT, 'agents/monkey-testing.schema.json'))
  const args = claudeArgs({ systemPrompt, schema, model: env.CLAUDE_MODEL || 'sonnet' })

  let names = []
  try {
    names = (await readdir(p.inputs)).filter((n) => n.endsWith('.json')).sort()
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  let written = 0
  for (const name of names) {
    const id = name.replace(/\.json$/, '')
    const { input } = await readJson(join(p.inputs, name))
    try {
      const verdict = readVerdict(run(args, `Session à juger :\n${JSON.stringify(input)}`))
      await writeJson(join(p.verdicts, name), verdict)
      written++
    } catch (e) {
      await addFailure(env.WORK_DIR, `${id} : ${e.message}`)
    }
  }
  console.log(`${written} verdict(s) sur ${names.length} session(s).`)
  return written
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1) })
}
