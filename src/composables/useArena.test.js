import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useArena } from './useArena.js'

const exemplaire = (key, over = {}) => ({ key, species: 6, shiny: false, ...over })

const fauxClient = (over = {}) => ({
  readArena: vi.fn(async () => ({ credits: 3, pokedollars: 250, exemplars: [] })),
  readOpenChallenges: vi.fn(async () => []),
  readMyOpen: vi.fn(async () => null),
  readShop: vi.fn(async () => []),
  readLeaderboard: vi.fn(async () => []),
  readSeasons: vi.fn(async () => []),
  buy: vi.fn(async () => 1),
  readDuel: vi.fn(async (id) => ({ id, status: 'resolved' })),
  engage: vi.fn(async () => 11),
  accept: vi.fn(async () => 22),
  ...over,
})

describe('useArena', () => {
  it('charge crédits, portefeuille et défis en une fois', async () => {
    const client = fauxClient({
      readOpenChallenges: async () => [{ id: 1, pseudo: 'bob' }],
    })
    const a = useArena(client, ref([]))
    await a.load()

    expect(a.credits.value).toBe(3)
    expect(a.pokedollars.value).toBe(250)
    expect(a.challenges.value).toHaveLength(1)
  })

  it('retient l’erreur au lieu de la laisser remonter', async () => {
    const a = useArena(fauxClient({ readArena: async () => { throw new Error('coupé') } }), ref([]))
    await a.load()

    expect(a.error.value.message).toBe('coupé')
    expect(a.loading.value).toBe(false)
  })

  it('rend le niveau d’un exemplaire, et un pour les inconnus', async () => {
    const client = fauxClient({
      readArena: async () => ({
        credits: 1, pokedollars: 0,
        exemplars: [{ entry_key: 'github:a', level: 7, wins: 4, destroyed_at: null }],
      }),
    })
    const a = useArena(client, ref([]))
    await a.load()

    expect(a.levelOf('github:a')).toBe(7)
    expect(a.levelOf('github:jamais-vu')).toBe(1)
  })

  // Un exemplaire détruit reste dans la collection — l'espèce est acquise pour toujours — mais
  // il n'a plus rien à engager.
  it('exclut un exemplaire détruit de ce qu’on peut engager', async () => {
    const client = fauxClient({
      readArena: async () => ({
        credits: 1, pokedollars: 0,
        exemplars: [{ entry_key: 'github:mort', level: 3, wins: 1, destroyed_at: '2026-08-11' }],
      }),
    })
    const claimed = ref([exemplaire('github:mort'), exemplaire('github:vivant')])
    const a = useArena(client, claimed)
    await a.load()

    expect(a.engageable.value.map((e) => e.key)).toEqual(['github:vivant'])
  })

  // Immobilisé, pas perdu : il reste dans la collection, mais on ne peut pas le miser deux fois.
  it('exclut l’exemplaire déjà posé sur la table', async () => {
    const claimed = ref([exemplaire('github:engage'), exemplaire('github:libre')])
    const client = fauxClient({ readMyOpen: async () => ({ id: 5, challenger_key: 'github:engage' }) })
    const a = useArena(client, claimed)
    await a.load()

    expect(a.engageable.value.map((e) => e.key)).toEqual(['github:libre'])
  })

  // L'espèce n'est écrite dans un duel qu'à la résolution : pour un défi encore ouvert, on la
  // retrouve dans sa propre collection — la seule qu'on ait le droit de lire.
  it('retrouve l’espèce de son défi en attente dans sa collection', async () => {
    const claimed = ref([exemplaire('github:engage', { species: 25 })])
    const client = fauxClient({ readMyOpen: async () => ({ id: 5, challenger_key: 'github:engage' }) })
    const a = useArena(client, claimed)
    await a.load()

    expect(a.myOpen.value.species).toBe(25)
  })

  /**
   * Le serveur décide du vainqueur, des niveaux et des gains. Réappliquer sa décision en
   * mémoire donnerait deux sources de vérité pour un seul fait, et on découvrirait un jour
   * qu'elles divergent — sur un duel perdu, c'est-à-dire au pire moment.
   */
  it('relit le duel et l’état après un engagement, sans rien recalculer', async () => {
    const client = fauxClient()
    const a = useArena(client, ref([]))
    await a.load()
    client.readArena.mockClear()

    const duel = await a.engage('github:a')

    expect(client.engage).toHaveBeenCalledWith('github:a', false)
    expect(client.readDuel).toHaveBeenCalledWith(11)
    expect(client.readArena).toHaveBeenCalledTimes(1)
    expect(duel.id).toBe(11)
  })

  it('transmet le choix d’affronter l’ordinateur', async () => {
    const client = fauxClient()
    const a = useArena(client, ref([]))
    await a.engage('github:a', true)

    expect(client.engage).toHaveBeenCalledWith('github:a', true)
  })

  it('relit de même après avoir relevé un défi', async () => {
    const client = fauxClient()
    const a = useArena(client, ref([]))
    const duel = await a.accept(5, 'github:b')

    expect(client.accept).toHaveBeenCalledWith(5, 'github:b')
    expect(duel.id).toBe(22)
  })

  /**
   * Le pli n'arrive pas tout de suite : la base enregistre qu'il est dû et l'Action lui donne un
   * visage au passage suivant. Le portefeuille, lui, est débité sur-le-champ — sans relecture,
   * l'écran laisserait racheter ce qu'on ne peut plus payer.
   */
  it('relit l’état après un achat', async () => {
    const client = fauxClient()
    const a = useArena(client, ref([]))
    await a.load()
    client.readArena.mockClear()

    await a.buy('gen1-r')

    expect(client.buy).toHaveBeenCalledWith('gen1-r')
    expect(client.readArena).toHaveBeenCalledTimes(1)
  })

  it('expose le catalogue tel que la base le donne', async () => {
    const articles = [{ slug: 'gen1-c', gen: 1, tier: 'c', fresh: false, price: 250 }]
    const a = useArena(fauxClient({ readShop: async () => articles }), ref([]))
    await a.load()

    expect(a.shop.value).toEqual(articles)
  })
})

/**
 * Les exemplaires qu'une évolution a consommés. Le trou était l'exact miroir de celui de la
 * collection : la ligne `catches` d'un exemplaire évolué subsiste, donc le serveur l'accepte
 * encore. On pouvait faire évoluer son Pikachu puis engager le Pikachu disparu — un duel sans
 * rien à perdre. Le serveur ne peut pas s'en défendre seul : les évolutions vivent dans l'état
 * du joueur, qu'il n'inspecte pas.
 */
describe('exemplaires consommés par une évolution', () => {
  const claimed = ref([
    { key: 'github:a', species: 25 },
    { key: 'github:b', species: 25 },
  ])

  it('les retire de ce qu’on peut engager', async () => {
    const arene = useArena(fauxClient(), claimed, ref(new Set(['github:a'])))
    await arene.load()
    expect(arene.engageable.value.map((e) => e.key)).toEqual(['github:b'])
  })

  it('laisse passer les autres', async () => {
    const arene = useArena(fauxClient(), claimed, ref(new Set()))
    await arene.load()
    expect(arene.engageable.value).toHaveLength(2)
  })
})
