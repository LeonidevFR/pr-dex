import { describe, it, expect } from 'vitest'
import { buildSessions, isClosed, planJudgments, isHuman, QUIET_SECONDS } from './sessions.mjs'

const T0 = 1791878400 // 2026-10-13 08:00 UTC
const ts = (s) => `${T0 + s}.000100`
const H = 3600
const msg = (s, user, text = 'retour', extra = {}) => ({ ts: ts(s), user, text, ...extra })

// Une session typique : Léo lance, Alice et Bob répondent dans le thread.
const root = msg(0, 'U0LEO', 'Monkey-testing : la création de campagne', { reply_count: 3 })
const thread = [root, msg(60, 'U0ALICE'), msg(120, 'U0BOB'), msg(180, 'U0LEO', 'merci')]
const build = (history, replies = { [root.ts]: thread }, extra = {}) =>
  buildSessions({ channel: 'C1', history, repliesByRoot: replies, organizers: ['U0LEO', 'U0ZOE'], ...extra })

describe('isHuman', () => {
  it('écarte les bots et les messages système', () => {
    expect(isHuman(msg(0, 'U1'))).toBe(true)
    expect(isHuman({ ...msg(0, 'U1'), bot_id: 'B1' })).toBe(false)
    expect(isHuman({ ...msg(0, 'U1'), subtype: 'channel_join' })).toBe(false)
    expect(isHuman({ ...msg(0, 'U1'), subtype: 'file_share' })).toBe(true)
  })
})

describe('buildSessions', () => {
  it('fait une session d’un message racine que deux personnes ont commenté', () => {
    const [s] = build([root])
    expect(s).toMatchObject({ id: root.ts, channel: 'C1', organizer: 'U0LEO', rootText: 'Monkey-testing : la création de campagne' })
    expect(s.messages.map((m) => [m.user, m.where])).toEqual([['U0ALICE', 'thread'], ['U0BOB', 'thread'], ['U0LEO', 'thread']])
    expect(s.lastTs).toBe(ts(180))
  })

  it('ne fait pas une session d’un retour isolé auquel une seule personne a répondu', () => {
    const lone = msg(0, 'U0ALICE', 'bug sur l’export', { reply_count: 1 })
    expect(build([lone], { [lone.ts]: [lone, msg(60, 'U0LEO')] })).toEqual([])
  })

  it('ne compte pas l’auteur parmi ceux qui ont répondu', () => {
    const r = msg(0, 'U0LEO', 'x', { reply_count: 3 })
    expect(build([r], { [r.ts]: [r, msg(60, 'U0LEO'), msg(70, 'U0LEO'), msg(80, 'U0ALICE')] })).toEqual([])
  })

  it('rattache un retour posté dans la room à la session ouverte', () => {
    const [s] = build([root, msg(2 * H, 'U0CHLOE', 'le bouton ne répond pas')])
    expect(s.messages.at(-1)).toMatchObject({ user: 'U0CHLOE', where: 'room' })
    expect(s.lastTs).toBe(ts(2 * H))
  })

  // Un testeur poste son bug dans la room, le dev et un collègue lui répondent : ce n'est pas
  // une nouvelle session dont le testeur serait l'organisateur, c'est un retour de la session
  // en cours, réponses comprises.
  it('rattache à la session ouverte un retour de la room que d’autres ont commenté', () => {
    const stray = msg(2 * H, 'U0CHLOE', 'bug : le bouton Y plante', { reply_count: 2 })
    const replies = {
      [root.ts]: thread,
      [stray.ts]: [stray, msg(2 * H + 60, 'U0LEO', 'merci je regarde'), msg(2 * H + 120, 'U0BOB', 'pareil chez moi')],
    }
    const sessions = build([root, stray], replies)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].organizer).toBe('U0LEO')
    expect(sessions[0].messages.filter((m) => m.where === 'room')).toEqual([
      { ts: stray.ts, user: 'U0CHLOE', text: 'bug : le bouton Y plante', where: 'room' },
      { ts: ts(2 * H + 60), user: 'U0LEO', text: 'merci je regarde', where: 'room', thread: stray.ts },
      { ts: ts(2 * H + 120), user: 'U0BOB', text: 'pareil chez moi', where: 'room', thread: stray.ts },
    ])
    expect(sessions[0].lastTs).toBe(ts(2 * H + 120))
  })

  // Deux sessions lancées le même jour sont deux sessions : un testeur qui répond aux deux
  // gagne deux boosters, et chacune a son récap et son sujet.
  it('ouvre une nouvelle session pour un organisateur pendant qu’une autre est ouverte', () => {
    const next = msg(H, 'U0ZOE', 'Nouveau monkey-testing : l’export', { reply_count: 2 })
    const replies = { [root.ts]: thread, [next.ts]: [next, msg(H + 60, 'U0ALICE', 'bug export'), msg(H + 120, 'U0BOB', 'export ok sur 2 établissements')] }
    const sessions = build([root, next], replies)
    expect(sessions.map((x) => x.organizer)).toEqual(['U0LEO', 'U0ZOE'])
    expect(sessions[0].messages.some((m) => m.ts === next.ts)).toBe(false)
    expect(sessions[1].messages.map((m) => m.user)).toEqual(['U0ALICE', 'U0BOB'])
  })

  it('range dans la session ouverte la relance d’un organisateur que personne n’a commentée', () => {
    const reminder = msg(H, 'U0LEO', 'On compte sur vos retours aujourd’hui, en thread au-dessus')
    const sessions = build([root, reminder])
    expect(sessions).toHaveLength(1)
    expect(sessions[0].messages.some((m) => m.ts === reminder.ts)).toBe(true)
  })

  it('ouvre une nouvelle session une fois la précédente terminée', () => {
    const next = msg(180 + QUIET_SECONDS + 1, 'U0ZOE', 'Nouvelle session : l’export', { reply_count: 2 })
    const replies = { [root.ts]: thread, [next.ts]: [next, msg(180 + QUIET_SECONDS + 60, 'U0ALICE'), msg(180 + QUIET_SECONDS + 90, 'U0BOB')] }
    expect(build([root, next], replies).map((s) => s.organizer)).toEqual(['U0LEO', 'U0ZOE'])
  })

  it('fait une session du thread forcé même pendant une session ouverte', () => {
    const forced = msg(H, 'U0ZOE', 'x', { reply_count: 1 })
    const replies = { [root.ts]: thread, [forced.ts]: [forced, msg(H + 60, 'U0ALICE')] }
    expect(build([root, forced], replies, { forcedRoot: forced.ts }).map((s) => s.id)).toEqual([root.ts, forced.ts])
  })

  it('ne rattache pas un message posté après la fin de la session', () => {
    const [s] = build([root, msg(180 + QUIET_SECONDS + 1, 'U0CHLOE')])
    expect(s.messages.some((m) => m.user === 'U0CHLOE')).toBe(false)
  })

  it('ignore les réponses de thread recopiées dans la room', () => {
    const broadcast = msg(60, 'U0ALICE', 'retour', { subtype: 'thread_broadcast', thread_ts: root.ts })
    const [s] = build([root, broadcast])
    expect(s.messages.filter((m) => m.user === 'U0ALICE')).toHaveLength(1)
  })

  it('ignore les messages de bots, dont le récap pr-dex', () => {
    const replies = { [root.ts]: [...thread, { ...msg(200, 'U0BOT'), bot_id: 'B1' }] }
    expect(build([root], replies)[0].messages.some((m) => m.user === 'U0BOT')).toBe(false)
  })

  it('fait une session du thread forcé, même peu commenté', () => {
    const lone = msg(0, 'U0LEO', 'x', { reply_count: 1 })
    const out = build([lone], { [lone.ts]: [lone, msg(60, 'U0ALICE')] }, { forcedRoot: lone.ts })
    expect(out).toHaveLength(1)
  })
})

// Sans liste, n'importe qui lance une session : un message et deux complices qui répondent
// suffisent à se distribuer des boosters, à tour de rôle.
describe('organisateurs', () => {
  it('ne fait pas une session d’un message posté par quelqu’un hors de la liste', () => {
    const fake = msg(0, 'U0MALLORY', 'Test de la page X', { reply_count: 2 })
    const replies = { [fake.ts]: [fake, msg(60, 'U0ALICE', 'bug sur X'), msg(120, 'U0BOB', 'testé l’écran X, ok')] }
    expect(build([fake], replies)).toEqual([])
  })

  it('garde les retours de n’importe qui pendant une vraie session', () => {
    const [s] = build([root, msg(2 * H, 'U0MALLORY', 'le bouton ne répond pas')])
    expect(s.messages.some((m) => m.user === 'U0MALLORY' && m.where === 'room')).toBe(true)
  })

  it('accepte un thread passé à la main, quel que soit son auteur', () => {
    const fake = msg(0, 'U0MALLORY', 'x', { reply_count: 2 })
    const replies = { [fake.ts]: [fake, msg(60, 'U0ALICE'), msg(120, 'U0BOB')] }
    expect(build([fake], replies, { forcedRoot: fake.ts })).toHaveLength(1)
  })
})

// Une relance renvoie vers le lancement d'une session encore en cours : ses réponses comptent
// pour cette session, un seul booster par personne, un seul récap. Une fois la session jugée,
// un message qui renvoie vers elle est un nouveau test.
describe('relances', () => {
  const link = (ts, extra = '') => `<https://guestsuite.slack.com/archives/C1/p${ts.replace('.', '')}${extra}>`
  const reminder = msg(20 * H, 'U0LEO', `On compte sur vos retours ${link(root.ts)}`, { reply_count: 2 })
  const replies = {
    [root.ts]: thread,
    [reminder.ts]: [reminder, msg(20 * H + 60, 'U0CHLOE', 'bug sur l’écran Y'), msg(20 * H + 120, 'U0DAN', 'testé Z, ok')],
  }

  it('range une relance commentée, et ses réponses, dans la session vers laquelle elle renvoie', () => {
    const sessions = build([root, reminder], replies)
    expect(sessions).toHaveLength(1)
    const fromReminder = sessions[0].messages.filter((m) => m.thread === reminder.ts)
    expect(fromReminder.map((m) => m.user)).toEqual(['U0CHLOE', 'U0DAN'])
    expect(sessions[0].lastTs).toBe(ts(20 * H + 120))
  })

  it('reconnaît un lien vers une réponse du thread de la session', () => {
    const viaReply = { ...reminder, text: `Relance ${link(ts(60), `?thread_ts=${root.ts}&cid=C1`)}` }
    expect(build([root, viaReply], { ...replies, [viaReply.ts]: replies[reminder.ts] })).toHaveLength(1)
  })

  it('fait un nouveau test d’un message qui renvoie vers une session déjà jugée', () => {
    const sessions = build([root, reminder], replies, { judged: new Set([root.ts]) })
    expect(sessions.map((x) => x.id)).toEqual([root.ts, reminder.ts])
  })

  it('ignore un lien vers une autre room', () => {
    const elsewhere = { ...reminder, text: `Voir <https://guestsuite.slack.com/archives/C9/p${root.ts.replace('.', '')}>` }
    expect(build([root, elsewhere], { ...replies, [elsewhere.ts]: replies[reminder.ts] })).toHaveLength(2)
  })
})

describe('isClosed', () => {
  const s = { lastTs: `${T0}.000000` }
  it('attend 24 h sans activité', () => {
    expect(isClosed(s, T0 + QUIET_SECONDS - 1)).toBe(false)
    expect(isClosed(s, T0 + QUIET_SECONDS)).toBe(true)
  })
})

describe('planJudgments', () => {
  const s = { id: ts(0), lastTs: ts(180) }
  // `ts(180)` vaut T0 + 180,0001 s : la session est finie une seconde pleine plus tard.
  const later = T0 + 181 + QUIET_SECONDS

  it('juge une session terminée et jamais jugée', () => {
    expect(planJudgments({ sessions: [s], existingById: {}, nowSec: later })).toEqual([s])
  })
  it('attend la fin d’une session', () => {
    expect(planJudgments({ sessions: [s], existingById: {}, nowSec: later - 1 })).toEqual([])
  })
  it('ne rejuge pas une session sans nouveau message', () => {
    const existingById = { [s.id]: { seen_until: ts(180) } }
    expect(planJudgments({ sessions: [s], existingById, nowSec: later })).toEqual([])
  })
  it('rejuge une session qui a reçu un message depuis', () => {
    const existingById = { [s.id]: { seen_until: ts(120) } }
    expect(planJudgments({ sessions: [s], existingById, nowSec: later })).toEqual([s])
  })
  it('juge toujours le thread forcé', () => {
    const existingById = { [s.id]: { seen_until: ts(180) } }
    expect(planJudgments({ sessions: [s], existingById, nowSec: T0, forcedId: s.id })).toEqual([s])
  })
  // Relancer à la main un vieux thread lit l'historique depuis lui : les sessions suivantes,
  // hors de la fenêtre de sept jours, ne doivent pas être jugées au passage.
  it('ne juge que le thread forcé', () => {
    const other = { id: ts(1000), lastTs: ts(1100) }
    expect(planJudgments({ sessions: [s, other], existingById: {}, nowSec: later + 2000, forcedId: s.id })).toEqual([s])
  })
})
