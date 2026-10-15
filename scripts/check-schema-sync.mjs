import { readFile } from 'node:fs/promises'

/**
 * `supabase/schema.sql` est le fichier qu'on colle dans l'éditeur SQL du dashboard ; sa copie
 * sous `supabase/migrations/` est celle que la CLI rejoue pour fabriquer la base de test
 * locale. Les deux doivent dire la même chose, sans quoi les tests du lot 2 valideraient un
 * schéma que la production n'a pas.
 *
 * La copie porte un en-tête supplémentaire qui explique sa raison d'être : la comparaison
 * porte donc sur la fin du fichier, pas sur son début.
 */
const SCHEMA = new URL('../supabase/schema.sql', import.meta.url)
const COPIE = new URL('../supabase/migrations/20260720000000_schema_initial.sql', import.meta.url)

const [schema, copie] = await Promise.all([readFile(SCHEMA, 'utf8'), readFile(COPIE, 'utf8')])

if (!copie.endsWith(schema)) {
  console.error(
    'supabase/schema.sql et sa copie de migration ont divergé.\n' +
    'Recopier le schéma dans la migration en conservant son en-tête explicatif.',
  )
  process.exit(1)
}
console.log('schéma et migration synchronisés.')
