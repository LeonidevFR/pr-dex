import { readFileSync } from 'node:fs'
import { SCHEMA, dumpSchema } from './schema-dump.mjs'

/**
 * `supabase/schema.sql` est un instantané généré depuis la base locale, elle-même construite
 * par les migrations. S'il diffère du schéma qu'elles produisent, c'est qu'une migration a été
 * ajoutée ou modifiée sans régénérer l'instantané : `npm run db:reset` puis `npm run db:dump`.
 */
if (readFileSync(SCHEMA, 'utf8') !== dumpSchema()) {
  console.error(
    'supabase/schema.sql ne correspond plus au schéma produit par les migrations.\n' +
    'Lancer `npm run db:reset` puis `npm run db:dump`, et commiter le résultat.',
  )
  process.exit(1)
}
console.log('schema.sql à jour avec les migrations.')
