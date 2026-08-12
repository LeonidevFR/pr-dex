import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PokeCard from './PokeCard.vue'

const mountCard = (props = {}) =>
  mount(PokeCard, { props: { speciesId: 25, tier: 'u', ...props } })

describe('face avant', () => {
  it('porte le numéro de planche, le nom et le palier de l’espèce', () => {
    const w = mountCard({ speciesId: 6, tier: 'r' })
    expect(w.find('.pkc-no').text()).toContain('006')
    expect(w.find('.pkc-name').text()).toBe('Dracaufeu')
    expect(w.find('.pkc-tier').text()).toBe('Rare')
  })

  // Le palier se lit dans la matière du carton : c'est un attribut, pas une classe utilitaire,
  // pour que le CSS dérive fond, filet et balayage d'un seul sélecteur par palier.
  it('expose son palier au CSS', () => {
    for (const tier of ['c', 'u', 'r', 'l']) {
      expect(mountCard({ tier }).find('.pkc').attributes('data-tier')).toBe(tier)
    }
  })

  it('marque le chromatique, et lui seul', () => {
    expect(mountCard({ shiny: true }).find('.pkc').classes()).toContain('is-shiny')
    expect(mountCard({ shiny: false }).find('.pkc').classes()).not.toContain('is-shiny')
  })

  it('tire le sprite chromatique quand l’exemplaire l’est', () => {
    const normal = mountCard({ speciesId: 25, shiny: false }).find('.pkc-art img').attributes('src')
    const chromatique = mountCard({ speciesId: 25, shiny: true }).find('.pkc-art img').attributes('src')
    expect(normal).not.toContain('/shiny/')
    expect(chromatique).toContain('/shiny/')
  })

  // La scène est l'éclairage, pas la matière : c'est la même carte au tirage et au tiroir.
  it('porte la scène demandée, et le tiroir par défaut', () => {
    expect(mountCard().find('.pkc').classes()).toContain('scene-day')
    expect(mountCard({ scene: 'night' }).find('.pkc').classes()).toContain('scene-night')
  })

  // Le cachet de cire est un signe de rareté, pas un ornement systématique.
  it('ne scelle de cire que les paliers qui la méritent', () => {
    expect(mountCard({ tier: 'c' }).find('.pkc-wax').exists()).toBe(false)
    expect(mountCard({ tier: 'u' }).find('.pkc-wax').exists()).toBe(false)
    expect(mountCard({ tier: 'r' }).find('.pkc-wax').exists()).toBe(true)
    expect(mountCard({ tier: 'l' }).find('.pkc-wax').exists()).toBe(true)
  })
})

const provenance = {
  ref: 'moi/atlas#142 · a3f8c21',
  label: 'fix: race condition sur la file de synchronisation',
  date: '2026-02-03',
}

describe('dos', () => {
  it('porte la provenance de l’exemplaire', () => {
    const w = mountCard({ provenance })
    expect(w.find('.pkc-lab-ref').text()).toBe('moi/atlas#142 · a3f8c21')
    expect(w.find('.pkc-lab-title').text()).toBe('fix: race condition sur la file de synchronisation')
    expect(w.find('.pkc-lab-date').text()).toBe('2026-02-03')
  })

  // Une source peut n'avoir aucune référence courte à donner — le pli scellé gère déjà ce cas,
  // et le dos ne doit pas afficher une ligne vide à sa place.
  it('se passe de la ligne de référence quand la source n’en fournit pas', () => {
    const w = mountCard({ provenance: { ...provenance, ref: null } })
    expect(w.find('.pkc-lab-ref').exists()).toBe(false)
    expect(w.find('.pkc-lab-title').exists()).toBe(true)
  })

  // La fiche d'espèce montre une espèce, pas un exemplaire daté : elle n'a pas de dos.
  it('n’a pas de dos quand aucune provenance n’est donnée', () => {
    expect(mountCard().find('.pkc-back').exists()).toBe(false)
  })
})

// La taille de la carte vient du CSS, absent des tests : on la fige pour rendre l'inclinaison
// calculable. Et `clientX` est en lecture seule sur les MouseEvent de jsdom, donc l'événement
// est construit plutôt que passé à `trigger()`, qui essaierait de l'affecter après coup.
const pointeSur = async (w, clientX, clientY) => {
  const el = w.find('.pkc').element
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 })
  el.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }))
  await w.vm.$nextTick()
}

describe('inclinaison et retournement', () => {
  it('montre le dos quand on le lui demande', () => {
    expect(mountCard({ provenance, flipped: true }).find('.pkc').classes()).toContain('is-flipped')
  })

  /**
   * `backface-visibility` ne cache la face cachée qu'à l'œil. Sans `aria-hidden`, un lecteur
   * d'écran annoncerait l'espèce alors que la carte est encore retournée — la révélation
   * n'existerait que pour les voyants.
   */
  it('cache la face qui n’est pas tournée vers le joueur, aux lecteurs d’écran aussi', () => {
    const face = mountCard({ provenance })
    expect(face.find('.pkc-front').attributes('aria-hidden')).toBeUndefined()
    expect(face.find('.pkc-back').attributes('aria-hidden')).toBe('true')

    const dos = mountCard({ provenance, flipped: true })
    expect(dos.find('.pkc-front').attributes('aria-hidden')).toBe('true')
    expect(dos.find('.pkc-back').attributes('aria-hidden')).toBeUndefined()
  })

  // La carte signale qu'on l'a activée ; ce que ça veut dire appartient au parent. Le rituel
  // y voit « retourne-toi », la fiche d'espèce « montre le sprite en grand ».
  it('émet « activate » au clic, sans se retourner de sa propre initiative', async () => {
    const w = mountCard({ provenance })
    await w.find('.pkc').trigger('click')
    expect(w.emitted('activate')).toHaveLength(1)
    expect(w.find('.pkc').classes()).not.toContain('is-flipped')
  })

  /**
   * Entrée ET Espace. Le pli scellé est un vrai `<button>`, donc Espace l'ouvre nativement ;
   * la carte est un `div` focalisable, où il ne se passe rien par défaut — et où Espace fait
   * même défiler la page. Sans ce traitement, le rituel s'ouvre au clavier mais ne se retourne
   * qu'à la souris.
   */
  it('s’active à Entrée comme à Espace', async () => {
    const w = mountCard({ provenance })
    expect(w.find('.pkc').attributes('tabindex')).toBe('0')
    expect(w.find('.pkc').attributes('role')).toBe('button')

    await w.find('.pkc').trigger('keyup.enter')
    expect(w.emitted('activate')).toHaveLength(1)

    await w.find('.pkc').trigger('keyup.space')
    expect(w.emitted('activate')).toHaveLength(2)
  })

  // Sans `.prevent` sur le keydown, la page saute d'un écran au moment même où l'on retourne.
  it('empêche Espace de faire défiler la page sous la carte', () => {
    const w = mountCard({ provenance })
    const evenement = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    w.find('.pkc').element.dispatchEvent(evenement)
    expect(evenement.defaultPrevented).toBe(true)
  })

  // La position du pointeur sert deux fois : au relief, et au déplacement du balayage de lumière.
  it('traduit la position du pointeur en inclinaison', async () => {
    const w = mountCard()
    await pointeSur(w, 200, 0)
    const style = w.find('.pkc').attributes('style')
    expect(style).toContain('--px: 1')
    expect(style).toContain('--py: 0')
    expect(style).toContain('--ry: 14deg')
    expect(style).toContain('--rx: 12deg')
  })

  it('revient à plat quand le pointeur s’en va', async () => {
    const w = mountCard()
    await pointeSur(w, 200, 0)
    await w.find('.pkc').trigger('pointerleave')
    const style = w.find('.pkc').attributes('style')
    expect(style).toContain('--rx: 0deg')
    expect(style).toContain('--ry: 0deg')
  })

  // Sur mobile il n'y a pas de survol : la carte doit rester entière sans l'inclinaison, et
  // on ne demande pas de permission de mouvement pour un effet décoratif.
  it('ignore le pointeur quand l’inclinaison est désactivée', async () => {
    const w = mountCard({ tiltable: false })
    await pointeSur(w, 200, 0)
    expect(w.find('.pkc').attributes('style') ?? '').not.toContain('--rx')
  })
})
