import { describe, it, expect, vi } from 'vitest'
import { useCollection } from './useCollection.js'
import { SupabaseDataError } from '../lib/supabaseData.js'

const catchOf = (sha, species, extra = {}) => ({
  sha, species, shiny: false, repo: 'moi/atlas', pr: 1, title: 't', date: '2026-02-03', ...extra,
})

function fakeClient({ catches = [], state = { claimed: [], spent: {}, evolutions: [] }, blobSha = 'blob1' } = {}) {
  return {
    checkAccess: vi.fn().mockResolvedValue(true),
    readCatches: vi.fn().mockResolvedValue(catches),
    readState: vi.fn().mockResolvedValue({ state, blobSha }),
    writeState: vi.fn().mockResolvedValue({ blobSha: 'blob2' }),
    triggerCatch: vi.fn().mockResolvedValue(undefined),
  }
}

describe('chargement', () => {
  it('récupère les captures et l’état', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    expect(c.dex.pending.value).toHaveLength(1)
    expect(c.error.value).toBeNull()
  })

  it('expose un jeton révoqué sans planter', async () => {
    const client = fakeClient()
    client.readCatches.mockRejectedValue(new SupabaseDataError('revoked', 'nope', 401))
    const c = useCollection()
    await c.load(client)
    expect(c.error.value).toBe('revoked')
  })

  it('bascule loading pendant le chargement puis le remet à false', async () => {
    const client = fakeClient()
    const c = useCollection()
    const p = c.load(client)
    expect(c.loading.value).toBe(true)
    await p
    expect(c.loading.value).toBe(false)
  })
})

describe('refresh', () => {
  it('relit sur le client déjà connu, sans qu’on ait à le repasser', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    client.readCatches.mockResolvedValue([catchOf('a', 25), catchOf('b', 1)])
    await c.refresh()
    expect(c.catches.value).toHaveLength(2)
    expect(client.readCatches).toHaveBeenCalledTimes(2)
  })

  it('bascule loading pendant le refresh', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    const p = c.refresh()
    expect(c.loading.value).toBe(true)
    await p
    expect(c.loading.value).toBe(false)
  })

  it('déclenche l’Action de capture avant de relire', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    await c.refresh()
    expect(client.triggerCatch).toHaveBeenCalledOnce()
  })

  it('ne déclenche pas l’Action au chargement initial, seulement au refresh', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    expect(client.triggerCatch).not.toHaveBeenCalled()
  })

  it('signale l’échec du déclenchement sans planter ni vider la collection déjà chargée', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    client.triggerCatch.mockRejectedValue(new SupabaseDataError('server', 'github dispatch failed'))
    await c.refresh()
    expect(c.error.value).toBe('server')
    expect(c.catches.value).toHaveLength(1)
  })
})

describe('claim', () => {
  it('ajoute le sha aux réclamés et persiste', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    await c.claim('a')
    expect(c.state.value.claimed).toContain('a')
    expect(client.writeState).toHaveBeenCalledOnce()
    expect(client.writeState.mock.calls[0][0].claimed).toEqual(['a'])
  })

  it('transmet le blob sha courant et mémorise le nouveau', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25), catchOf('b', 1)] })
    const c = useCollection()
    await c.load(client)
    await c.claim('a')
    expect(client.writeState.mock.calls[0][1]).toBe('blob1')
    await c.claim('b')
    expect(client.writeState.mock.calls[1][1]).toBe('blob2')
  })

  it('ne réclame pas deux fois le même sha', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    await c.claim('a')
    await c.claim('a')
    expect(c.state.value.claimed).toEqual(['a'])
    expect(client.writeState).toHaveBeenCalledOnce()
  })

  it('rejoue silencieusement sur conflit, sans exposer d’erreur', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25), catchOf('b', 1)] })
    client.writeState
      .mockRejectedValueOnce(new SupabaseDataError('conflict', 'stale', 409))
      .mockResolvedValueOnce({ blobSha: 'blob9' })
    client.readState
      .mockResolvedValueOnce({ state: { claimed: [], spent: {}, evolutions: [] }, blobSha: 'blob1' })
      .mockResolvedValueOnce({ state: { claimed: ['b'], spent: {}, evolutions: [] }, blobSha: 'blob8' })

    const c = useCollection()
    await c.load(client)
    await c.claim('a')

    expect(c.error.value).toBeNull()
    expect(client.writeState).toHaveBeenCalledTimes(2)
    // l'opération est rejouée sur l'état frais : le claim de l'autre appareil survit
    expect(c.state.value.claimed).toEqual(['b', 'a'])
  })

  it('abandonne après un seul rejeu', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    client.writeState.mockRejectedValue(new SupabaseDataError('conflict', 'stale', 409))
    const c = useCollection()
    await c.load(client)
    await c.claim('a')
    expect(client.writeState).toHaveBeenCalledTimes(2)
    expect(c.error.value).toBe('conflict')
  })

  it('signale une écriture hors ligne et restaure l’état', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    client.writeState.mockRejectedValue(new SupabaseDataError('offline', 'pas de réseau'))
    const c = useCollection()
    await c.load(client)
    await c.claim('a')
    expect(c.error.value).toBe('offline')
    expect(c.state.value.claimed).toEqual([])
  })
})

describe('évolution', () => {
  const threeBulbizarre = Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1))
  const claimedThree = { claimed: ['s0', 's1', 's2'], spent: {}, evolutions: [] }

  it('dépense les bonbons et enregistre l’évolution avec son sha source', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.state.value.spent[1]).toBe(8)
    expect(c.state.value.evolutions).toEqual([
      { species: 2, from: 1, fromSha: 's0', date: '2026-07-20' },
    ])
    expect(client.writeState).toHaveBeenCalledOnce()
  })

  it('privilégie une capture chromatique comme source', async () => {
    const catches = [catchOf('s0', 1), catchOf('s1', 1, { shiny: true }), catchOf('s2', 1)]
    const client = fakeClient({ catches, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.state.value.evolutions[0].fromSha).toBe('s1')
  })

  it('refuse l’évolution sans bonbons suffisants et n’écrit rien', async () => {
    const client = fakeClient({ catches: [catchOf('a', 1)], state: { claimed: ['a'], spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.state.value.evolutions).toEqual([])
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('refuse une cible qui n’est pas une évolution de la source', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 130, '2026-07-20')
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('refuse d’évoluer une espèce terminale', async () => {
    const client = fakeClient({
      catches: Array.from({ length: 3 }, (_, i) => catchOf('r' + i, 143)),
      state: { claimed: ['r0', 'r1', 'r2'], spent: {}, evolutions: [] },
    })
    const c = useCollection()
    await c.load(client)
    await c.evolve(143, 999, '2026-07-20')
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('accepte chacune des trois évolutions d’Évoli', async () => {
    for (const target of [134, 135, 136]) {
      const client = fakeClient({
        catches: Array.from({ length: 3 }, (_, i) => catchOf('e' + i, 133)),
        state: { claimed: ['e0', 'e1', 'e2'], spent: {}, evolutions: [] },
      })
      const c = useCollection()
      await c.load(client)
      await c.evolve(133, target, '2026-07-20')
      expect(c.state.value.evolutions[0].species).toBe(target)
    }
  })

  it('restaure l’état si l’écriture échoue', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    client.writeState.mockRejectedValue(new SupabaseDataError('offline', 'pas de réseau'))
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.state.value.spent[1]).toBeUndefined()
    expect(c.state.value.evolutions).toEqual([])
    expect(c.error.value).toBe('offline')
  })

  it('abandonne le rejeu si l’autre appareil a déjà dépensé les mêmes bonbons', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    client.writeState.mockRejectedValueOnce(new SupabaseDataError('conflict', 'stale', 409))
    client.readState
      .mockResolvedValueOnce({ state: claimedThree, blobSha: 'blob1' })
      .mockResolvedValueOnce({
        state: {
          claimed: ['s0', 's1', 's2'],
          spent: { 1: 8 },
          evolutions: [{ species: 2, from: 1, fromSha: 's1', date: '2026-07-19' }],
        },
        blobSha: 'blob8',
      })

    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')

    expect(c.state.value.spent[1]).toBe(8)
    expect(c.state.value.evolutions).toHaveLength(1)
    expect(c.dex.candies(1)).toBeGreaterThanOrEqual(0)
    expect(c.error.value).toBeNull()
    expect(client.writeState).toHaveBeenCalledOnce()
  })

  it('rejoue et écrit quand l’état frais permet toujours l’évolution', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    client.writeState
      .mockRejectedValueOnce(new SupabaseDataError('conflict', 'stale', 409))
      .mockResolvedValueOnce({ blobSha: 'blob9' })
    client.readState
      .mockResolvedValueOnce({ state: claimedThree, blobSha: 'blob1' })
      .mockResolvedValueOnce({ state: claimedThree, blobSha: 'blob8' })

    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')

    expect(c.state.value.spent[1]).toBe(8)
    expect(c.state.value.evolutions).toHaveLength(1)
    expect(c.error.value).toBeNull()
    expect(client.writeState).toHaveBeenCalledTimes(2)
  })

  it('facture 40 bonbons à Magicarpe', async () => {
    const catches = Array.from({ length: 14 }, (_, i) => catchOf('m' + i, 129))
    const client = fakeClient({
      catches,
      state: { claimed: catches.map((c) => c.sha), spent: {}, evolutions: [] },
    })
    const c = useCollection()
    await c.load(client)
    await c.evolve(129, 130, '2026-07-20')
    expect(c.state.value.spent[129]).toBe(40)
  })
})

describe('erreur périmée', () => {
  it('une action qui n’écrit rien efface l’erreur d’une action précédente', async () => {
    const client = fakeClient({ catches: [catchOf('a', 1)], state: { claimed: ['a'], spent: {}, evolutions: [] } })
    client.writeState.mockRejectedValue(new SupabaseDataError('offline', 'pas de réseau'))
    const c = useCollection()
    await c.load(client)
    await c.claim('z')
    expect(c.error.value).toBe('offline')

    // Cette évolution est un no-op silencieux (bonbons insuffisants) : elle ne doit pas
    // laisser l'erreur du claim précédent traîner sous les yeux de l'utilisateur.
    await c.evolve(1, 2, '2026-07-20')
    expect(c.error.value).toBeNull()
  })
})
