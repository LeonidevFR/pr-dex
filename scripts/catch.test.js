import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

  it('ne refetch jamais une PR déjà capturée', async () => {
    const existing = [{ sha: 'a3f8c21e9b', repo: 'moi/atlas', pr: 142, date: '2026-02-03', species: 25, shiny: false }]
    const fetchMock = vi.fn().mockResolvedValueOnce(searchPage([item('moi/atlas', 142, 'fix: bug')]))
    const out = await collectNewCatches(existing, opts, fetchMock)
    expect(out).toEqual([])
    // une seule requête : la recherche. Aucun appel de détail pour une PR déjà connue.
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
  let dir
  let path

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pr-dex-catch-'))
    path = join(dir, 'catches.json')
    process.env.CATCHES_PATH = path
    process.env.WATCH_USER = 'moi'
    process.env.WATCH_REPOS = 'moi/atlas'
    process.env.CATCH_TOKEN = 't'
    process.env.BOOTSTRAP_SINCE = '2026-01-01'
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(dir, { recursive: true, force: true })
    delete process.env.CATCHES_PATH
    delete process.env.WATCH_USER
    delete process.env.WATCH_REPOS
    delete process.env.CATCH_TOKEN
    delete process.env.BOOTSTRAP_SINCE
  })

  it('ne recalcule jamais une entrée existante, même si l’algorithme de tirage a changé depuis', async () => {
    // species=999 est délibérément incohérent avec drawFromSha(sha) : simule un changement
    // d'algorithme après capture. L'invariant d'append-only doit préserver cette valeur.
    const stale = { sha: 'oldsha', repo: 'moi/atlas', pr: 1, title: 'old', date: '2026-01-05', species: 999, shiny: true }
    writeFileSync(path, JSON.stringify([stale], null, 2) + '\n')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 2, 'new')]))
      .mockResolvedValueOnce(prDetail('newsha', '2026-02-03T10:00:00Z'))
    vi.stubGlobal('fetch', fetchMock)

    await main()

    const result = JSON.parse(readFileSync(path, 'utf8'))
    const untouched = result.find((c) => c.sha === 'oldsha')
    expect(untouched).toEqual(stale)
  })

  it('trie la sortie par date croissante après ajout', async () => {
    const older = { sha: 'sha-b', repo: 'moi/atlas', pr: 1, title: 'b', date: '2026-01-10', species: 1, shiny: false }
    writeFileSync(path, JSON.stringify([older], null, 2) + '\n')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 2, 'a')]))
      .mockResolvedValueOnce(prDetail('sha-a', '2026-01-02T10:00:00Z'))
    vi.stubGlobal('fetch', fetchMock)

    await main()

    const result = JSON.parse(readFileSync(path, 'utf8'))
    expect(result.map((c) => c.date)).toEqual(['2026-01-02', '2026-01-10'])
  })

  it('laisse le fichier inchangé quand aucune nouvelle capture n’est trouvée', async () => {
    const existing = [{ sha: 'sha-a', repo: 'moi/atlas', pr: 1, title: 'a', date: '2026-01-10', species: 1, shiny: false }]
    writeFileSync(path, JSON.stringify(existing, null, 2) + '\n')
    const before = readFileSync(path, 'utf8')

    const fetchMock = vi.fn().mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')]))
    vi.stubGlobal('fetch', fetchMock)

    await main()

    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('traite un catches.json manquant comme [] et le crée', async () => {
    rmSync(path, { force: true })
    expect(existsSync(path)).toBe(false)

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')]))
      .mockResolvedValueOnce(prDetail('sha-a', '2026-01-02T10:00:00Z'))
    vi.stubGlobal('fetch', fetchMock)

    await main()

    expect(existsSync(path)).toBe(true)
    const result = JSON.parse(readFileSync(path, 'utf8'))
    expect(result).toHaveLength(1)
    expect(result[0].sha).toBe('sha-a')
  })

  it('échoue avec un message clair si des variables d’environnement sont manquantes', async () => {
    delete process.env.WATCH_USER
    await expect(main()).rejects.toThrow(/WATCH_USER/)
  })

  it('traite un BOOTSTRAP_SINCE vide (variable de dépôt non définie) comme la date par défaut', async () => {
    // GitHub Actions passe '' pour une variable non définie, jamais `undefined` : `??` ne
    // l'aurait pas rattrapée et la requête serait partie avec `merged:>=` sans date.
    process.env.BOOTSTRAP_SINCE = ''
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')]))
      .mockResolvedValueOnce(prDetail('sha-a', '2026-01-02T10:00:00Z'))
    vi.stubGlobal('fetch', fetchMock)

    await main()

    const url = fetchMock.mock.calls[0][0]
    expect(url).toContain('merged%3A%3E%3D2026-01-01')
    expect(url).not.toContain('merged%3A%3E%3D&')
    expect(url).not.toMatch(/merged%3A%3E%3D$/)
  })

  it('traite un CATCHES_PATH vide comme le chemin par défaut plutôt que d’échouer à l’écriture', async () => {
    delete process.env.CATCHES_PATH
    process.env.CATCHES_PATH = ''
    const defaultPath = 'data/catches.json'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchPage([item('moi/atlas', 1, 'a')]))
      .mockResolvedValueOnce(prDetail('sha-a', '2026-01-02T10:00:00Z'))
    vi.stubGlobal('fetch', fetchMock)

    try {
      await expect(main()).resolves.not.toThrow()
      expect(existsSync(defaultPath)).toBe(true)
      const result = JSON.parse(readFileSync(defaultPath, 'utf8'))
      expect(result[0].sha).toBe('sha-a')
    } finally {
      rmSync(defaultPath, { force: true })
      rmSync('data', { recursive: true, force: true })
    }
  })
})
