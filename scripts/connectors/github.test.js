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

  it('sans config.repos, ne retient que les dépôts de DEFAULT_ORG (Guest-Suite)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('Guest-Suite/atlas', 1, 'x')]))
      .mockResolvedValueOnce(prDetail('shax', '2026-02-03T10:00:00Z'))
    const out = await collect({ ...opts, config: {}, fetchFn: fetchMock })
    expect(out[0].url).toBe('https://github.com/Guest-Suite/atlas/pull/1')
  })

  it('sans config.repos, écarte un dépôt hors DEFAULT_ORG même accessible au jeton', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(searchPage([item('moi/perso', 1, 'x')]))
    expect(await collect({ ...opts, config: {}, fetchFn: fetchMock })).toEqual([])
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

  const refused = (status, headers = {}, message = '') => ({
    ok: false, status, headers: new Headers(headers), json: async () => ({ message }),
  })

  it('attend et rejoue la recherche quand GitHub limite le débit, au lieu de casser le run', async () => {
    const wait = vi.fn().mockResolvedValue()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(refused(403, {}, 'You have exceeded a secondary rate limit.'))
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')]))
      .mockResolvedValueOnce(prDetail('sha1', '2026-02-03T10:00:00Z'))
    const out = await collect({ ...opts, fetchFn: fetchMock, wait })
    expect(out.map((c) => c.externalId)).toEqual(['sha1'])
    expect(wait).toHaveBeenCalledWith(60_000)
  })

  it('respecte retry-after quand GitHub le fournit', async () => {
    const wait = vi.fn().mockResolvedValue()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(refused(429, { 'retry-after': '7' }))
      .mockResolvedValueOnce(searchPage([]))
    await collect({ ...opts, fetchFn: fetchMock, wait })
    expect(wait).toHaveBeenCalledWith(7_000)
  })

  it('attend la remise à zéro du quota quand il est épuisé', async () => {
    const wait = vi.fn().mockResolvedValue()
    const reset = Math.floor(Date.now() / 1000) + 30
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(refused(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }))
      .mockResolvedValueOnce(searchPage([]))
    await collect({ ...opts, fetchFn: fetchMock, wait })
    const [[delay]] = wait.mock.calls
    expect(delay).toBeGreaterThan(20_000)
    expect(delay).toBeLessThanOrEqual(31_000)
  })

  it('finit par échouer si la limite persiste', async () => {
    const wait = vi.fn().mockResolvedValue()
    const fetchMock = vi.fn().mockResolvedValue(refused(403, { 'retry-after': '1' }))
    await expect(collect({ ...opts, fetchFn: fetchMock, wait })).rejects.toThrow(/403/)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('ne rejoue pas un 403 qui n’est pas une limite de débit', async () => {
    const wait = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(refused(403, {}, 'Resource not accessible by personal access token'))
    await expect(collect({ ...opts, fetchFn: fetchMock, wait })).rejects.toThrow(/403/)
    expect(wait).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
