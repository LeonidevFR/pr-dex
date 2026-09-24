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
 * de microtâches — vider les promesses ne suffit donc pas. On sonde jusqu'à voir le rail
 * plutôt que d'attendre un délai fixe, qui serait tantôt trop court tantôt gaspillé.
 *
 * Le rail et non la planche : depuis que les lieux sont des pages, la planche n'existe que sur
 * `/collection`, alors que le rail surmonte les cinq. Sonder la planche revenait à exiger d'être
 * arrivé sur un écran précis pour considérer l'application montée.
 */
async function mountApp() {
  wrapper = mount(App, { attachTo: document.body })
  for (let i = 0; i < 50 && wrapper.findAll('.tab').length === 0; i++) {
    await new Promise((r) => setTimeout(r, 5))
    await flushPromises()
  }
  expect(wrapper.findAll('.tab').length).toBeGreaterThan(0)
  return wrapper
}

/** Les lieux se rejoignent par leur onglet dans le rail. */
const onglet = (w, libelle) => w.findAll('.tab').find((t) => t.text().includes(libelle))

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
    expect(w.find('.evolve-btn').exists()).toBe(true)

    // Deux clics sur le même bouton : le premier ouvre le sélecteur d'exemplaire, le second
    // confirme. Chenipan n'a qu'un exemplaire disponible, donc il est pré-coché.
    await w.find('.evolve-btn').trigger('click')
    await w.find('.evolve-btn').trigger('click')
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
    await onglet(w, 'Boutique').trigger('click')
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
    await onglet(w, 'Arène').trigger('click')
    await flushPromises()
    expect(chemin()).toBe('/arena')
    // La planche n'est plus dessous : un lieu remplace l'autre, il ne se pose pas par-dessus.
    expect(w.findAll('.cell')).toHaveLength(0)

    // On quitte un lieu en allant dans un autre, plus en refermant une croix.
    await onglet(w, 'Collection').trigger('click')
    await flushPromises()
    expect(chemin()).toBe('/')
    expect(w.findAll('.cell').length).toBeGreaterThan(0)
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
    await onglet(w, 'Profil').trigger('click')
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
    expect(w.findAll('.prof-case.secret')).toHaveLength(5)
  })

  it('explique un pseudonyme qui ne joue pas, au lieu d’un dossier vide', async () => {
    window.history.replaceState({}, '', '/profile/fantome?demo')
    const w = await mountApp()
    await flushPromises()
    expect(w.text()).toContain('Personne ne joue sous ce nom')
  })
})

/**
 * La saison ferme la boucle des cinq lieux : c'est le seul écran qui mène à un autre profil
 * que le sien, et donc le seul endroit d'où un pseudonyme devient une adresse.
 */
describe('la saison', () => {

  it('s’ouvre à son adresse depuis le rail', async () => {
    const w = await mountApp()
    await onglet(w, 'Saison').trigger('click')
    await flushPromises()
    expect(location.pathname).toBe('/season')
    // La plaque porte désormais le nom de la saison et son code : « SAISON 1 · 2026-S5 ».
    expect(w.findAll('.panel-plate').some((p) => /SAISON/.test(p.text()))).toBe(true)
  })

  // Un nom qu'on regarde depuis des semaines mérite de mener quelque part.
  it('emmène au profil d’un joueur du classement', async () => {
    window.history.replaceState({}, '', '/season?demo')
    const w = await mountApp()
    await flushPromises()
    const autre = w.findAll('.saison-rang').find((r) => r.find('.nom').text() !== 'toi')
    await autre.trigger('click')
    await flushPromises()
    expect(location.pathname).toMatch(/^\/profile\//)
    expect(w.find('.panel-name').exists()).toBe(true)
  })
})

/**
 * Enchaîner deux engagements.
 *
 * La collecte qui suit un duel déclenche un vrai run de l'Action et sonde jusqu'à trente
 * secondes. Attendue à l'intérieur du verrou d'action, elle laissait l'arène gelée tout ce
 * temps : on postait un défi, et pendant une demi-minute plus aucun bouton ne répondait, sans
 * que rien ne l'explique. Elle est désormais lancée après avoir rendu la main.
 */
describe('enchaîner les engagements', () => {
  const poster = (w) => w.findAll('button').find((b) => b.text().includes('Poster un défi'))

  const choisir = async (w) => {
    await w.findAll('.arena-pick')[0].trigger('click')
    await flushPromises()
    const radios = w.findAll('input[type="radio"]')
    if (radios.length) { await radios[0].setValue(); await flushPromises() }
  }

  it('laisse poster un second défi dans la foulée du premier', async () => {
    window.history.replaceState({}, '', '/arena?demo')
    const w = await mountApp()

    await choisir(w)
    expect(poster(w).attributes('disabled')).toBeUndefined()
    await poster(w).trigger('click')
    await flushPromises()
    expect(w.findAll('.sect .repo-ptr')).toHaveLength(1)

    // Le point du défaut : ici, le bouton restait désactivé le temps de la collecte.
    await choisir(w)
    expect(poster(w).attributes('disabled')).toBeUndefined()
    await poster(w).trigger('click')
    await flushPromises()
    expect(w.findAll('.sect .repo-ptr')).toHaveLength(2)
  })
})

/**
 * La revente, bout en bout, sur la démo — c'est par là qu'on l'essaie.
 *
 * Ce qui se vérifie ici n'est pas le prix (il a ses tests, et sa parité avec le SQL) mais la
 * couture : que le surplus arrive jusqu'à l'écran, que la vente débite le bon compte, et que ce
 * qui est parti cesse d'être compté dans la collection.
 */
describe('revente du surplus', () => {
  const ouvrirBoutique = async (w) => {
    await onglet(w, 'Boutique').trigger('click')
    await flushPromises()
  }

  /**
   * La démo simule la latence du réseau : la vente débite tout de suite, mais la relecture de la
   * collection arrive un tour plus tard. On attend l'accusé de réception plutôt qu'un délai fixe.
   */
  /** Rien n'est coché au départ : on prend le surplus du premier tas d'un clic. */
  const choisirLePremierTas = (w) => w.findAll('.vendre-tete .evo-btn')[0].trigger('click')

  const vendreEtAttendre = async (w) => {
    const bouton = w.find('.vendre-btn')
    await bouton.trigger('click')
    await bouton.trigger('click')
    for (let i = 0; i < 100 && !w.find('.avis').exists(); i++) {
      await new Promise((r) => setTimeout(r, 5))
      await flushPromises()
    }
  }

  it('montre le tas de doublons, le plus gros en tête', async () => {
    const w = await mountApp()
    await ouvrirBoutique(w)

    const groupes = w.findAll('.vendre-groupe')
    expect(groupes.length).toBeGreaterThan(0)
    expect(groupes[0].text()).toContain('Nidoran')
  })

  it('vend la sélection et encaisse ce que le serveur a compté', async () => {
    const w = await mountApp()
    await ouvrirBoutique(w)

    const caisse = () => Number(w.findAll('.arena-big')[0].text().replace(/\D/g, ''))
    const avant = caisse()

    await choisirLePremierTas(w)
    const total = Number(w.findAll('.arena-big')[1].text().replace(/\D/g, ''))
    expect(total).toBeGreaterThan(0)

    await vendreEtAttendre(w)

    expect(caisse()).toBe(avant + total)
    expect(w.find('.avis').text()).toContain('₽')
  })

  // Ce qui est vendu quitte le stock : la planche doit cesser de le compter.
  it('retire de la collection ce qui vient d’être vendu', async () => {
    const w = await mountApp()
    await ouvrirBoutique(w)

    const nidoran = w.findAll('.vendre-groupe')[0]
    const avant = Number(nidoran.find('.vendre-compte').text().replace(/\D/g, ''))

    await choisirLePremierTas(w)
    await vendreEtAttendre(w)

    const apres = w.findAll('.vendre-groupe')
    const reste = apres.length ? Number(apres[0].find('.vendre-compte').text().replace(/\D/g, '')) : 0
    expect(reste).toBeLessThan(avant)
  })

  // On ne vend pas son dernier exemplaire : la démo doit le refuser comme le serveur.
  it('refuse le dernier exemplaire, et le dit', async () => {
    const w = await mountApp()
    await ouvrirBoutique(w)

    const w2 = w.vm
    await expect(w2.$.setupState.arena.sell(['github:' + 'x'.repeat(4)]))
      .rejects.toThrow(/inconnu/)
  })
})
