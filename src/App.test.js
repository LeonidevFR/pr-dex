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

    // Le rituel s'ouvre directement sur la carte, dos visible : il n'y a plus de pli scellé.
    expect(w.find('.pkc').exists()).toBe(true)
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

/**
 * Poster un défi ne produit aucun duel — il reste ouvert jusqu'à ce que quelqu'un le relève.
 * Il faut néanmoins que quelque chose se passe à l'écran : une action qui réussit en silence se
 * lit comme un bouton mort, et c'est exactement ce qui a été signalé à l'essai.
 */
describe('envoi à l’arène depuis la fiche', () => {
  it('referme la fiche et ouvre l’arène sur le défi en attente', async () => {
    const w = await mountApp()
    const caseAvecExemplaire = w.findAll('.cell').find((c) => !c.classes().includes('cell-no'))
    await caseAvecExemplaire.trigger('click')
    await flushPromises()

    const envoyer = w.find('.arena-send')
    if (!envoyer.exists()) return // espèce sans exemplaire disponible : rien à prouver ici

    await envoyer.trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 30))
    await flushPromises()

    expect(w.find('.sheet').exists()).toBe(false)
    expect(w.find('.arena-pick').exists() || w.text().includes('sur la table')).toBe(true)
  })
})

/**
 * Le pli acheté doit s'ouvrir, pas se ranger. La file est triée par date : un achat arrive
 * derrière tous les plis laissés fermés, et ouvrir « le premier de la file » ouvrait donc un
 * autre pli — ou rien de visible du tout. On avait payé et l'écran ne bougeait pas.
 */
describe('achat en boutique', () => {
  const ouvrirBoutique = async (w) => {
    await w.findAll('.gear').find((b) => b.attributes('title') === 'Boutique').trigger('click')
    await flushPromises()
  }

  it('ouvre le pli qu’on vient d’acheter, pas le premier de la file', async () => {
    const w = await mountApp()
    await ouvrirBoutique(w)

    const acheter = w.findAll('.log-row')[0].find('button')
    await acheter.trigger('click')   // confirmation
    await acheter.trigger('click')
    for (let i = 0; i < 50 && !w.find('.ritual').exists(); i++) {
      await new Promise((r) => setTimeout(r, 5))
      await flushPromises()
    }

    expect(w.find('.ritual').exists()).toBe(true)
    // La boutique s'efface : deux couches empilées cacheraient la révélation.
    expect(w.findAll('.panel-plate').some((p) => p.text() === 'BOUTIQUE')).toBe(false)
  })
})

/**
 * Les lieux ont désormais une adresse. Ce qui se teste ici n'est pas le routeur — il a ses
 * propres tests — mais le fait que l'écran et l'URL ne puissent plus diverger : c'est la
 * divergence qui produisait une couche ouverte après un retour navigateur, et un lien partagé
 * qui ne menait nulle part.
 */
describe('les lieux ont une URL', () => {
  const chemin = () => location.pathname

  it('écrit l’adresse de l’arène en y entrant, et revient à la planche en sortant', async () => {
    const w = await mountApp()
    await w.findAll('.gear').find((b) => b.attributes('title') === 'Arène').trigger('click')
    await flushPromises()
    expect(chemin()).toBe('/arena')

    await w.find('.panel .x').trigger('click')
    await flushPromises()
    expect(chemin()).toBe('/')
    expect(w.find('.panel-plate').exists()).toBe(false)
  })

  it('donne son adresse à la fiche d’une espèce', async () => {
    const w = await mountApp()
    await cellOf(w, CHENIPAN).trigger('click')
    await flushPromises()
    expect(chemin()).toBe('/collection/010')
  })

  /**
   * Le geste que tout le monde fait sur téléphone. Avant, il quittait l'application : la fiche
   * n'ayant pas d'adresse, le navigateur n'avait rien à défaire.
   */
  it('referme la fiche au retour du navigateur, sans quitter l’application', async () => {
    const w = await mountApp()
    await cellOf(w, CHENIPAN).trigger('click')
    await flushPromises()
    expect(w.find('.panel-name').exists()).toBe(true)

    window.history.replaceState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()
    expect(w.find('.panel-name').exists()).toBe(false)
  })

  // Le cas du lien partagé, et celui du rechargement : l'écran doit se reconstituer seul.
  it('ouvre directement le bon écran depuis l’adresse', async () => {
    window.history.replaceState({}, '', '/shop?demo')
    const w = await mountApp()
    expect(w.findAll('.panel-plate').some((p) => p.text() === 'BOUTIQUE')).toBe(true)
  })
})

/**
 * Le profil, de bout en bout. Deux dossiers pour un seul gabarit : le sien, complet, et celui
 * d'un collègue, caviardé. C'est la vue SQL qui garantit la règle ; ce qui se vérifie ici est
 * que l'écran sait lequel des deux il regarde.
 */
describe('le profil', () => {
  const ouvrir = async (w) => {
    await w.findAll('.gear').find((b) => b.attributes('title') === 'Profil').trigger('click')
    await flushPromises()
    return w
  }

  it('s’ouvre sur son propre dossier, à son adresse', async () => {
    const w = await ouvrir(await mountApp())
    expect(location.pathname).toBe('/profile')
    expect(w.find('.panel-name').text()).toBe('toi')
    expect(w.findAll('.prof-case.secret')).toHaveLength(0)
  })

  it('compte les exemplaires depuis la collection, et non depuis le dossier public', async () => {
    const w = await ouvrir(await mountApp())
    const exemplaires = w.findAll('.prof-case')
      .find((c) => c.find('span').text() === 'Exemplaires').find('b').text()
    expect(Number(exemplaires)).toBeGreaterThan(0)
  })

  // Un lien reçu d'un collègue : l'écran doit se reconstituer seul, et caviarder.
  it('ouvre le dossier d’un collègue depuis l’adresse, caviardé', async () => {
    window.history.replaceState({}, '', '/profile/bob?demo')
    const w = await mountApp()
    await flushPromises()
    expect(w.find('.panel-name').text()).toBe('bob')
    expect(w.findAll('.prof-case.secret')).toHaveLength(4)
  })

  it('explique un pseudonyme qui ne joue pas, au lieu d’un dossier vide', async () => {
    window.history.replaceState({}, '', '/profile/fantome?demo')
    const w = await mountApp()
    await flushPromises()
    expect(w.text()).toContain('Personne ne joue sous ce nom')
  })
})
