import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import App from './App.vue'

// `useAuth` construit un client Supabase au chargement du module et interroge le réseau dès
// l'appel : monter App.vue pour de vrai suppose de le remplacer. La session reste nulle —
// c'est le mode démo, plus bas, qui fait entrer l'application dans son état connecté.
vi.mock('./composables/useAuth.js', () => ({
  useAuth: () => ({ session: ref(null), ready: ref(true), signInWithGithub: () => {}, signOut: () => {} }),
}))

let wrapper = null

// Le rituel comme la cérémonie d'évolution consultent `prefers-reduced-motion` : jsdom n'a pas
// de `matchMedia`, et sans lui le montage jette avant d'avoir rien affiché.
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  window.history.replaceState({}, '', '/?demo')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/**
 * `attachTo` n'est pas un détail : sans insertion dans le document, `document.activeElement`
 * reste figé sur `<body>` et toute la discipline de focus testée ici devient invérifiable.
 * Le chargement de la démo passe par un `import()` dynamique : au tout premier montage, Vite
 * doit encore transformer le module, ce qui coûte du vrai temps et non un simple tour de boucle
 * de microtâches — vider les promesses ne suffit donc pas. On sonde jusqu'à voir la planche
 * plutôt que d'attendre un délai fixe, qui serait tantôt trop court tantôt gaspillé.
 */
async function mountApp() {
  wrapper = mount(App, { attachTo: document.body })
  for (let i = 0; i < 50 && wrapper.findAll('.cell').length === 0; i++) {
    await new Promise((r) => setTimeout(r, 5))
    await flushPromises()
  }
  expect(wrapper.findAll('.cell').length).toBeGreaterThan(0)
  return wrapper
}

const press = (key, over = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...over }))

/** La case de la planche d'une espèce donnée, repérée par son numéro à trois chiffres. */
const cellOf = (w, id) =>
  w.findAll('.cell').find((c) => c.find('.cell-no').text() === String(id).padStart(3, '0'))

// Chenipan (010) a de quoi évoluer dans la démo, et sa forme obtenue — Chrysacier (011) —
// n'est pas encore à la planche : le seul couple qui rende le marqueur « Nouveau » observable.
const CHENIPAN = 10

describe('évolution', () => {
  /**
   * Le garde-fou du piège central : `collection.evolve()` inscrit l'espèce cible au dex dès
   * l'appel, donc `isNewSpecies(to)` doit être lu AVANT le `await`. Une lecture après coup
   * répondrait toujours « déjà rencontrée » et la puce ne s'allumerait plus jamais. Ce test
   * part du vrai bouton de la fiche pour couvrir la chaîne complète, seul endroit où le piège
   * se manifeste — monter l'overlay avec une valeur locale ne le verrait pas.
   */
  it('allume la puce « Nouveau » quand la forme obtenue n’était pas encore à la planche', async () => {
    const w = await mountApp()

    await cellOf(w, CHENIPAN).trigger('click')
    expect(w.find('.evo-btn:not(.arena-send)').exists()).toBe(true)

    // Deux clics sur le même bouton : le premier ouvre le sélecteur d'exemplaire, le second
    // confirme. Chenipan n'a qu'un exemplaire disponible, donc il est pré-coché.
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    await w.find('.evo-btn:not(.arena-send)').trigger('click')
    await flushPromises()

    expect(w.find('.evostage').exists()).toBe(true)
    expect(w.find('.new-chip').exists()).toBe(true)
  })
})

describe('navigation au clavier', () => {
  // La promesse « tout faire à la touche Espace » commence ici : depuis l'accueil au repos,
  // Espace doit ouvrir le deck sur son premier pli scellé.
  it('ouvre le rituel avec Espace depuis l’accueil', async () => {
    const w = await mountApp()

    press(' ')
    await flushPromises()

    expect(w.find('.packet').exists()).toBe(true)
  })

  /**
   * La fiche et les réglages n'ont pas de discipline de focus : leur déclencheur garde le
   * focus derrière le scrim. Si Échap le laisse là, l'Espace suivant réactive nativement la
   * case et rouvre la fiche qu'on vient de fermer — Échap/Espace boucle indéfiniment.
   */
  it('rend le focus au repos quand Échap ferme une fiche', async () => {
    const w = await mountApp()

    const cell = cellOf(w, CHENIPAN)
    cell.element.focus()
    await cell.trigger('click')
    expect(w.find('.panel').exists()).toBe(true)
    expect(document.activeElement).toBe(cell.element)

    press('Escape')
    await flushPromises()

    expect(w.find('.panel').exists()).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })

  // Un overlay ouvert possède Espace : la spécification veut qu'il ne fasse rien sur une fiche,
  // et surtout pas qu'il ouvre le deck par-dessus.
  it('n’ouvre pas le rituel avec Espace quand une fiche est ouverte', async () => {
    const w = await mountApp()

    await cellOf(w, CHENIPAN).trigger('click')
    expect(w.find('.panel').exists()).toBe(true)

    press(' ')
    await flushPromises()

    expect(w.find('.packet').exists()).toBe(false)
    expect(w.find('.panel').exists()).toBe(true)
  })
})
