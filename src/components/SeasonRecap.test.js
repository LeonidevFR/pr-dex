import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SeasonRecap from './SeasonRecap.vue'

const recap = {
  season: '2026-S6',
  podium: [
    { user_id: 'moi', rank: 1, prize: 1000 },
    { user_id: 'bob', rank: 2, prize: 500 },
    { user_id: 'ada', rank: 3, prize: 250 },
  ],
  board: [
    { user_id: 'moi', login: 'leonard', rank: 1 },
    { user_id: 'bob', login: 'bob-dev', rank: 2 },
    { user_id: 'ada', login: 'ada', rank: 3 },
    { user_id: 'eve', login: 'eve', rank: 4 },
  ],
}
const monter = (userId) => mount(SeasonRecap, { props: { recap, userId, current: '2027-S1' } })

describe('SeasonRecap', () => {
  it('annonce le podium et le gain du joueur', () => {
    const w = monter('moi')
    expect(w.find('.season-recap-title').text()).toBe('Saison 1 terminée')
    expect(w.findAll('.season-podium li')).toHaveLength(3)
    expect(w.find('.season-podium li.moi').text()).toContain('1er+1 000 ₽')
    expect(w.find('.season-recap-moi').text()).toContain('Tu finis 1er')
    expect(w.text()).toContain('La Saison 2 commence')
  })

  it('donne son rang à un joueur hors du podium, et rien à celui qui n’a pas joué', () => {
    expect(monter('eve').find('.season-recap-moi').text()).toBe('Tu finis 4e.')
    expect(monter('zoe').find('.season-recap-moi').text()).toBe('Tu n’as pas joué cette saison.')
  })

  it('montre les ex aequo sur la même marche, avec leur part des primes', () => {
    const w = mount(SeasonRecap, { props: {
      recap: { ...recap, podium: [
        { user_id: 'bob', rank: 1, prize: 750 },
        { user_id: 'moi', rank: 1, prize: 750 },
        { user_id: 'ada', rank: 3, prize: 250 },
      ] },
      userId: 'moi', current: '2027-S1',
    } })
    expect(w.findAll('.season-podium li').map((li) => li.text())).toEqual([
      'bob-dev1er ex aequo+750 ₽', 'leonard1er ex aequo+750 ₽', 'ada3e+250 ₽',
    ])
    expect(w.find('.season-recap-moi').text()).toContain('Tu finis 1er ex aequo : 750 ₽')
  })

  it('se referme', async () => {
    const w = monter('moi')
    await w.find('.season-recap-go').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })
})
