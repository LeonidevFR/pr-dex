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
    readEvolutions: vi.fn().mockResolvedValue([]),
    // Refus par défaut : le serveur valide tout, et un client de test qui accepterait tout
    // laisserait croire que la validation a disparu.
    evolve: vi.fn().mockRejectedValue(new Error('dex : bonbons insuffisants (8 requis)')),
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

/**
 * L'évolution appartient au serveur. Elle s'écrivait ici, dans un blob d'état que le serveur
 * n'inspectait pas : il ne pouvait donc rien valider, et acceptait notamment d'engager à l'arène
 * un exemplaire déjà consommé. Ce composable ne fait plus que demander et relire.
 */
describe('évolution', () => {
  const clientEvolutif = (over = {}) => {
    const evolutions = []
    return {
      ...fakeClient({ catches: [catchOf('a', 1), catchOf('b', 1), catchOf('c', 1)],
        state: { claimed: [K('a'), K('b'), K('c')], spent: {}, evolutions: [] } }),
      readEvolutions: vi.fn(async () => [...evolutions]),
      evolve: vi.fn(async (fromKey, to, day) => {
        const id = evolutions.length + 1
        evolutions.push({ id, from_species: 1, to_species: to, from_key: fromKey, day })
        return id
      }),
      ...over,
    }
  }

  const chargee = async (client) => {
    const c = useCollection()
    await c.load(client)
    return c
  }

  it('demande l’évolution au serveur, avec l’exemplaire choisi', async () => {
    const client = clientEvolutif()
    const c = await chargee(client)
    await c.evolve(1, 2, K('b'), '2026-08-14')
    expect(client.evolve).toHaveBeenCalledWith(K('b'), 2, '2026-08-14')
  })

  // Relire plutôt que déduire : le serveur vient d'écrire, et lui seul connaît l'identifiant
  // qui devient la clé du Pokémon obtenu.
  it('relit ce que le serveur a écrit', async () => {
    const client = clientEvolutif()
    const c = await chargee(client)
    await c.evolve(1, 2, K('a'), '2026-08-14')
    expect(c.evolutions.value).toHaveLength(1)
    expect(c.dex.bySpecies.value[2]).toHaveLength(1)
    expect(c.dex.bySpecies.value[2][0].key).toBe('evo:1')
  })

  it('n’envoie rien pour une cible hors de la lignée', async () => {
    const client = clientEvolutif()
    const c = await chargee(client)
    expect(await c.evolve(1, 25, K('a'), '2026-08-14')).toBe(false)
    expect(client.evolve).not.toHaveBeenCalled()
  })

  /**
   * Un refus du serveur n'est pas une panne : bonbons manquants ou exemplaire déjà consommé se
   * lisent comme « rien à faire ». Les signaler comme une erreur ferait clignoter un message
   * d'échec là où la règle s'applique normalement.
   */
  it('traite un refus comme un non-événement, pas comme une panne', async () => {
    const client = clientEvolutif({
      evolve: vi.fn(async () => { throw new Error('dex : bonbons insuffisants (8 requis)') }),
    })
    const c = await chargee(client)
    expect(await c.evolve(1, 2, K('a'), '2026-08-14')).toBe(false)
    expect(c.error.value).toBeNull()
  })

  it('signale en revanche une vraie panne', async () => {
    const client = clientEvolutif({
      evolve: vi.fn(async () => { throw new SupabaseDataError('server', 'boum') }),
    })
    const c = await chargee(client)
    expect(await c.evolve(1, 2, K('a'), '2026-08-14')).toBe(false)
    expect(c.error.value).toBe('server')
  })

  // L'exemplaire consommé quitte le stock, mais l'espèce reste acquise : le dex garde ce qui a
  // été vu, même si le dernier exemplaire a servi à évoluer.
  it('retire l’exemplaire consommé du stock sans retirer l’espèce', async () => {
    const client = clientEvolutif()
    const c = await chargee(client)
    await c.evolve(1, 2, K('a'), '2026-08-14')
    expect(c.dex.availableEntries(1).map((e) => e.key)).toEqual([K('b'), K('c')])
    expect(c.dex.bySpecies.value[1]).toHaveLength(3)
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
    await c.evolve(1, 2, K('a'), '2026-07-20')
    expect(c.error.value).toBeNull()
  })
})

/**
 * La mémoire des duels vus. Un défi que personne ne relève est résolu par la maison au bout de
 * vingt-quatre heures : on peut perdre un Pokémon pendant la nuit, et la cérémonie se rejoue au
 * retour pour l'apprendre. Sans mémoire, elle se rejouerait à CHAQUE retour — la première fois
 * on apprend quelque chose, la dixième on ferme l'application.
 */
describe('duels déjà vus', () => {
  const chargee = async (state = { claimed: [], spent: {}, evolutions: [], seenDuels: [] }) => {
    const c = useCollection()
    await c.load(fakeClient({ state }))
    return c
  }

  it('retient un duel montré', async () => {
    const c = await chargee()
    await c.markDuelSeen(42)
    expect(c.state.value.seenDuels).toContain(42)
  })

  it('ne le retient qu’une fois', async () => {
    const c = await chargee()
    await c.markDuelSeen(42)
    await c.markDuelSeen(42)
    expect(c.state.value.seenDuels.filter((x) => x === 42)).toHaveLength(1)
  })

  // Les états écrits avant l'existence de ce champ n'ont pas la clé : on la recrée plutôt que
  // de planter sur un ancien blob.
  it('survit à un état d’avant sa propre existence', async () => {
    const c = await chargee({ claimed: [], spent: {}, evolutions: [] })
    await c.markDuelSeen(7)
    expect(c.state.value.seenDuels).toEqual([7])
  })
})
