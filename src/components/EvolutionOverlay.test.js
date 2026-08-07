import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EvolutionOverlay from './EvolutionOverlay.vue'

const mountEvo = (props) =>
  mount(EvolutionOverlay, { props: { from: 1, to: 2, shiny: false, candies: 0, ...props } })

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

describe('bloc d’informations', () => {
  it('marque une espèce cible jamais rencontrée', () => {
    const w = mountEvo({ isNew: true })
    expect(w.find('.new-chip').text()).toBe('Nouveau')
    expect(w.find('.reveal-note').text()).toContain('Première entrée à la planche')
  })

  it('ne marque rien pour une espèce déjà à la planche', () => {
    const w = mountEvo({ isNew: false })
    expect(w.find('.new-chip').exists()).toBe(false)
    expect(w.find('.reveal-note').text()).toContain('Déjà à la planche')
  })

  it('ne suppose rien quand la propriété est absente', () => {
    expect(mountEvo({}).find('.new-chip').exists()).toBe(false)
  })

  // Le palier affiché est celui de ce qu'on obtient, pas de ce qu'on avait :
  // Magicarpe (commun) → Léviator (rare).
  it('affiche le palier de la forme obtenue', () => {
    expect(mountEvo({ from: 129, to: 130 }).find('.reveal-tags').text()).toContain('Rare')
    expect(mountEvo({ from: 129, to: 130 }).find('.reveal-tags').text()).not.toContain('Commun')
  })

  it('affiche le solde de bonbons restant et la famille qui les porte', () => {
    // Herbizarre → Florizarre : la famille est celle de la racine, Bulbizarre.
    const w = mountEvo({ from: 2, to: 3, candies: 12 })
    expect(w.find('.reveal-note').text()).toContain('il reste 12 bonbons')
    expect(w.find('.reveal-note').text()).toContain('Bulbizarre')
  })

  it('annonce le chromatique dans le bandeau et dans les puces', () => {
    const w = mountEvo({ shiny: true })
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
    expect(w.find('.shiny-chip').exists()).toBe(true)
  })

  it('prime le chromatique sur le légendaire dans le bandeau', () => {
    // Aucune évolution ne mène à un légendaire dans le dex ; on force la cible pour
    // vérifier la règle de priorité elle-même, qui doit rester alignée sur le rituel.
    const w = mountEvo({ from: 1, to: 144, shiny: true })
    expect(w.find('.reveal-banner').text()).toContain('Chromatique')
  })

  it('garde le bandeau « Évolution » dans le cas ordinaire', () => {
    expect(mountEvo({}).find('.reveal-banner').text()).toBe('Évolution')
  })

  it('cumule les trois puces sans qu’aucune n’en remplace une autre', () => {
    const w = mountEvo({ isNew: true, shiny: true })
    expect(w.findAll('.chip')).toHaveLength(3)
  })
})
