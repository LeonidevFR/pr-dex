import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sinceDate, toRows, planSources, main, CONNECTORS } from './catch.mjs'
import { drawFrom } from '../shared/draw.js'
import { entryKey } from '../shared/entry.js'

const searchPage = (items, more = false) => ({
  ok: true, status: 200,
  json: async () => ({ total_count: items.length, items }),
  headers: new Headers(more ? { link: '<https://x?page=2>; rel="next"' } : {}),
})
const prDetail = (sha, mergedAt) => ({
  ok: true, status: 200,
  json: async () => ({ merge_commit_sha: sha, merged_at: mergedAt }),
  headers: new Headers(),
})

const item = (repo, number, title) => ({
  number, title,
  repository_url: `https://api.github.com/repos/${repo}`,
  pull_request: { merged_at: '2026-02-03T10:00:00Z' },
})

const identity = (userId, extra = {}) =>
  ({ user_id: userId, source: 'github', handle: 'moi', config: { repos: ['moi/atlas'] }, ...extra })

describe('sinceDate', () => {
  it('recule de sept jours par rapport à la capture la plus récente', () => {
    expect(sinceDate([{ date: '2026-02-10' }, { date: '2026-03-01' }], '2026-01-01')).toBe('2026-02-22')
  })

  it('retombe sur la date de départ quand il n’y a aucune capture', () => {
    expect(sinceDate([], '2026-01-01')).toBe('2026-01-01')
  })

  it('franchit correctement un début de mois', () => {
    expect(sinceDate([{ date: '2026-03-03' }], '2026-01-01')).toBe('2026-02-24')
  })

  it('franchit correctement un début d’année', () => {
    expect(sinceDate([{ date: '2026-01-03' }], '2025-01-01')).toBe('2025-12-27')
  })
})

describe('toRows', () => {
  const event = { externalId: 'sha-a', label: 'fix: bug', ref: 'moi/atlas#1 · sha-a', url: 'https://x/1', date: '2026-02-03' }

  it('attribue l’espèce que le front dériverait de la même clé d’exemplaire', () => {
    const [row] = toRows('u1', 'github', [event])
    expect({ species: row.species, shiny: row.shiny }).toEqual(drawFrom(entryKey('github', 'sha-a')))
  })

  it('donne deux tirages différents au même identifiant venu de deux sources', () => {
    const [gh] = toRows('u1', 'github', [event])
    const [crm] = toRows('u1', 'crm', [event])
    expect([gh.species, gh.shiny]).not.toEqual([crm.species, crm.shiny])
  })

  it('accepte un événement sans ref ni url', () => {
    const [row] = toRows('u1', 'crm', [{ externalId: '42', label: 'note 10/10', date: '2026-02-03' }])
    expect(row).toMatchObject({ source: 'crm', external_id: '42', ref: null, url: null })
  })
})

describe('planSources', () => {
  beforeEach(() => { process.env.CATCH_TOKEN = 't' })
  afterEach(() => { delete process.env.CATCH_TOKEN })

  it('ne réclame que les secrets des sources réellement présentes', () => {
    expect(planSources([identity('u1')])).toEqual({ unknown: [], missing: [] })
  })

  it('signale un secret manquant pour une source présente', () => {
    delete process.env.CATCH_TOKEN
    expect(planSources([identity('u1')]).missing).toEqual(['CATCH_TOKEN'])
  })

  it('ne réclame aucun secret quand aucune identité n’existe', () => {
    delete process.env.CATCH_TOKEN
    expect(planSources([])).toEqual({ unknown: [], missing: [] })
  })

  it('repère une source déclarée sans connecteur sans la confondre avec un secret manquant', () => {
    expect(planSources([identity('u1', { source: 'hubspot' })])).toEqual({ unknown: ['hubspot'], missing: [] })
  })
})

describe('main', () => {
  const SB = 'https://x.supabase.co'

  /**
   * Un seul mock `fetch` pour deux APIs distinctes (GitHub + PostgREST) : on dispatche sur
   * l'URL. `github` fournit les réponses GitHub dans l'ordre d'appel, communes à toutes les
   * identités traitées par ce run — suffisant tant qu'une seule identité par test a du nouveau.
   */
  function makeFetch({ identities, catchesByUser = {}, github = [] } = {}) {
    const githubQueue = [...github]
    const inserted = []
    const fn = vi.fn(async (url, init = {}) => {
      if (url.includes('/rest/v1/identities')) {
        return { ok: true, status: 200, json: async () => identities, headers: new Headers() }
      }
      if (url.includes('/rest/v1/catches') && (!init.method || init.method === 'GET')) {
        const params = new URL(url).searchParams
        const userId = params.get('user_id').replace('eq.', '')
        const source = params.get('source').replace('eq.', '')
        return {
          ok: true, status: 200, headers: new Headers(),
          json: async () => (catchesByUser[userId] ?? []).filter((c) => c.source === source),
        }
      }
      if (url.includes('/rest/v1/catches') && init.method === 'POST') {
        inserted.push(JSON.parse(init.body))
        return { ok: true, status: 201, json: async () => [], headers: new Headers() }
      }
      const next = githubQueue.shift()
      if (!next) throw new Error(`fetch non mocké : ${url}`)
      return next
    })
    fn.inserted = inserted
    return fn
  }

  beforeEach(() => {
    process.env.SUPABASE_URL = SB
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    process.env.CATCH_TOKEN = 't'
    process.env.BOOTSTRAP_SINCE = '2026-01-01'
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.CATCH_TOKEN
    delete process.env.BOOTSTRAP_SINCE
  })

  it('insère les nouvelles captures scopées au bon user_id et à la bonne source', async () => {
    const fetchMock = makeFetch({
      identities: [identity('u1')],
      github: [searchPage([item('moi/atlas', 1, 'a')]), prDetail('sha-a', '2026-01-02T10:00:00Z')],
    })
    vi.stubGlobal('fetch', fetchMock)

    const total = await main()

    expect(total).toBe(1)
    expect(fetchMock.inserted).toHaveLength(1)
    expect(fetchMock.inserted[0]).toEqual([{
      user_id: 'u1',
      source: 'github',
      external_id: 'sha-a',
      label: 'a',
      ref: 'moi/atlas#1 · sha-a',
      url: 'https://github.com/moi/atlas/pull/1',
      date: '2026-01-02',
      species: expect.any(Number),
      shiny: expect.any(Boolean),
    }])
  })

  it('traite chaque identité indépendamment, avec son propre historique et son propre handle', async () => {
    const fetchMock = makeFetch({
      identities: [identity('u1'), identity('u2', { handle: 'toi' })],
      catchesByUser: {
        u1: [{ source: 'github', external_id: 'old', url: 'https://github.com/moi/atlas/pull/0', date: '2026-01-05' }],
      },
      github: [
        searchPage([]), // recherche pour u1 : rien de nouveau
        searchPage([item('moi/atlas', 9, 'nouvelle')]), prDetail('sha-9', '2026-01-06T10:00:00Z'), // pour u2
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    await main()

    expect(fetchMock.inserted).toHaveLength(1)
    expect(fetchMock.inserted[0][0].user_id).toBe('u2')
  })

  /**
   * Le curseur est par source : l'historique d'une autre source, même plus récent, ne doit
   * pas décaler la fenêtre de celle-ci. Sans cette isolation, la recherche GitHub partirait
   * de mars au lieu de janvier et manquerait les PR intermédiaires.
   */
  it('calcule la fenêtre de recherche sur la seule source traitée', async () => {
    const fetchMock = makeFetch({
      identities: [identity('u1')],
      catchesByUser: {
        u1: [
          { source: 'github', external_id: 'g', url: 'https://github.com/moi/atlas/pull/0', date: '2026-01-20' },
          { source: 'crm', external_id: '42', url: null, date: '2026-03-30' },
        ],
      },
      github: [searchPage([])],
    })
    vi.stubGlobal('fetch', fetchMock)

    await main()

    const search = fetchMock.mock.calls.find(([url]) => url.includes('search/issues'))
    expect(search[0]).toContain('merged%3A%3E%3D2026-01-13')
  })

  it('config vide sur une identité surveille tous les repos accessibles au jeton', async () => {
    const fetchMock = makeFetch({
      identities: [identity('u1', { config: {} })],
      github: [searchPage([item('nimporte/quoi', 1, 'a')]), prDetail('sha-a', '2026-01-02T10:00:00Z')],
    })
    vi.stubGlobal('fetch', fetchMock)

    await main()

    expect(fetchMock.inserted[0][0].url).toBe('https://github.com/nimporte/quoi/pull/1')
  })

  it("n'insère rien pour une identité sans nouvelle capture", async () => {
    const fetchMock = makeFetch({ identities: [identity('u1')], github: [searchPage([])] })
    vi.stubGlobal('fetch', fetchMock)

    const total = await main()

    expect(total).toBe(0)
    expect(fetchMock.inserted).toHaveLength(0)
  })

  it('ignore une source sans connecteur et traite quand même les autres', async () => {
    const fetchMock = makeFetch({
      identities: [identity('u1', { source: 'hubspot', handle: 'moi@guestapp.me' }), identity('u2')],
      github: [searchPage([item('moi/atlas', 1, 'a')]), prDetail('sha-a', '2026-01-02T10:00:00Z')],
    })
    vi.stubGlobal('fetch', fetchMock)

    const total = await main()

    expect(total).toBe(1)
    expect(fetchMock.inserted[0][0].user_id).toBe('u2')
  })

  it('échoue avec un message clair si des variables d’environnement sont manquantes', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await expect(main()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('échoue avant toute insertion si le secret d’une source présente manque', async () => {
    delete process.env.CATCH_TOKEN
    const fetchMock = makeFetch({ identities: [identity('u1')] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main()).rejects.toThrow(/CATCH_TOKEN/)
    expect(fetchMock.inserted).toHaveLength(0)
  })

  it('traite un BOOTSTRAP_SINCE vide (variable de dépôt non définie) comme le jour du run', async () => {
    process.env.BOOTSTRAP_SINCE = ''
    const today = new Date().toISOString().slice(0, 10)
    const fetchMock = makeFetch({
      identities: [identity('u1')],
      github: [searchPage([item('moi/atlas', 1, 'a')]), prDetail('sha-a', '2026-01-02T10:00:00Z')],
    })
    vi.stubGlobal('fetch', fetchMock)

    await main()

    const search = fetchMock.mock.calls.find(([url]) => url.includes('search/issues'))
    expect(search[0]).toContain(`merged%3A%3E%3D${today}`)
  })

  it('propage l’échec de la source sans l’avaler', async () => {
    const fetchMock = makeFetch({
      identities: [identity('u1')],
      github: [{ ok: false, status: 401, headers: new Headers(), json: async () => ({}) }],
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main()).rejects.toThrow(/401/)
  })

  it('n’enregistre que des sources dont le connecteur déclare la même clé', () => {
    for (const [key, connector] of Object.entries(CONNECTORS)) expect(connector.id).toBe(key)
  })
})
