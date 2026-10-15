import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RewardTable from './RewardTable.vue'

/**
 * La table des gains. Elle était rangée avec le classement de saison ; elle tient avec les
 * duels, là où la question se pose — on la consulte en choisissant quoi engager.
 */
describe('RewardTable', () => {
  it('publie le barème depuis le moteur, pas une liste recopiée', () => {
    const lignes = mount(RewardTable).findAll('.saison-ligne')
    expect(lignes).toHaveLength(4)
    expect(lignes[3].text()).toContain('60 pts')
    expect(lignes[3].text()).toContain('600 ₽')
  })

  // La règle qui surprend le plus à l'usage : miser gros contre un petit ne rapporte pas gros.
  it('dit que l’enjeu est le plus petit des deux engagements', () => {
    expect(mount(RewardTable).text()).toContain('le plus petit des deux engagements')
  })
})
