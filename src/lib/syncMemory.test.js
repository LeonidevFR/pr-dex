import { describe, it, expect } from 'vitest'
import { rememberSync, pendingSync, forgetSync, SYNC_WINDOW_MS } from './syncMemory.js'

const memory = () => {
  const data = {}
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v) }, removeItem: (k) => { delete data[k] } }
}

describe('syncMemory', () => {
  const now = Date.parse('2026-10-16T09:00:00Z')

  it('retrouve une recherche lancée il y a moins de 3 minutes', () => {
    const storage = memory()
    rememberSync('2026-10-16T08:58:30.000Z', storage)
    expect(pendingSync(now, storage)).toBe('2026-10-16T08:58:30.000Z')
  })

  it('oublie une recherche trop ancienne', () => {
    const storage = memory()
    rememberSync(new Date(now - SYNC_WINDOW_MS - 1000).toISOString(), storage)
    expect(pendingSync(now, storage)).toBeNull()
  })

  it('ne retrouve plus rien une fois la recherche terminée', () => {
    const storage = memory()
    rememberSync('2026-10-16T08:59:00.000Z', storage)
    forgetSync(storage)
    expect(pendingSync(now, storage)).toBeNull()
  })

  it('fonctionne pour la session si le stockage jette', () => {
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(() => rememberSync('2026-10-16T08:59:00.000Z', broken)).not.toThrow()
    expect(pendingSync(now, broken)).toBeNull()
  })
})
