import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { collectNewCatches, sinceDate, main } from './catch.mjs'

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

describe('collectNewCatches', () => {
  const opts = { user: 'moi', repos: ['moi/atlas'], token: 't', since: '2026-01-01' }

  it('crée une entrée par PR mergée inconnue', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix: bug')]))
      .mockResolvedValueOnce(prDetail('a3f8c21e9b', '2026-02-03T10:00:00Z'))
    const out = await collectNewCatches([], opts, fetchMock)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      sha: 'a3f8c21e9b', repo: 'moi/atlas', pr: 142, title: 'fix: bug', date: '2026-02-03',
    })
    expect(out[0].species).toBeGreaterThanOrEqual(1)
    expect(out[0].species).toBeLessThanOrEqual(151)
    expect(typeof out[0].shiny).toBe('boolean')
  })

  it('ignore les repos hors de la liste surveillée', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(searchPage([item('moi/secret', 1, 'x')]))
    expect(await collectNewCatches([], opts, fetchMock)).toEqual([])
  })

  it('surveille tous les repos accessibles au token quand repos est vide ou absent', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/nimporte-quoi', 1, 'x')]))
      .mockResolvedValueOnce(prDetail('shax', '2026-02-03T10:00:00Z'))
    const out = await collectNewCatches([], { ...opts, repos: [] }, fetchMock)
    expect(out).toHaveLength(1)
    expect(out[0].repo).toBe('moi/nimporte-quoi')
  })

  it('ne refetch jamais une PR déjà capturée', async () => {
    const existing = [{ sha: 'a3f8c21e9b', repo: 'moi/atlas', pr: 142, date: '2026-02-03' }]
    const fetchMock = vi.fn().mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix: bug')]))
    const out = await collectNewCatches(existing, opts, fetchMock)
    expect(out).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('déduplique sur le sha même quand deux PR distinctes le partagent', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'a'), item('moi/atlas', 143, 'b')]))
      .mockResolvedValueOnce(prDetail('memesha', '2026-02-03T10:00:00Z'))
      .mockResolvedValueOnce(prDetail('memesha', '2026-02-04T10:00:00Z'))
    const out = await collectNewCatches([], opts, fetchMock)
    expect(out).toHaveLength(1)
  })

  it('pagine tant que GitHub annonce une page suivante', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')], true))
      .mockResolvedValueOnce(prDetail('sha1', '2026-02-03T10:00:00Z'))
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 2, 'b')]))
      .mockResolvedValueOnce(prDetail('sha2', '2026-02-04T10:00:00Z'))
    const out = await collectNewCatches([], opts, fetchMock)
    expect(out.map((c) => c.sha)).toEqual(['sha1', 'sha2'])
  })

  it('écarte une PR sans merge_commit_sha', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix')]))
      .mockResolvedValueOnce(prDetail(null, '2026-02-03T10:00:00Z'))
    expect(await collectNewCatches([], opts, fetchMock)).toEqual([])
  })

  it('attribue la même espèce que le front pour un sha donné', async () => {
    const { drawFromSha } = await import('../shared/draw.js')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix')]))
      .mockResolvedValueOnce(prDetail('a3f8c21e9b', '2026-02-03T10:00:00Z'))
    const [entry] = await collectNewCatches([], opts, fetchMock)
    expect({ species: entry.species, shiny: entry.shiny }).toEqual(drawFromSha('a3f8c21e9b'))
  })

  it('surveille plusieurs repos à la fois', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a'), item('moi/pergola', 2, 'b')]))
      .mockResolvedValueOnce(prDetail('shaA', '2026-02-03T10:00:00Z'))
      .mockResolvedValueOnce(prDetail('shaB', '2026-02-04T10:00:00Z'))
    const out = await collectNewCatches([], { ...opts, repos: ['moi/atlas', 'moi/pergola'] }, fetchMock)
    expect(out.map((c) => c.repo)).toEqual(['moi/atlas', 'moi/pergola'])
  })

  it('échoue bruyamment si la recherche est refusée', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) })
    await expect(collectNewCatches([], opts, fetchMock)).rejects.toThrow(/401/)
  })

  it('authentifie chaque requête', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')]))
      .mockResolvedValueOnce(prDetail('sha1', '2026-02-03T10:00:00Z'))
    await collectNewCatches([], opts, fetchMock)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe('Bearer t')
    }
  })
})

describe('main', () => {
  const SB = 'https://x.supabase.co'

  /**
   * Un seul mock `fetch` pour deux APIs distinctes (GitHub + PostgREST) : on dispatche sur
   * l'URL. `github` fournit les réponses GitHub dans l'ordre d'appel, communes à tous les
   * profils traités par ce run — suffisant tant qu'un seul profil par test a du nouveau.
   */
  function makeFetch({ profiles, catchesByUser = {}, github = [] } = {}) {
    const githubQueue = [...github]
    const inserted = []
    const fn = vi.fn(async (url, init = {}) => {
      if (url.includes('/rest/v1/profiles')) {
        return { ok: true, status: 200, json: async () => profiles, headers: new Headers() }
      }
      if (url.includes('/rest/v1/catches') && (!init.method || init.method === 'GET')) {
        const userId = new URL(url).searchParams.get('user_id').replace('eq.', '')
        return { ok: true, status: 200, json: async () => catchesByUser[userId] ?? [], headers: new Headers() }
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

  it('insère les nouvelles captures scopées au bon user_id', async () => {
    const fetchMock = makeFetch({
      profiles: [{ user_id: 'u1', github_login: 'moi', watch_repos: ['moi/atlas'] }],
      github: [searchPage([item('moi/atlas', 1, 'a')]), prDetail('sha-a', '2026-01-02T10:00:00Z')],
    })
    vi.stubGlobal('fetch', fetchMock)

    const total = await main()

    expect(total).toBe(1)
    expect(fetchMock.inserted).toHaveLength(1)
    expect(fetchMock.inserted[0]).toEqual([{ user_id: 'u1', sha: 'sha-a', repo: 'moi/atlas', pr: 1, title: 'a', date: '2026-01-02', species: expect.any(Number), shiny: expect.any(Boolean) }])
  })

  it('traite chaque profil indépendamment, avec son propre historique et son propre login', async () => {
    const fetchMock = makeFetch({
      profiles: [
        { user_id: 'u1', github_login: 'moi', watch_repos: ['moi/atlas'] },
        { user_id: 'u2', github_login: 'toi', watch_repos: ['moi/atlas'] },
      ],
      catchesByUser: { u1: [{ sha: 'old', repo: 'moi/atlas', pr: 0, date: '2026-01-05' }] },
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

  it('watch_repos vide sur un profil surveille tous les repos accessibles au token', async () => {
    const fetchMock = makeFetch({
      profiles: [{ user_id: 'u1', github_login: 'moi', watch_repos: [] }],
      github: [searchPage([item('nimporte/quoi', 1, 'a')]), prDetail('sha-a', '2026-01-02T10:00:00Z')],
    })
    vi.stubGlobal('fetch', fetchMock)

    await main()

    expect(fetchMock.inserted[0][0].repo).toBe('nimporte/quoi')
  })

  it("n'insère rien pour un profil sans nouvelle capture", async () => {
    const fetchMock = makeFetch({
      profiles: [{ user_id: 'u1', github_login: 'moi', watch_repos: ['moi/atlas'] }],
      github: [searchPage([])],
    })
    vi.stubGlobal('fetch', fetchMock)

    const total = await main()

    expect(total).toBe(0)
    expect(fetchMock.inserted).toHaveLength(0)
  })

  it('échoue avec un message clair si des variables d’environnement sont manquantes', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await expect(main()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('traite un BOOTSTRAP_SINCE vide (variable de dépôt non définie) comme le jour du run', async () => {
    process.env.BOOTSTRAP_SINCE = ''
    const today = new Date().toISOString().slice(0, 10)
    const fetchMock = makeFetch({
      profiles: [{ user_id: 'u1', github_login: 'moi', watch_repos: ['moi/atlas'] }],
      github: [searchPage([item('moi/atlas', 1, 'a')]), prDetail('sha-a', '2026-01-02T10:00:00Z')],
    })
    vi.stubGlobal('fetch', fetchMock)

    await main()

    const githubCall = fetchMock.mock.calls.find(([url]) => url.includes('search/issues'))
    expect(githubCall[0]).toContain(`merged%3A%3E%3D${today}`)
  })

  it('propage l’échec GitHub avec le user_id concerné dans le message', async () => {
    const fetchMock = makeFetch({
      profiles: [{ user_id: 'u1', github_login: 'moi', watch_repos: ['moi/atlas'] }],
      github: [{ ok: false, status: 401, headers: new Headers(), json: async () => ({}) }],
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(main()).rejects.toThrow(/401/)
  })
})
