import { describe, it, expect, vi } from 'vitest'
import { slackClient, parseThreadUrl } from './slack.mjs'

const reply = (body, status = 200, headers = {}) => ({ status, headers: new Headers(headers), json: async () => body })

describe('parseThreadUrl', () => {
  it('relit le canal et le ts d’un lien de message', () => {
    expect(parseThreadUrl('https://guestsuite.slack.com/archives/C0MONKEY/p1791878400000100'))
      .toEqual({ channel: 'C0MONKEY', ts: '1791878400.000100' })
  })
  it('prend le message racine d’un lien de réponse', () => {
    expect(parseThreadUrl('https://x.slack.com/archives/C1/p1791878460000100?thread_ts=1791878400.000100&cid=C1'))
      .toEqual({ channel: 'C1', ts: '1791878400.000100' })
  })
  it('rejette autre chose', () => {
    expect(() => parseThreadUrl('https://example.com')).toThrow(/lien de message Slack/)
  })
})

describe('slackClient', () => {
  it('suit la pagination', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(reply({ ok: true, messages: [{ ts: '1' }], response_metadata: { next_cursor: 'c2' } }))
      .mockResolvedValueOnce(reply({ ok: true, messages: [{ ts: '2' }], response_metadata: { next_cursor: '' } }))
    const out = await slackClient('t', fetchFn).history('C1', '100')
    expect(out).toEqual([{ ts: '1' }, { ts: '2' }])
    expect(fetchFn.mock.calls[1][0]).toContain('cursor=c2')
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer t')
  })

  it('attend `retry-after` sur un 429, puis réessaie', async () => {
    const wait = vi.fn(async () => {})
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(reply({}, 429, { 'retry-after': '3' }))
      .mockResolvedValueOnce(reply({ ok: true, messages: [] }))
    await slackClient('t', fetchFn, wait).replies('C1', '1')
    expect(wait).toHaveBeenCalledWith(3000)
  })

  it('abandonne après trois 429', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({}, 429, { 'retry-after': '1' }))
    await expect(slackClient('t', fetchFn, async () => {}).replies('C1', '1')).rejects.toThrow(/429/)
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })

  it('remonte l’erreur rendue par Slack', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ ok: false, error: 'not_in_channel' }))
    await expect(slackClient('t', fetchFn).history('C1', '0')).rejects.toThrow(/not_in_channel/)
  })

  it('met en cache le nom d’une personne', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ ok: true, user: { name: 'alice', profile: { display_name: '', real_name: 'Alice Martin' } } }))
    const slack = slackClient('t', fetchFn)
    expect(await slack.userName('U0ALICE')).toBe('Alice Martin')
    expect(await slack.userName('U0ALICE')).toBe('Alice Martin')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('poste dans le thread', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply({ ok: true }))
    await slackClient('t', fetchFn).post('C1', '1791878400.000100', 'bravo')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ channel: 'C1', thread_ts: '1791878400.000100', text: 'bravo' })
  })
})
