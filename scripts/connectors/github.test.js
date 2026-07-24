import { describe, it, expect, vi } from 'vitest'
import { collect, pullRefOf, id, secretEnv } from './github.mjs'

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

describe('identité du connecteur', () => {
  it('déclare sa clé de source et le secret dont il a besoin', () => {
    expect(id).toBe('github')
    expect(secretEnv).toBe('CATCH_TOKEN')
  })
})

describe('pullRefOf', () => {
  it('relit le dépôt et le numéro depuis l’URL d’une capture', () => {
    expect(pullRefOf('https://github.com/moi/atlas/pull/142')).toBe('moi/atlas#142')
  })

  it('rend null sur une URL d’une autre forme ou absente', () => {
    expect(pullRefOf('https://github.com/moi/atlas')).toBeNull()
    expect(pullRefOf(null)).toBeNull()
  })
})

describe('collect', () => {
  const opts = { handle: 'moi', config: { repos: ['moi/atlas'] }, secret: 't', since: '2026-01-01' }

  it('rend un événement par PR mergée inconnue', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix: bug')]))
      .mockResolvedValueOnce(prDetail('a3f8c21e9b', '2026-02-03T10:00:00Z'))
    const out = await collect({ ...opts, fetchFn: fetchMock })
    expect(out).toEqual([{
      externalId: 'a3f8c21e9b',
      label: 'fix: bug',
      ref: 'moi/atlas#142 · a3f8c21',
      url: 'https://github.com/moi/atlas/pull/142',
      date: '2026-02-03',
    }])
  })

  it('n’attribue aucune espèce — le tirage n’est pas son affaire', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix')]))
      .mockResolvedValueOnce(prDetail('a3f8c21e9b', '2026-02-03T10:00:00Z'))
    const [event] = await collect({ ...opts, fetchFn: fetchMock })
    expect(event.species).toBeUndefined()
    expect(event.shiny).toBeUndefined()
  })

  it('ignore les repos hors de la liste surveillée', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(searchPage([item('moi/secret', 1, 'x')]))
    expect(await collect({ ...opts, fetchFn: fetchMock })).toEqual([])
  })

  it('surveille tous les repos accessibles au jeton quand la config est vide', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/nimporte-quoi', 1, 'x')]))
      .mockResolvedValueOnce(prDetail('shax', '2026-02-03T10:00:00Z'))
    const out = await collect({ ...opts, config: {}, fetchFn: fetchMock })
    expect(out[0].url).toBe('https://github.com/moi/nimporte-quoi/pull/1')
  })

  it('ne refetch jamais une PR déjà capturée', async () => {
    const existing = [{ external_id: 'a3f8c21e9b', url: 'https://github.com/moi/atlas/pull/142', date: '2026-02-03' }]
    const fetchMock = vi.fn().mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix: bug')]))
    const out = await collect({ ...opts, existing, fetchFn: fetchMock })
    expect(out).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('écarte quand même une PR dont le sha est déjà connu sous un autre numéro', async () => {
    const existing = [{ external_id: 'memesha', url: 'https://github.com/moi/atlas/pull/1', date: '2026-02-03' }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 143, 'b')]))
      .mockResolvedValueOnce(prDetail('memesha', '2026-02-04T10:00:00Z'))
    expect(await collect({ ...opts, existing, fetchFn: fetchMock })).toEqual([])
  })

  it('déduplique sur le sha même quand deux PR distinctes le partagent', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'a'), item('moi/atlas', 143, 'b')]))
      .mockResolvedValueOnce(prDetail('memesha', '2026-02-03T10:00:00Z'))
      .mockResolvedValueOnce(prDetail('memesha', '2026-02-04T10:00:00Z'))
    expect(await collect({ ...opts, fetchFn: fetchMock })).toHaveLength(1)
  })

  it('pagine tant que GitHub annonce une page suivante', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')], true))
      .mockResolvedValueOnce(prDetail('sha1', '2026-02-03T10:00:00Z'))
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 2, 'b')]))
      .mockResolvedValueOnce(prDetail('sha2', '2026-02-04T10:00:00Z'))
    const out = await collect({ ...opts, fetchFn: fetchMock })
    expect(out.map((c) => c.externalId)).toEqual(['sha1', 'sha2'])
  })

  it('écarte une PR sans merge_commit_sha', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix')]))
      .mockResolvedValueOnce(prDetail(null, '2026-02-03T10:00:00Z'))
    expect(await collect({ ...opts, fetchFn: fetchMock })).toEqual([])
  })

  it('surveille plusieurs repos à la fois', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a'), item('moi/pergola', 2, 'b')]))
      .mockResolvedValueOnce(prDetail('shaA', '2026-02-03T10:00:00Z'))
      .mockResolvedValueOnce(prDetail('shaB', '2026-02-04T10:00:00Z'))
    const out = await collect({ ...opts, config: { repos: ['moi/atlas', 'moi/pergola'] }, fetchFn: fetchMock })
    expect(out.map((c) => c.ref)).toEqual(['moi/atlas#1 · shaA', 'moi/pergola#2 · shaB'])
  })

  it('échoue bruyamment si la recherche est refusée', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) })
    await expect(collect({ ...opts, fetchFn: fetchMock })).rejects.toThrow(/401/)
  })

  it('authentifie chaque requête', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')]))
      .mockResolvedValueOnce(prDetail('sha1', '2026-02-03T10:00:00Z'))
    await collect({ ...opts, fetchFn: fetchMock })
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe('Bearer t')
    }
  })
})
