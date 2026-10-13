import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main as apply } from './apply.mjs'
import { main as announce } from './announce.mjs'
import { writeJson } from './work.mjs'

const session = {
  id: '1791878400.000100', channel: 'C1', organizer: 'U0LEO', rootText: 'x',
  messages: [
    { ts: '1791878460.000100', user: 'U0ALICE', text: 'bug', where: 'thread' },
    { ts: '1791878520.000100', user: 'U0BOB', text: 'bug 2', where: 'thread' },
  ],
  lastTs: '1791878520.000100',
}
const names = { U0ALICE: 'Alice', U0BOB: 'Bob', U0LEO: 'Léo' }
const p = (slack_id, ts) => ({ slack_id, evidence_ts: [ts], reason: 'r' })

let dir, env
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'apply-'))
  env = {
    WORK_DIR: join(dir, 'work'),
    ATTRIBUTIONS_DIR: join(dir, 'attributions'),
    SLACK_WORKSPACE_URL: 'https://guestsuite.slack.com',
    PRDEX_URL: 'https://leonidevfr.github.io/pr-dex/',
  }
  await writeJson(join(env.WORK_DIR, 'inputs', `${session.id}.json`), { session, names, input: {} })
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const files = async () => readdir(join(env.ATTRIBUTIONS_DIR, 'monkey-testing'))
const announcements = async () => JSON.parse(await readFile(join(env.WORK_DIR, 'announcements.json'), 'utf8'))

describe('apply', () => {
  it('écrit le fichier de la session et prépare le récap', async () => {
    await writeJson(join(env.WORK_DIR, 'verdicts', `${session.id}.json`), { participants: [p('U0ALICE', '1791878460.000100')] })
    expect(await apply(env)).toEqual({ written: 1, announcements: 1 })
    expect(await files()).toEqual(['2026-10-13-1791878400.000100.json'])
    const [a] = await announcements()
    expect(a).toMatchObject({ channel: 'C1', thread_ts: session.id })
    expect(a.text).toContain('<@U0ALICE>')
  })

  it('rejette un verdict qui nomme l’organisateur, sans écrire ni annoncer', async () => {
    await writeJson(join(env.WORK_DIR, 'verdicts', `${session.id}.json`), { participants: [p('U0LEO', '1791878460.000100')] })
    expect(await apply(env)).toEqual({ written: 0, announcements: 0 })
    const failures = JSON.parse(await readFile(join(env.WORK_DIR, 'failures.json'), 'utf8'))
    expect(failures[0]).toMatch(/organisateur/)
  })

  it('complète un fichier existant sans rien retirer', async () => {
    await writeJson(join(env.WORK_DIR, 'verdicts', `${session.id}.json`), { participants: [p('U0ALICE', '1791878460.000100')] })
    await apply(env)
    await writeJson(join(env.WORK_DIR, 'verdicts', `${session.id}.json`), { participants: [p('U0BOB', '1791878520.000100')] })
    await apply(env)
    const data = JSON.parse(await readFile(join(env.ATTRIBUTIONS_DIR, 'monkey-testing', (await files())[0]), 'utf8'))
    expect(data.recipients.map((r) => r.slack_id)).toEqual(['U0ALICE', 'U0BOB'])
    const [a] = await announcements()
    expect(a.text).toMatch(/^🎴 En plus/)
  })

  // Un fichier que le connecteur rejette bloquerait les cartes slack de tout le monde, à chaque
  // run, et le récap aurait promis un booster qui n'arrive pas.
  it('n’écrit pas un fichier que le connecteur rejetterait', async () => {
    await writeJson(join(env.WORK_DIR, 'verdicts', `${session.id}.json`), { participants: [p('U0ALICE', '1791878460.000100')] })
    expect(await apply({ ...env, SLACK_WORKSPACE_URL: 'guestsuite.slack.com' })).toEqual({ written: 0, announcements: 0 })
    const failures = JSON.parse(await readFile(join(env.WORK_DIR, 'failures.json'), 'utf8'))
    expect(failures[0]).toMatch(/url/)
  })

  it('ne fait rien sans verdict', async () => {
    expect(await apply(env)).toEqual({ written: 0, announcements: 0 })
  })
})

describe('announce', () => {
  it('poste chaque récap dans son thread', async () => {
    await writeJson(join(env.WORK_DIR, 'announcements.json'), [{ channel: 'C1', thread_ts: session.id, text: 'bravo' }])
    const post = vi.fn(async () => ({ ok: true }))
    expect(await announce(env, { post })).toBe(1)
    expect(post).toHaveBeenCalledWith('C1', session.id, 'bravo')
  })
})
