import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collect, parseAttribution, id, secretEnv, MAX_DRAWS } from './slack.mjs'

const session = (over = {}) => ({
  activity: 'monkey-testing',
  id: '1760360000.123456',
  label: 'Monkey-testing · 13 oct.',
  url: 'https://guestsuite.slack.com/archives/C1/p1760360000123456',
  date: '2026-10-13',
  draws: 10,
  recipients: [{ slack_id: 'U0ALICE', name: 'Alice', evidence: ['https://x'] }],
  ...over,
})

let dir
const put = async (folder, name, content) => {
  await mkdir(join(dir, folder), { recursive: true })
  await writeFile(join(dir, folder, name), typeof content === 'string' ? content : JSON.stringify(content))
}

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'attributions-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('identité du connecteur', () => {
  it('déclare sa clé de source et sa variable d’environnement', () => {
    expect(id).toBe('slack')
    expect(secretEnv).toBe('ATTRIBUTIONS_DIR')
    expect(MAX_DRAWS).toBe(10)
  })
})

describe('collect', () => {
  it('rend `draws` événements pour une session où figure le handle', async () => {
    await put('monkey-testing', '2026-10-13-1760360000.123456.json', session())
    const out = await collect({ handle: 'U0ALICE', secret: dir })
    expect(out).toHaveLength(10)
    expect(out[0]).toEqual({
      externalId: 'monkey-testing:1760360000.123456:U0ALICE:1',
      label: 'Monkey-testing · 13 oct.',
      ref: 'monkey-testing',
      url: 'https://guestsuite.slack.com/archives/C1/p1760360000123456',
      date: '2026-10-13',
    })
    expect(out[9].externalId).toBe('monkey-testing:1760360000.123456:U0ALICE:10')
  })

  it('donne des clés différentes à deux participants d’une même session', async () => {
    await put('monkey-testing', 's.json', session({ recipients: [{ slack_id: 'U0ALICE' }, { slack_id: 'U0BOB' }] }))
    const alice = await collect({ handle: 'U0ALICE', secret: dir })
    const bob = await collect({ handle: 'U0BOB', secret: dir })
    const keys = new Set([...alice, ...bob].map((e) => e.externalId))
    expect(keys.size).toBe(20)
  })

  it('ne rend rien pour une session où le handle ne figure pas', async () => {
    await put('monkey-testing', 's.json', session())
    expect(await collect({ handle: 'U0BOB', secret: dir })).toEqual([])
  })

  it('plafonne les tirages à 10, quoi qu’écrive le fichier', async () => {
    await put('monkey-testing', 's.json', session({ draws: 50 }))
    expect(await collect({ handle: 'U0ALICE', secret: dir })).toHaveLength(10)
  })

  it('ne double pas les cartes d’un participant listé deux fois', async () => {
    await put('monkey-testing', 's.json', session({ recipients: [{ slack_id: 'U0ALICE' }, { slack_id: 'U0ALICE' }] }))
    expect(await collect({ handle: 'U0ALICE', secret: dir })).toHaveLength(10)
  })

  it('écarte les clés déjà capturées', async () => {
    await put('monkey-testing', 's.json', session())
    const existing = [1, 2, 3].map((n) => ({ external_id: `monkey-testing:1760360000.123456:U0ALICE:${n}` }))
    const out = await collect({ handle: 'U0ALICE', secret: dir, existing })
    expect(out).toHaveLength(7)
    expect(out[0].externalId).toBe('monkey-testing:1760360000.123456:U0ALICE:4')
  })

  it('ignore `since` : une attribution ancienne reste due', async () => {
    await put('monkey-testing', 's.json', session({ date: '2025-01-01' }))
    expect(await collect({ handle: 'U0ALICE', secret: dir, since: '2026-10-01' })).toHaveLength(10)
  })

  it('lit toutes les activités', async () => {
    await put('monkey-testing', 'a.json', session())
    await put('support', 'b.json', session({ activity: 'support', id: 'T42', label: 'Support' }))
    const out = await collect({ handle: 'U0ALICE', secret: dir })
    expect(out).toHaveLength(20)
    expect(out.some((e) => e.externalId.startsWith('support:T42:'))).toBe(true)
  })

  it('ignore les fichiers qui ne sont pas du JSON', async () => {
    await put('monkey-testing', '.gitkeep', '')
    await put('monkey-testing', 'README.md', '# notes')
    expect(await collect({ handle: 'U0ALICE', secret: dir })).toEqual([])
  })

  it('accepte des champs inconnus du connecteur', async () => {
    await put('monkey-testing', 's.json', session({ seen_until: '1760370000.000000' }))
    expect(await collect({ handle: 'U0ALICE', secret: dir })).toHaveLength(10)
  })

  it('échoue avec le chemin du fichier sur un JSON illisible', async () => {
    await put('monkey-testing', 'casse.json', '{ pas du json')
    await expect(collect({ handle: 'U0ALICE', secret: dir })).rejects.toThrow(/monkey-testing\/casse\.json/)
  })

  it('échoue quand le dossier d’attributions est introuvable', async () => {
    await expect(collect({ handle: 'U0ALICE', secret: join(dir, 'absent') }))
      .rejects.toThrow(/Dossier d’attributions introuvable/)
  })
})

describe('parseAttribution', () => {
  const parse = (over) => () => parseAttribution(session(over), 'monkey-testing/s.json', 'monkey-testing')

  it('accepte un fichier conforme', () => {
    expect(parse({})()).toMatchObject({ activity: 'monkey-testing', draws: 10 })
  })

  it.each([
    ['une activité différente du dossier', { activity: 'support' }, /activity/],
    ['un id vide', { id: '' }, /id/],
    ['un libellé absent', { label: undefined }, /label/],
    ['une URL qui n’est pas https', { url: 'javascript:alert(1)' }, /url/],
    ['une date mal formée', { date: '13/10/2026' }, /date/],
    ['un nombre de tirages nul', { draws: 0 }, /draws/],
    ['un nombre de tirages non entier', { draws: 2.5 }, /draws/],
    ['des destinataires absents', { recipients: undefined }, /recipients/],
    ['un identifiant Slack mal formé', { recipients: [{ slack_id: 'alice' }] }, /slack_id/],
  ])('rejette %s', (_, over, motif) => {
    expect(parse(over)).toThrow(motif)
    expect(parse(over)).toThrow(/^monkey-testing\/s\.json/)
  })
})
