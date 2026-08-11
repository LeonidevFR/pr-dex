import { describe, it, expect } from 'vitest'
import { withDb, dbAvailable, LOCAL_DB_URL } from './db-test-helper.mjs'

const disponible = await dbAvailable()

describe.skipIf(!disponible)('connexion à la base locale', () => {
  it('vise bien la pile locale et jamais autre chose', () => {
    expect(LOCAL_DB_URL).toContain('127.0.0.1:54322')
  })

  it('exécute une requête et rend son résultat', async () => {
    const rows = await withDb((c) => c.query('select 1 as un').then((r) => r.rows))
    expect(rows).toEqual([{ un: 1 }])
  })

  it('ferme la connexion même quand la requête échoue', async () => {
    await expect(withDb((c) => c.query('select from nulle_part'))).rejects.toThrow()
    const rows = await withDb((c) => c.query('select 2 as deux').then((r) => r.rows))
    expect(rows).toEqual([{ deux: 2 }])
  })
})

describe.skipIf(disponible)('pile locale éteinte', () => {
  it('le signale au lieu de faire échouer la suite', () => {
    expect(disponible).toBe(false)
  })
})
