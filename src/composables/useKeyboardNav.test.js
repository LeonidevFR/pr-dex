import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useKeyboardNav } from './useKeyboardNav.js'

// `attachTo` est indispensable : sans insertion dans le document, `document.activeElement`
// reste `<body>` et la garde sur l'élément focalisé ne peut pas être testée.
const host = (opts) =>
  mount(
    { setup: () => useKeyboardNav(opts), template: '<button class="b">x</button>' },
    { attachTo: document.body },
  )

const press = (key, over = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...over }))

afterEach(() => { document.body.innerHTML = '' })

const opts = (over = {}) => ({
  blocked: ref(false), onSpace: vi.fn(), onEscape: vi.fn(), ...over,
})

describe('Espace', () => {
  it('déclenche l’action principale au repos', () => {
    const o = opts(); host(o)
    press(' ')
    expect(o.onSpace).toHaveBeenCalledTimes(1)
  })

  it('supprime le défilement de la page', () => {
    host(opts())
    const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  // Maintenir la touche enfoncée ouvrirait sinon toute la file d'un coup.
  it('ignore la répétition automatique', () => {
    const o = opts(); host(o)
    press(' ', { repeat: true })
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  it('ignore les combinaisons à modificateur', () => {
    const o = opts(); host(o)
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) press(' ', { [mod]: true })
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  it('ne fait rien quand un overlay est ouvert — cet état relève de son propre focus', () => {
    const o = opts({ blocked: ref(true) }); host(o)
    press(' ')
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  // Sans cette absorption, le bouton resté focalisé DERRIÈRE l'overlay se ré-active :
  // « Ouvrir » remettrait la file au premier pli.
  it('absorbe quand même l’événement pendant qu’un overlay est ouvert', () => {
    host(opts({ blocked: ref(true) }))
    const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  // Sinon Espace sur le bouton « filtrer » ouvrirait le deck au lieu de replier les filtres.
  it('laisse la main quand le focus est déjà sur un élément interactif', () => {
    const o = opts(); const w = host(o)
    w.find('.b').element.focus()
    press(' ')
    expect(o.onSpace).not.toHaveBeenCalled()
  })

  it('ignore les autres touches', () => {
    const o = opts(); host(o)
    press('a'); press('Enter')
    expect(o.onSpace).not.toHaveBeenCalled()
  })
})

describe('Échap', () => {
  it('ferme même quand un overlay est ouvert — c’est tout son intérêt', () => {
    const o = opts({ blocked: ref(true) }); host(o)
    press('Escape')
    expect(o.onEscape).toHaveBeenCalledTimes(1)
  })

  it('agit aussi quand le focus est sur un élément interactif', () => {
    const o = opts(); const w = host(o)
    w.find('.b').element.focus()
    press('Escape')
    expect(o.onEscape).toHaveBeenCalledTimes(1)
  })
})

describe('cycle de vie', () => {
  it('retire l’écouteur au démontage', () => {
    const o = opts(); const w = host(o)
    w.unmount()
    press(' ')
    expect(o.onSpace).not.toHaveBeenCalled()
  })
})
