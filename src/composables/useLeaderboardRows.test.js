import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useLeaderboardRows } from './useLeaderboardRows.js'
import { SupabaseDataError } from '../lib/supabaseData.js'

const host = (client) => {
  let api
  mount(defineComponent({ setup() { api = useLeaderboardRows(client); return () => h('div') } }))
  return () => api
}

describe('useLeaderboardRows', () => {
  it('est en chargement dès le premier rendu, puis porte les lignes', async () => {
    const api = host({ readLeaderboard: vi.fn().mockResolvedValue([{ login: 'a' }]) })
    expect(api().loading.value).toBe(true)
    await flushPromises()
    expect(api().loading.value).toBe(false)
    expect(api().rows.value).toEqual([{ login: 'a' }])
  })

  it('garde le message d’erreur et repart de zéro au réessai', async () => {
    const read = vi.fn()
      .mockRejectedValueOnce(new SupabaseDataError('offline', 'Pas de connexion réseau.'))
      .mockResolvedValueOnce([])
    const api = host({ readLeaderboard: read })
    await flushPromises()
    expect(api().error.value).toBe('Pas de connexion réseau.')
    await api().load()
    expect(api().error.value).toBeNull()
    expect(api().rows.value).toEqual([])
  })
})
