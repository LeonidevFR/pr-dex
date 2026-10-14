import { describe, it, expect, vi } from 'vitest'
import { useAchievements } from './useAchievements.js'

const gh = (id, species, date = '2026-06-01') => ({ source: 'github', external_id: id, species, shiny: false, date, ref: null })
const client = (over = {}) => ({
  readAchievements: vi.fn().mockResolvedValue([]),
  readAchievementCounts: vi.fn().mockResolvedValue([]),
  readLeaderboard: vi.fn().mockResolvedValue([]),
  insertAchievements: vi.fn().mockResolvedValue(),
  markAnnounced: vi.fn().mockResolvedValue(),
  ...over,
})
// Deux Rattata d'affilée : « Déjà-vu » dès que la seconde carte est ouverte.
const PAIR = [gh('a', 19, '2026-06-01'), gh('b', 19, '2026-06-02')]
const reader = (state) => () => ({ catches: PAIR, state })
const stateWith = (claimed) => ({ claimed, spent: {}, evolutions: [] })

describe('useAchievements', () => {
  it('au chargement, inscrit sans annonce ce que les données remplissent déjà, daté de l’événement', async () => {
    const c = client()
    const a = useAchievements()
    await a.load(c, reader(stateWith(['github:a', 'github:b'])))
    expect(c.insertAchievements).toHaveBeenCalledWith([
      { code: 'deja-vu', unlocked_at: '2026-06-02', trigger_key: 'github:b', announced: false },
    ])
    expect(a.unannounced.value.map((r) => r.code)).toEqual(['deja-vu'])
    expect(a.isFirstRecap.value).toBe(true)
    expect(a.toasts.value).toEqual([])
  })

  it('ne réinscrit pas ce que la table a déjà, et ignore un code inconnu', async () => {
    const c = client({
      readAchievements: vi.fn().mockResolvedValue([
        { code: 'deja-vu', unlocked_at: '2026-06-02', trigger_key: 'github:b', announced: true },
        { code: 'retire-depuis', unlocked_at: '2026-06-02', trigger_key: null, announced: false },
      ]),
    })
    const a = useAchievements()
    await a.load(c, reader(stateWith(['github:a', 'github:b'])))
    expect(c.insertAchievements).not.toHaveBeenCalled()
    expect(Object.keys(a.owned.value)).toEqual(['deja-vu'])
    expect(a.isFirstRecap.value).toBe(false)
  })

  it('après un retournement, inscrit le succès annoncé, daté du jour, et le met en toast', async () => {
    const c = client({ readAchievementCounts: vi.fn().mockResolvedValue([{ code: 'deja-vu', players: 2 }]) })
    const state = stateWith(['github:a'])
    const a = useAchievements()
    await a.load(c, () => ({ catches: PAIR, state }))
    state.claimed.push('github:b')
    await a.check('2026-10-14')
    expect(c.insertAchievements).toHaveBeenLastCalledWith([
      { code: 'deja-vu', unlocked_at: '2026-10-14', trigger_key: 'github:b', announced: true },
    ])
    expect(a.toasts.value.map((t) => t.code)).toEqual(['deja-vu'])
    expect(a.counts.value['deja-vu']).toBe(3)
    expect(a.unannounced.value).toEqual([])
  })

  it('deux vérifications simultanées n’annoncent qu’une fois', async () => {
    const c = client()
    const state = stateWith(['github:a'])
    const a = useAchievements()
    await a.load(c, () => ({ catches: PAIR, state }))
    state.claimed.push('github:b')
    await Promise.all([a.check('2026-10-14'), a.check('2026-10-14')])
    expect(c.insertAchievements).toHaveBeenCalledTimes(1)
    expect(a.toasts.value).toHaveLength(1)
  })

  it('une écriture refusée au retournement : ni toast ni exception, rattrapé au chargement suivant', async () => {
    const c = client({ insertAchievements: vi.fn().mockRejectedValue(new Error('offline')) })
    const state = stateWith(['github:a'])
    const a = useAchievements()
    await a.load(c, () => ({ catches: PAIR, state }))
    state.claimed.push('github:b')
    await expect(a.check('2026-10-14')).resolves.toBeUndefined()
    expect(a.toasts.value).toEqual([])
    expect(a.owned.value['deja-vu']).toBeUndefined()
  })

  it('un chargement en échec garde l’erreur, et rien ne se vérifie ensuite', async () => {
    const c = client({ readAchievements: vi.fn().mockRejectedValue(new Error('relation "achievements" does not exist')) })
    const a = useAchievements()
    await a.load(c, reader(stateWith(['github:a', 'github:b'])))
    expect(a.error.value).toBe('relation "achievements" does not exist')
    expect(a.ready.value).toBe(false)
    await a.check('2026-10-14')
    expect(c.insertAchievements).not.toHaveBeenCalled()
  })

  it('Jumeaux se lit dans les captures des autres joueurs', async () => {
    const c = client({
      readLeaderboard: vi.fn().mockResolvedValue([
        { is_me: false, catches: [{ species: 19, date: '2026-06-01' }] },
        { is_me: true, catches: [] },
      ]),
    })
    const a = useAchievements()
    await a.load(c, () => ({ catches: [gh('a', 19)], state: stateWith(['github:a']) }))
    expect(a.owned.value.twins).toBeDefined()
  })

  it('acknowledge marque comme annoncé, même si l’écriture échoue', async () => {
    const c = client({ markAnnounced: vi.fn().mockRejectedValue(new Error('offline')) })
    const a = useAchievements()
    await a.load(c, reader(stateWith(['github:a', 'github:b'])))
    await a.acknowledge()
    expect(c.markAnnounced).toHaveBeenCalledWith(['deja-vu'])
    expect(a.unannounced.value).toEqual([])
  })

  it('progression des paliers et fermeture d’un toast', async () => {
    const c = client()
    const state = stateWith(['github:a'])
    const a = useAchievements()
    await a.load(c, () => ({ catches: PAIR, state }))
    expect(a.progress.value['species-50']).toEqual({ current: 1, target: 50 })
    state.claimed.push('github:b')
    await a.check('2026-10-14')
    a.dismissToast(a.toasts.value[0].id)
    expect(a.toasts.value).toEqual([])
  })
})
