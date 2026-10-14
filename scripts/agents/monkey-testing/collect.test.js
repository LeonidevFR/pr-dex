import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from './collect.mjs'

const T0 = 1791878400
const ts = (s) => `${T0 + s}.000100`
const root = { ts: ts(0), user: 'U0LEO', text: 'Testez la campagne', reply_count: 2 }
const replies = [root, { ts: ts(60), user: 'U0ALICE', text: 'bug' }, { ts: ts(120), user: 'U0BOB', text: 'testé l’export, ok' }]

const fakeSlack = () => ({
  history: async () => [root],
  replies: async () => replies,
  userName: async (id) => ({ U0LEO: 'Léo', U0ALICE: 'Alice', U0BOB: 'Bob' })[id],
})

let dir, env
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'collect-'))
  await mkdir(join(dir, 'attributions', 'monkey-testing'), { recursive: true })
  env = {
    SLACK_CHANNEL_ID: 'C1', ATTRIBUTIONS_DIR: join(dir, 'attributions'), WORK_DIR: join(dir, 'work'),
    MONKEY_TESTING_ORGANIZERS: 'U0LEO, U0ZOE',
  }
})
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

// `ts(120)` vaut T0 + 120,0001 s : à T0 + 121 + 24 h, la session est finie ; une seconde avant, non.
const later = (T0 + 121 + 86400) * 1000

describe('collect', () => {
  it('prépare une entrée par session terminée', async () => {
    expect(await main(env, later, fakeSlack())).toBe(1)
    const [file] = await readdir(join(dir, 'work', 'inputs'))
    const { session, names, input } = JSON.parse(await readFile(join(dir, 'work', 'inputs', file), 'utf8'))
    expect(session.id).toBe(ts(0))
    expect(names).toEqual({ U0LEO: 'Léo', U0ALICE: 'Alice', U0BOB: 'Bob' })
    expect(input.messages.map((m) => m.name)).toEqual(['Alice', 'Bob'])
  })

  it('ne prépare rien pour une session encore ouverte', async () => {
    expect(await main(env, later - 1000, fakeSlack())).toBe(0)
  })

  it('ne prépare rien pour une session déjà jugée sans nouveau message', async () => {
    await writeFile(join(dir, 'attributions', 'monkey-testing', 'x.json'), JSON.stringify({ id: ts(0), seen_until: ts(120) }))
    expect(await main(env, later, fakeSlack())).toBe(0)
  })

  it('juge tout de suite le thread passé à la main', async () => {
    const forced = { ...env, THREAD_URL: `https://x.slack.com/archives/C1/p${ts(0).replace('.', '')}` }
    expect(await main(forced, (T0 + 200) * 1000, fakeSlack())).toBe(1)
  })

  it('ne prépare rien pour une session lancée hors de la liste d’organisateurs', async () => {
    expect(await main({ ...env, MONKEY_TESTING_ORGANIZERS: 'U0ZOE' }, later, fakeSlack())).toBe(0)
  })

  // Une liste absente laisserait n'importe qui lancer une session : on refuse de tourner.
  it.each([undefined, '', 'leo, U0ZOE'])('refuse une liste d’organisateurs absente ou mal formée (%j)', async (value) => {
    await expect(main({ ...env, MONKEY_TESTING_ORGANIZERS: value }, later, fakeSlack())).rejects.toThrow(/MONKEY_TESTING_ORGANIZERS/)
  })

  it('refuse un thread d’une autre room', async () => {
    const forced = { ...env, THREAD_URL: `https://x.slack.com/archives/C2/p${ts(0).replace('.', '')}` }
    await expect(main(forced, later, fakeSlack())).rejects.toThrow(/C2/)
  })
})
