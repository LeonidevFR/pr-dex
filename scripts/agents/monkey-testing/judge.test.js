import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeArgs, readVerdict, main } from './judge.mjs'
import { writeJson } from './work.mjs'

describe('claudeArgs', () => {
  const args = claudeArgs({ systemPrompt: 'P', schema: { type: 'object' }, model: 'sonnet' })
  it('retire tous les outils à Claude', () => {
    expect(args[args.indexOf('--tools') + 1]).toBe('')
  })
  it('n’utilise pas --bare, qui ignorerait le jeton d’abonnement', () => {
    expect(args).not.toContain('--bare')
  })
  it('demande une sortie structurée selon le schéma', () => {
    expect(args[args.indexOf('--output-format') + 1]).toBe('json')
    expect(args[args.indexOf('--json-schema') + 1]).toBe('{"type":"object"}')
    expect(args[args.indexOf('--system-prompt') + 1]).toBe('P')
  })
  it('ignore les réglages, plugins et MCP de la machine', () => {
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('')
    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--no-session-persistence')
  })
})

describe('readVerdict', () => {
  it('lit structured_output', () => {
    const stdout = JSON.stringify({ type: 'result', is_error: false, structured_output: { participants: [] } })
    expect(readVerdict(stdout)).toEqual({ participants: [] })
  })
  it('échoue si Claude a échoué', () => {
    expect(() => readVerdict(JSON.stringify({ is_error: true, subtype: 'error_max_turns' }))).toThrow(/error_max_turns/)
  })
  it('échoue sans sortie structurée', () => {
    expect(() => readVerdict(JSON.stringify({ is_error: false, result: 'texte' }))).toThrow(/structurée/)
  })
})

describe('main', () => {
  let dir
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'judge-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('écrit un verdict par entrée et note les échecs sans arrêter les autres', async () => {
    await writeJson(join(dir, 'inputs', 'A.json'), { input: { scope: 'a', messages: [] } })
    await writeJson(join(dir, 'inputs', 'B.json'), { input: { scope: 'b', messages: [] } })
    const run = vi.fn((_args, stdin) => {
      if (stdin.includes('"scope":"b"')) throw new Error('claude a échoué (1)')
      return JSON.stringify({ is_error: false, structured_output: { participants: [] } })
    })
    expect(await main({ WORK_DIR: dir }, run)).toBe(1)
    expect(JSON.parse(await readFile(join(dir, 'verdicts', 'A.json'), 'utf8'))).toEqual({ participants: [] })
    const failures = JSON.parse(await readFile(join(dir, 'failures.json'), 'utf8'))
    expect(failures).toEqual([expect.stringMatching(/^B : claude a échoué/)])
  })
})
