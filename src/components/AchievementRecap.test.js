import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AchievementRecap from './AchievementRecap.vue'

const ITEMS = [{ code: 'deja-vu' }, { code: 'shiny-1' }, { code: 'retire-depuis' }]

describe('AchievementRecap', () => {
  it('au lancement : « Tu avais déjà N succès », codes inconnus écartés', () => {
    const w = mount(AchievementRecap, { props: { items: ITEMS, first: true } })
    expect(w.find('.ach-recap-title').text()).toBe('Tu avais déjà 2 succès')
    expect(w.findAll('.ach-recap-grid .ach-name').map((n) => n.text())).toEqual(['Déjà-vu', 'Premier chromatique'])
  })

  it('ensuite : « Nouveau depuis ta dernière visite »', () => {
    const w = mount(AchievementRecap, { props: { items: ITEMS, first: false } })
    expect(w.find('.ach-recap-title').text()).toBe('Nouveau depuis ta dernière visite')
  })

  it('se ferme au bouton et hors de la feuille', async () => {
    const w = mount(AchievementRecap, { props: { items: ITEMS, first: true } })
    await w.find('.ach-recap-close').trigger('click')
    await w.find('.scrim').trigger('click')
    expect(w.emitted('close')).toHaveLength(2)
  })
})
