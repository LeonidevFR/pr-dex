import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCollection } from './useCollection.js'
import { SupabaseDataError } from '../lib/supabaseData.js'
import { entryKey } from '../../shared/entry.js'

/** Clé d'exemplaire telle que `useDex` la dérive — ce que `claim` et `fromKey` référencent. */
const K = (id) => entryKey('github', id)

const catchOf = (id, species, extra = {}) => ({
  source: 'github', external_id: id, species, shiny: false,
  label: 't', ref: 'moi/atlas#1', url: 'https://github.com/moi/atlas/pull/1',
  date: '2026-02-03', ...extra,
})

const keysOf = (catches) => catches.map((c) => entryKey(c.source, c.external_id))

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
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('relit tout de suite : pas d’attente si du nouveau apparaît dès la première lecture', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    client.readCatches.mockResolvedValue([catchOf('a', 25), catchOf('b', 1)])
    await c.refresh()
    expect(c.catches.value).toHaveLength(2)
    expect(client.readCatches).toHaveBeenCalledTimes(2)
  })

  it('repasse lire à intervalles tant que rien de nouveau n’apparaît, jusqu’à trouver une capture fraîche', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    // Les deux premières relectures ne montrent rien de neuf, la troisième si.
    client.readCatches
      .mockResolvedValueOnce([catchOf('a', 25)])
      .mockResolvedValueOnce([catchOf('a', 25)])
      .mockResolvedValueOnce([catchOf('a', 25), catchOf('b', 1)])

    const p = c.refresh()
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    await p

    expect(c.catches.value).toHaveLength(2)
    expect(client.readCatches).toHaveBeenCalledTimes(4) // 1 au chargement + 3 au refresh
  })

  it('abandonne après ~30s si rien de nouveau n’est jamais apparu', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)

    const p = c.refresh()
    await vi.advanceTimersByTimeAsync(30000)
    await p

    expect(c.catches.value).toHaveLength(1)
    expect(c.error.value).toBeNull()
    expect(client.readCatches).toHaveBeenCalledTimes(7) // 1 au chargement + 6 tentatives de refresh
  })

  it('reste en chargement pendant tout le sondage', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    const p = c.refresh()
    expect(c.loading.value).toBe(true)
    await vi.advanceTimersByTimeAsync(30000)
    await p
    expect(c.loading.value).toBe(false)
  })

  it('déclenche l’Action de capture avant de relire', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    client.readCatches.mockResolvedValue([catchOf('a', 25), catchOf('b', 1)])
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
  it('ajoute la clé d’exemplaire aux réclamés et persiste', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    await c.claim(K('a'))
    expect(c.state.value.claimed).toContain(K('a'))
    expect(client.writeState).toHaveBeenCalledOnce()
    expect(client.writeState.mock.calls[0][0].claimed).toEqual([K('a')])
  })

  it('transmet le blob sha courant et mémorise le nouveau', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25), catchOf('b', 1)] })
    const c = useCollection()
    await c.load(client)
    await c.claim(K('a'))
    expect(client.writeState.mock.calls[0][1]).toBe('blob1')
    await c.claim(K('b'))
    expect(client.writeState.mock.calls[1][1]).toBe('blob2')
  })

  it('ne réclame pas deux fois la même clé', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    const c = useCollection()
    await c.load(client)
    await c.claim(K('a'))
    await c.claim(K('a'))
    expect(c.state.value.claimed).toEqual([K('a')])
    expect(client.writeState).toHaveBeenCalledOnce()
  })

  it('ne confond pas deux captures qui portent le même identifiant dans deux sources', async () => {
    const catches = [catchOf('42', 25), catchOf('42', 1, { source: 'crm' })]
    const client = fakeClient({ catches })
    const c = useCollection()
    await c.load(client)
    await c.claim(K('42'))
    expect(c.dex.pending.value).toHaveLength(1)
    expect(c.dex.pending.value[0].source).toBe('crm')
  })

  it('rejoue silencieusement sur conflit, sans exposer d’erreur', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25), catchOf('b', 1)] })
    client.writeState
      .mockRejectedValueOnce(new SupabaseDataError('conflict', 'stale', 409))
      .mockResolvedValueOnce({ blobSha: 'blob9' })
    client.readState
      .mockResolvedValueOnce({ state: { claimed: [], spent: {}, evolutions: [] }, blobSha: 'blob1' })
      .mockResolvedValueOnce({ state: { claimed: [K('b')], spent: {}, evolutions: [] }, blobSha: 'blob8' })

    const c = useCollection()
    await c.load(client)
    await c.claim(K('a'))

    expect(c.error.value).toBeNull()
    expect(client.writeState).toHaveBeenCalledTimes(2)
    // l'opération est rejouée sur l'état frais : le claim de l'autre appareil survit
    expect(c.state.value.claimed).toEqual([K('b'), K('a')])
  })

  it('abandonne après un seul rejeu', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    client.writeState.mockRejectedValue(new SupabaseDataError('conflict', 'stale', 409))
    const c = useCollection()
    await c.load(client)
    await c.claim(K('a'))
    expect(client.writeState).toHaveBeenCalledTimes(2)
    expect(c.error.value).toBe('conflict')
  })

  it('signale une écriture hors ligne et restaure l’état', async () => {
    const client = fakeClient({ catches: [catchOf('a', 25)] })
    client.writeState.mockRejectedValue(new SupabaseDataError('offline', 'pas de réseau'))
    const c = useCollection()
    await c.load(client)
    await c.claim(K('a'))
    expect(c.error.value).toBe('offline')
    expect(c.state.value.claimed).toEqual([])
  })
})

describe('évolution', () => {
  const threeBulbizarre = Array.from({ length: 3 }, (_, i) => catchOf('s' + i, 1))
  const claimedThree = { claimed: keysOf(threeBulbizarre), spent: {}, evolutions: [] }

  it('dépense les bonbons et enregistre l’évolution avec la clé de sa source', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.state.value.spent[1]).toBe(8)
    expect(c.state.value.evolutions).toEqual([
      { species: 2, from: 1, fromKey: K('s0'), date: '2026-07-20' },
    ])
    expect(client.writeState).toHaveBeenCalledOnce()
  })

  it('privilégie une capture chromatique comme source', async () => {
    const catches = [catchOf('s0', 1), catchOf('s1', 1, { shiny: true }), catchOf('s2', 1)]
    const client = fakeClient({ catches, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.state.value.evolutions[0].fromKey).toBe(K('s1'))
  })

  it('consomme l’exemplaire évolué : plus disponible pour une évolution suivante, mais l’espèce reste acquise', async () => {
    const client = fakeClient({ catches: threeBulbizarre, state: claimedThree })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.dex.copyCount(1)).toBe(2)
    expect(c.dex.bySpecies.value[1]).toHaveLength(3) // toujours dans le journal / la grille
  })

  it('compte les bonbons de toutes les sources confondues', async () => {
    // Deux captures GitHub et une capture d'une autre source dans la même famille : le coût
    // est atteint et l'évolution passe. Le jeu ne trie pas ses bonbons par pôle.
    const catches = [catchOf('s0', 1), catchOf('s1', 2), catchOf('x', 3, { source: 'crm' })]
    const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(1, 2, '2026-07-20')
    expect(c.state.value.spent[1]).toBe(8)
  })

  it('refuse d’évoluer sans exemplaire disponible, même avec assez de bonbons', async () => {
    // Une seule capture, mais suffisamment de doublons dans le reste de la famille pour
    // financer le coût — les bonbons ne sont pas liés à un exemplaire précis.
    const catches = [
      catchOf('only', 1),
      ...Array.from({ length: 5 }, (_, i) => catchOf('extra' + i, 2)),
    ]
    const client = fakeClient({
      catches,
      state: {
        claimed: keysOf(catches),
        spent: {},
        evolutions: [{ species: 2, from: 1, fromKey: K('only'), date: '2026-07-01' }],
      },
    })
    const c = useCollection()
    await c.load(client)
    expect(c.dex.copyCount(1)).toBe(0)
    await c.evolve(1, 2, '2026-07-20')
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('refuse l’évolution sans bonbons suffisants et n’écrit rien', async () => {
    const client = fakeClient({ catches: [catchOf('a', 1)], state: { claimed: [K('a')], spent: {}, evolutions: [] } })
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
    const catches = Array.from({ length: 3 }, (_, i) => catchOf('r' + i, 143))
    const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(143, 999, '2026-07-20')
    expect(client.writeState).not.toHaveBeenCalled()
  })

  it('accepte chacune des trois évolutions d’Évoli', async () => {
    for (const target of [134, 135, 136]) {
      const catches = Array.from({ length: 3 }, (_, i) => catchOf('e' + i, 133))
      const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
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
          claimed: keysOf(threeBulbizarre),
          spent: { 1: 8 },
          evolutions: [{ species: 2, from: 1, fromKey: K('s1'), date: '2026-07-19' }],
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
    const client = fakeClient({ catches, state: { claimed: keysOf(catches), spent: {}, evolutions: [] } })
    const c = useCollection()
    await c.load(client)
    await c.evolve(129, 130, '2026-07-20')
    expect(c.state.value.spent[129]).toBe(40)
  })
})

describe('erreur périmée', () => {
  it('une action qui n’écrit rien efface l’erreur d’une action précédente', async () => {
    const client = fakeClient({ catches: [catchOf('a', 1)], state: { claimed: [K('a')], spent: {}, evolutions: [] } })
    client.writeState.mockRejectedValue(new SupabaseDataError('offline', 'pas de réseau'))
    const c = useCollection()
    await c.load(client)
    await c.claim(K('z'))
    expect(c.error.value).toBe('offline')

    // Cette évolution est un no-op silencieux (bonbons insuffisants) : elle ne doit pas
    // laisser l'erreur du claim précédent traîner sous les yeux de l'utilisateur.
    await c.evolve(1, 2, '2026-07-20')
    expect(c.error.value).toBeNull()
  })
})
