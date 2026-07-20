import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EvolutionOverlay from './EvolutionOverlay.vue'

const mountEvo = (props) => mount(EvolutionOverlay, { props: { from: 1, to: 2, shiny: false, ...props } })

describe('EvolutionOverlay', () => {
  it('nomme les deux formes', () => {
    expect(mountEvo({}).find('.reveal-name').text()).toBe('Bulbizarre → Herbizarre')
  })

  it('montre les deux sprites', () => {
    const imgs = mountEvo({}).findAll('.evo-frame img')
    expect(imgs).toHaveLength(2)
    expect(imgs[0].attributes('src')).toContain('/1.png')
    expect(imgs[1].attributes('src')).toContain('/2.png')
  })

  it('propage le chromatique aux deux formes', () => {
    const imgs = mountEvo({ shiny: true }).findAll('.evo-frame img')
    expect(imgs[0].attributes('src')).toContain('/shiny/')
    expect(imgs[1].attributes('src')).toContain('/shiny/')
  })

  it('prend la couleur du palier de la forme obtenue', () => {
    // Magicarpe (commun) → Léviator (rare) : la scène doit porter le palier d'arrivée
    expect(mountEvo({ from: 129, to: 130 }).find('.evostage').attributes('style')).toContain('--t-r')
  })

  it('émet done', async () => {
    const w = mountEvo({})
    await w.find('.next-btn').trigger('click')
    expect(w.emitted('done')).toBeTruthy()
  })

  it('rend chacune des trois évolutions d’Évoli', () => {
    for (const [to, name] of [[134, 'Aquali'], [135, 'Voltali'], [136, 'Pyroli']]) {
      expect(mountEvo({ from: 133, to }).find('.reveal-name').text()).toBe(`Évoli → ${name}`)
    }
  })
})
