import { describe, it, expect, vi } from 'vitest'
import { useTeamCards, isGift } from './useTeamCards.js'

const members = [{ id: 'a', name: 'Ada', blurb: '…', photoUrl: null }]
const client = (cards, openTeamCard = async () => {}) => ({
  readTeam: async () => ({ members, cards: cards.map((c) => ({ ...c })) }),
  openTeamCard,
})

describe('useTeamCards', () => {
  it('reconnaît le booster du 25 à sa clé', () => {
    expect(isGift('noel:2026')).toBe(true)
    expect(isGift('noel:github:abc')).toBe(false)
  })

  it('reste vide avec un client qui ne connaît pas les cartes équipe', async () => {
    const t = useTeamCards()
    await t.load({})
    expect(t.cards.value).toEqual([])
  })

  it('reste vide quand la lecture échoue, sans faire échouer le chargement', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = useTeamCards()
    await t.load({ readTeam: async () => { throw new Error('relation absente') } }, { force: true })
    expect(t.pending.value).toEqual([])
  })

  it('écarte une carte dont le membre n’existe plus', async () => {
    const t = useTeamCards()
    await t.load(client([{ key: 'noel:2026', member: 'parti', date: '2026-12-25', opened_at: null }]), { force: true })
    expect(t.pending.value).toEqual([])
    expect(t.gift.value).toBeNull()
  })

  it('range la carte ouverte dans l’étagère, et la remet en attente si l’écriture échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ok = useTeamCards()
    await ok.load(client([{ key: 'noel:2026', member: 'a', date: '2026-12-25', opened_at: null }]), { force: true })
    await ok.open('noel:2026')
    expect(ok.owned.value.a).toHaveLength(1)
    expect(ok.gift.value).toBeNull()

    const ko = useTeamCards()
    await ko.load(client([{ key: 'noel:2026', member: 'a', date: '2026-12-25', opened_at: null }], async () => { throw new Error('x') }), { force: true })
    await ko.open('noel:2026')
    expect(ko.gift.value?.key).toBe('noel:2026')
  })

  it('ne lit rien avant le 15 décembre, et lit à partir de ce jour', async () => {
    let reads = 0
    const c = { readTeam: async () => { reads++; return { members, cards: [] } } }
    await useTeamCards().load(c, { today: '2026-12-14' })
    expect(reads).toBe(0)
    await useTeamCards().load(c, { today: '2026-12-15' })
    expect(reads).toBe(1)
  })
})
