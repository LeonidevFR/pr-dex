import { describe, it, expect } from 'vitest'
import {
  dateOf, labelOf, subjectOf, fileNameOf, permalink, judgmentInput, validateVerdict, mergeAttribution, recapText,
} from './attribution.mjs'

const BASE = 'https://guestsuite.slack.com'
const session = {
  id: '1791878400.000100',
  channel: 'C1',
  organizer: 'U0LEO',
  rootText: 'Testez la création de campagne',
  messages: [
    { ts: '1791878460.000100', user: 'U0ALICE', text: 'Le bouton Envoyer ne répond pas', where: 'thread' },
    { ts: '1791878520.000100', user: 'U0BOB', text: '+1', where: 'thread' },
    { ts: '1791885600.000100', user: 'U0CHLOE', text: 'Testé avec 2 établissements, ok', where: 'room' },
    { ts: '1791878580.000100', user: 'U0LEO', text: 'merci', where: 'thread' },
  ],
  lastTs: '1791885600.000100',
}
const names = { U0ALICE: 'Alice', U0BOB: 'Bob', U0CHLOE: 'Chloé', U0LEO: 'Léo' }

describe('dates et noms', () => {
  it('date un message à l’heure de Paris', () => {
    expect(dateOf('1791878400.000100')).toBe('2026-10-13')
    expect(dateOf('1791930600.000100')).toBe('2026-10-14') // 22 h 30 UTC, 0 h 30 à Paris
  })
  it('compose le libellé et le nom de fichier', () => {
    expect(labelOf('2026-10-13')).toBe('Monkey-testing · 13 oct.')
    expect(labelOf('2026-10-13', 'Création de campagne')).toBe('Monkey-testing · Création de campagne')
    expect(fileNameOf('1791878400.000100')).toBe('2026-10-13-1791878400.000100.json')
  })
  it('construit un lien vers un message de thread ou de la room', () => {
    expect(permalink(BASE, 'C1', '1791878460.000100', '1791878400.000100'))
      .toBe('https://guestsuite.slack.com/archives/C1/p1791878460000100?thread_ts=1791878400.000100&cid=C1')
    expect(permalink(BASE, 'C1', '1791878400.000100')).toBe('https://guestsuite.slack.com/archives/C1/p1791878400000100')
  })
})

// Le dos d'une carte de PR montre son titre ; celui d'une carte de monkey-testing montre le
// sujet de la session, tiré de la première ligne du message qui la lance.
describe('subjectOf', () => {
  it('prend la première ligne du message', () => {
    expect(subjectOf('Testez la création de campagne\nMerci de répondre dans le thread')).toBe('Testez la création de campagne')
  })
  it('retire le mot « monkey-testing » répété en tête', () => {
    expect(subjectOf('Monkey-testing : la création de campagne')).toBe('La création de campagne')
    expect(subjectOf(':monkey: *Monkey testing* - export CSV')).toBe('Export CSV')
  })
  it('nettoie le balisage Slack', () => {
    expect(subjectOf('<!here> *Nouvelle* :rocket: version de <https://app.guest-suite.com|l’app> pour <@U0LEO> dans <#C1|support>'))
      .toBe('Nouvelle version de l’app pour dans #support')
  })
  it('coupe un sujet trop long au mot', () => {
    const subject = subjectOf('On teste aujourd’hui le nouveau parcours de création de campagne avec plusieurs établissements')
    expect(subject.length).toBeLessThanOrEqual(61)
    expect(subject).toMatch(/…$/)
    expect(subject).toMatch(/^On teste aujourd’hui le nouveau parcours/)
  })
  it('rend une chaîne vide sans texte utile', () => {
    expect(subjectOf(':monkey: <!here>')).toBe('')
    expect(subjectOf('')).toBe('')
  })
})

describe('judgmentInput', () => {
  it('donne à Claude le périmètre, les messages et qui est l’organisateur', () => {
    const input = judgmentInput(session, names)
    expect(input.scope).toBe('Testez la création de campagne')
    expect(input.organizer).toBe('U0LEO')
    expect(input.messages[0]).toEqual({
      ts: '1791878460.000100', slack_id: 'U0ALICE', name: 'Alice', where: 'thread',
      text: 'Le bouton Envoyer ne répond pas', organizer: false,
    })
    expect(input.messages.find((m) => m.slack_id === 'U0LEO').organizer).toBe(true)
  })
})

describe('validateVerdict', () => {
  const p = (slack_id, evidence_ts) => ({ slack_id, evidence_ts, reason: 'r' })

  it('garde un verdict conforme et fusionne les doublons', () => {
    const verdict = { participants: [p('U0ALICE', ['1791878460.000100']), p('U0ALICE', ['1791878460.000100'])] }
    expect(validateVerdict(verdict, session)).toEqual([{ slack_id: 'U0ALICE', evidence_ts: ['1791878460.000100'] }])
  })
  it('rejette l’organisateur', () => {
    expect(() => validateVerdict({ participants: [p('U0LEO', ['1791878580.000100'])] }, session)).toThrow(/organisateur/)
  })
  it('rejette quelqu’un qui n’a rien posté', () => {
    expect(() => validateVerdict({ participants: [p('U0MALLORY', ['1791878460.000100'])] }, session)).toThrow(/rien posté/)
  })
  it('rejette une preuve qui n’est pas un message de la personne', () => {
    expect(() => validateVerdict({ participants: [p('U0BOB', ['1791878460.000100'])] }, session)).toThrow(/preuve/)
  })
  it('rejette un participant sans preuve', () => {
    expect(() => validateVerdict({ participants: [p('U0ALICE', [])] }, session)).toThrow(/preuve/)
  })
  it('rejette un verdict sans liste', () => {
    expect(() => validateVerdict({}, session)).toThrow(/participants/)
  })
})

describe('mergeAttribution', () => {
  const accepted = [
    { slack_id: 'U0ALICE', evidence_ts: ['1791878460.000100'] },
    { slack_id: 'U0CHLOE', evidence_ts: ['1791885600.000100'] },
  ]

  it('crée le fichier d’une session jamais jugée', () => {
    const { data, added, created } = mergeAttribution({ existing: null, session, accepted, names, base: BASE })
    expect(created).toBe(true)
    expect(added).toEqual(['U0ALICE', 'U0CHLOE'])
    expect(data).toEqual({
      activity: 'monkey-testing',
      id: '1791878400.000100',
      label: 'Monkey-testing · Testez la création de campagne',
      url: 'https://guestsuite.slack.com/archives/C1/p1791878400000100',
      date: '2026-10-13',
      draws: 10,
      recipients: [
        { slack_id: 'U0ALICE', name: 'Alice', evidence: ['https://guestsuite.slack.com/archives/C1/p1791878460000100?thread_ts=1791878400.000100&cid=C1'] },
        { slack_id: 'U0CHLOE', name: 'Chloé', evidence: ['https://guestsuite.slack.com/archives/C1/p1791885600000100'] },
      ],
      seen_until: '1791885600.000100',
    })
  })

  it('ajoute sans jamais retirer', () => {
    const existing = { ...mergeAttribution({ existing: null, session, accepted: [accepted[0]], names, base: BASE }).data, seen_until: '1' }
    const { data, added, created } = mergeAttribution({ existing, session, accepted: [accepted[1]], names, base: BASE })
    expect(created).toBe(false)
    expect(added).toEqual(['U0CHLOE'])
    expect(data.recipients.map((r) => r.slack_id)).toEqual(['U0ALICE', 'U0CHLOE'])
    expect(data.seen_until).toBe('1791885600.000100')
  })

  it('pointe la preuve d’une réponse à un retour de la room vers le thread de ce retour', () => {
    const reply = { ts: '1791885700.000100', user: 'U0BOB', text: 'pareil chez moi', where: 'room', thread: '1791885600.000100' }
    const withReply = { ...session, messages: [...session.messages, reply] }
    const { data } = mergeAttribution({
      existing: null, session: withReply, accepted: [{ slack_id: 'U0BOB', evidence_ts: [reply.ts] }], names, base: BASE,
    })
    expect(data.recipients[0].evidence).toEqual([
      'https://guestsuite.slack.com/archives/C1/p1791885700000100?thread_ts=1791885600.000100&cid=C1',
    ])
  })

  it('date le libellé quand le message de lancement n’a pas de sujet', () => {
    const { data } = mergeAttribution({ existing: null, session: { ...session, rootText: ':monkey:' }, accepted, names, base: BASE })
    expect(data.label).toBe('Monkey-testing · 13 oct.')
  })

  it('ne réajoute pas quelqu’un déjà listé', () => {
    const existing = mergeAttribution({ existing: null, session, accepted, names, base: BASE }).data
    expect(mergeAttribution({ existing, session, accepted, names, base: BASE }).added).toEqual([])
  })
})

describe('recapText', () => {
  const url = 'https://leonidevfr.github.io/pr-dex/'
  it('annonce les gagnants d’une session nouvellement jugée', () => {
    const text = recapText({ created: true, added: ['U0ALICE', 'U0CHLOE'], prdexUrl: url })
    expect(text).toContain('<@U0ALICE>, <@U0CHLOE>')
    expect(text).toContain('10 cartes')
    expect(text).toContain(url)
    expect(text).toContain('Slack')
  })
  it('annonce un complément sur une session déjà jugée', () => {
    expect(recapText({ created: false, added: ['U0BOB'], prdexUrl: url })).toMatch(/^🎴 En plus/)
  })
  it('ne poste rien sans gagnant', () => {
    expect(recapText({ created: true, added: [], prdexUrl: url })).toBeNull()
  })
})
