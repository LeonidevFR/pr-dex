import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA = fileURLToPath(new URL('../supabase/schema.sql', import.meta.url))

const HEADER = `-- Instantané du schéma public de PR-DEX, généré par \`npm run db:dump\`. NE PAS ÉDITER.
--
-- La source, ce sont les migrations de \`supabase/migrations/\`, appliquées dans l'ordre : c'est
-- ainsi que \`supabase db reset\` fabrique la base locale et que la production se met à jour.
-- Ce fichier sert à lire le schéma d'un coup d'œil et à voir son évolution en review.
-- \`npm run db:check\` vérifie qu'il est à jour.
--
-- Il ne suffit pas à fabriquer une base neuve : les triggers posés sur \`auth.users\` et
-- \`auth.identities\`, les extensions et les tâches \`pg_cron\` n'appartiennent pas au schéma
-- public et n'y figurent pas.

`

/** Le schéma public de la base locale, en-tête compris, tel que `db:dump` l'écrit. */
export function dumpSchema() {
  const dir = mkdtempSync(join(tmpdir(), 'pr-dex-schema-'))
  const out = join(dir, 'schema.sql')
  try {
    execFileSync('npx', ['supabase', 'db', 'dump', '--local', '--schema', 'public', '-f', out], { stdio: 'pipe' })
    return HEADER + readFileSync(out, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(SCHEMA, dumpSchema())
  console.log('supabase/schema.sql régénéré depuis la base locale.')
}
