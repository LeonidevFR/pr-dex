import pg from 'pg'

/**
 * L'URL de la pile locale, en dur et non configurable — c'est un garde-fou, pas une limite.
 * La base en service porte les collections réelles de l'équipe : aucun test ne doit pouvoir
 * la viser, fût-ce par une variable d'environnement mal placée.
 */
export const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function withDb(fn) {
  const client = new pg.Client({ connectionString: LOCAL_DB_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * Les tests de base sautent quand la pile est éteinte plutôt que d'échouer : `npm test` doit
 * rester vert sur une machine sans Docker, sinon personne ne le lance plus.
 */
export async function dbAvailable() {
  try {
    await withDb((c) => c.query('select 1'))
    return true
  } catch {
    return false
  }
}
