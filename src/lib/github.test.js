import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGithubClient, GithubError } from './github.js'

const b64 = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const fail = (status) => ({ ok: false, status, json: async () => ({ message: 'nope' }) })

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

const client = () => createGithubClient({ repo: 'moi/pr-dex-data', token: 'github_pat_x' })

describe('readCatches', () => {
  it('décode le contenu base64 du fichier', async () => {
    const catches = [{ sha: 'a3f8', repo: 'moi/atlas', pr: 142, title: 'fix', date: '2026-02-03', species: 25, shiny: false }]
    fetchMock.mockResolvedValue(ok({ content: b64(catches), sha: 'blob1' }))
    await expect(client().readCatches()).resolves.toEqual(catches)
  })

  it('traite un fichier absent comme une collection vide, pas comme une erreur', async () => {
    fetchMock.mockResolvedValue(fail(404))
    await expect(client().readCatches()).resolves.toEqual([])
  })

  it('authentifie la requête avec le jeton', async () => {
    fetchMock.mockResolvedValue(ok({ content: b64([]), sha: 'blob1' }))
    await client().readCatches()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/repos/moi/pr-dex-data/contents/data/catches.json')
    expect(init.headers.Authorization).toBe('Bearer github_pat_x')
  })

  it('distingue un jeton refusé d’un repo introuvable', async () => {
    fetchMock.mockResolvedValue(fail(401))
    await expect(client().readCatches()).rejects.toMatchObject({ kind: 'revoked' })
  })

  it('décode correctement les caractères accentués', async () => {
    const catches = [{ sha: 'a3f8', repo: 'moi/atlas', pr: 1, title: 'fix: fuseau horaire à l’export', date: '2026-02-03', species: 25, shiny: false }]
    fetchMock.mockResolvedValue(ok({ content: b64(catches), sha: 'blob1' }))
    const out = await client().readCatches()
    expect(out[0].title).toBe('fix: fuseau horaire à l’export')
  })

  it('tolère le base64 découpé en lignes que renvoie l’API', async () => {
    const catches = [{ sha: 'a3f8', repo: 'moi/atlas', pr: 1, title: 'fix', date: '2026-02-03', species: 25, shiny: false }]
    const wrapped = b64(catches).replace(/(.{10})/g, '$1\n')
    fetchMock.mockResolvedValue(ok({ content: wrapped, sha: 'blob1' }))
    await expect(client().readCatches()).resolves.toEqual(catches)
  })
})

describe('readState', () => {
  it('renvoie l’état et le blob sha requis à l’écriture', async () => {
    const state = { claimed: ['a3f8'], spent: { 1: 8 }, evolutions: [] }
    fetchMock.mockResolvedValue(ok({ content: b64(state), sha: 'blob7' }))
    await expect(client().readState()).resolves.toEqual({ state, blobSha: 'blob7' })
  })

  it('traite un état absent comme un état vide à créer', async () => {
    fetchMock.mockResolvedValue(fail(404))
    await expect(client().readState()).resolves.toEqual({
      state: { claimed: [], spent: {}, evolutions: [] },
      blobSha: null,
    })
  })

  it('complète les champs manquants d’un état partiel', async () => {
    fetchMock.mockResolvedValue(ok({ content: b64({ claimed: ['a3f8'] }), sha: 'blob7' }))
    const { state } = await client().readState()
    expect(state).toEqual({ claimed: ['a3f8'], spent: {}, evolutions: [] })
  })
})

describe('writeState', () => {
  it('envoie un PUT avec le blob sha courant', async () => {
    fetchMock.mockResolvedValue(ok({ content: { sha: 'blob8' } }))
    const state = { claimed: ['a3f8'], spent: {}, evolutions: [] }
    await client().writeState(state, 'blob7', 'claim a3f8')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/contents/data/state.json')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body)
    expect(body.sha).toBe('blob7')
    expect(body.message).toBe('claim a3f8')
    expect(JSON.parse(decodeURIComponent(escape(atob(body.content))))).toEqual(state)
  })

  it('omet le blob sha à la création du fichier', async () => {
    fetchMock.mockResolvedValue(ok({ content: { sha: 'blob1' } }))
    await client().writeState({ claimed: [], spent: {}, evolutions: [] }, null, 'init')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sha).toBeUndefined()
  })

  it('renvoie le nouveau blob sha', async () => {
    fetchMock.mockResolvedValue(ok({ content: { sha: 'blob8' } }))
    const r = await client().writeState({ claimed: [], spent: {}, evolutions: [] }, 'blob7', 'm')
    expect(r).toEqual({ blobSha: 'blob8' })
  })

  it('signale un conflit de version de façon distincte', async () => {
    fetchMock.mockResolvedValue(fail(409))
    await expect(client().writeState({}, 'vieux', 'm')).rejects.toMatchObject({ kind: 'conflict' })
  })

  it('signale aussi le 422, que GitHub renvoie parfois au lieu du 409', async () => {
    fetchMock.mockResolvedValue(fail(422))
    await expect(client().writeState({}, 'vieux', 'm')).rejects.toMatchObject({ kind: 'conflict' })
  })

  it('refuse d’écrire hors ligne avec un message explicite', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(client().writeState({}, 'blob7', 'm')).rejects.toMatchObject({ kind: 'offline' })
  })

  it('encode sans perte les caractères accentués', async () => {
    fetchMock.mockResolvedValue(ok({ content: { sha: 'blob8' } }))
    const state = { claimed: [], spent: {}, evolutions: [{ species: 130, from: 129, date: '2026-07-14', note: 'évolué à l’instant' }] }
    await client().writeState(state, 'blob7', 'm')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(JSON.parse(decodeURIComponent(escape(atob(body.content))))).toEqual(state)
  })
})

describe('classification des erreurs', () => {
  it.each([
    [401, 'revoked'],
    [403, 'revoked'],
    [500, 'server'],
  ])('traduit le statut %i en « %s »', async (status, kind) => {
    fetchMock.mockResolvedValue(fail(status))
    await expect(client().readState()).rejects.toMatchObject({ kind })
  })

  it('distingue un repo introuvable d’un fichier absent', async () => {
    fetchMock.mockResolvedValue(fail(404))
    await expect(client().checkAccess()).rejects.toMatchObject({ kind: 'notfound' })
  })

  it('produit une instance de GithubError', async () => {
    fetchMock.mockResolvedValue(fail(401))
    await expect(client().readState()).rejects.toBeInstanceOf(GithubError)
  })
})
