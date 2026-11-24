import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PodiumShelf from './PodiumShelf.vue'

const MOI = 'u-moi'
const SAISONS = [
  { season: '2026-S3', podium: [{ user_id: 'u-marion', rank: 1, prize: 0 }, { user_id: MOI, rank: 2, prize: 0 }] },
  { season: '2026-S2', podium: [{ user_id: 'u-thomas', rank: 1, prize: 0 }] },
]

const monter = (props = {}) => mount(PodiumShelf, { props: { seasons: SAISONS, userId: MOI, ...props } })

/**
 * L'étagère des podiums. Elle était dessinée deux fois — sur l'écran Saison et sur la fiche —
 * par deux calculs distincts du palmarès. Deux copies d'une même étagère finissent par se
 * contredire, et c'est la seule chose du jeu qu'on garde pour de bon.
 */
describe('PodiumShelf', () => {
  // Une étagère à trous raconte une histoire qu'une liste de badges gagnés ne raconte pas.
  it('garde les socles des saisons manquées', () => {
    const socles = monter().findAll('.saison-socle')
    expect(socles).toHaveLength(2)
    expect(socles[0].text()).toContain('2e')
    expect(socles[1].classes()).toContain('vide')
    expect(socles[1].text()).toContain('hors podium')
  })

  it('compte les podiums sur le total des saisons closes', () => {
    expect(monter().find('.sect-h').text()).toContain('1 sur 2 saisons closes')
  })

  it('le dit quand la saison est la première', () => {
    expect(monter({ seasons: [] }).text()).toContain('C’est la première saison')
  })
})
