import { describe, it, expect } from 'vitest'
import { useTheme } from './useTheme.js'

const fakeMedia = (matches) => {
  const listeners = []
  return { matches, addEventListener: (_, fn) => listeners.push(fn), fire: (m) => listeners.forEach((fn) => fn({ matches: m })) }
}
const fakeStorage = (init = {}) => {
  const data = { ...init }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v }, data }
}

describe('useTheme', () => {
  it('suit le système sans choix enregistré', () => {
    const root = { dataset: {} }
    const { theme } = useTheme({ storage: fakeStorage(), media: fakeMedia(true), root })
    expect(theme.value).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('suit un changement du système tant qu’aucun choix n’est enregistré', () => {
    const media = fakeMedia(false)
    const root = { dataset: {} }
    const { theme } = useTheme({ storage: fakeStorage(), media, root })
    media.fire(true)
    expect(theme.value).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('bascule et enregistre le choix', () => {
    const storage = fakeStorage()
    const root = { dataset: {} }
    const { theme, toggle } = useTheme({ storage, media: fakeMedia(false), root })
    toggle()
    expect(theme.value).toBe('light')
    expect(storage.data['prdex.theme']).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('préfère le choix enregistré au système, et ne suit plus le système ensuite', () => {
    const media = fakeMedia(true)
    const { theme } = useTheme({ storage: fakeStorage({ 'prdex.theme': 'dark' }), media, root: { dataset: {} } })
    expect(theme.value).toBe('dark')
    media.fire(true)
    expect(theme.value).toBe('dark')
  })

  it('marche sans stockage disponible', () => {
    const storage = { getItem: () => { throw new Error('bloqué') }, setItem: () => { throw new Error('bloqué') } }
    const { theme, toggle } = useTheme({ storage, media: fakeMedia(false), root: { dataset: {} } })
    expect(theme.value).toBe('dark')
    toggle()
    expect(theme.value).toBe('light')
  })

  it('retombe sur le sombre sans matchMedia', () => {
    expect(useTheme({ storage: fakeStorage(), media: undefined, root: { dataset: {} } }).theme.value).toBe('dark')
  })
})
