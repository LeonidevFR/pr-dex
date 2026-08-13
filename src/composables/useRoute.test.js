import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseRoute, routePath, createRouter } from './useRoute.js'

/**
 * Le routing tient sur GitHub Pages, qui sert des fichiers : `/arena` n'existe pas sur le
 * disque et renvoie un 404. La parade est un `404.html` identique à `index.html` — Pages le
 * sert pour toute URL inconnue, l'application démarre et lit `location.pathname`. C'est donc
 * cette lecture-là qui doit être irréprochable, et le préfixe du dépôt (`/pr-dex/`) en fait
 * partie : il est dans l'URL sans jamais faire partie de la route.
 */
describe('parseRoute', () => {
  const parse = (chemin, base = '/pr-dex/') => parseRoute(chemin, base)

  it('mène à la collection par défaut, à la racine comme à la base', () => {
    expect(parse('/pr-dex/')).toEqual({ name: 'collection', param: null })
    expect(parse('/pr-dex')).toEqual({ name: 'collection', param: null })
    expect(parse('/', '/')).toEqual({ name: 'collection', param: null })
  })

  it('reconnaît les lieux qui ont un écran', () => {
    for (const nom of ['collection', 'arena', 'season', 'shop', 'profile']) {
      expect(parse(`/pr-dex/${nom}`)).toEqual({ name: nom, param: null })
    }
  })

  // Le seul lien qu'on ait envie d'envoyer à un collègue, avec la fiche d'une espèce.
  it('lit le pseudo d’un profil, et le laisse en texte', () => {
    expect(parse('/pr-dex/profile/marion')).toEqual({ name: 'profile', param: 'marion' })
    expect(parse('/pr-dex/profile')).toEqual({ name: 'profile', param: null })
  })

  it('tolère la barre finale, que le navigateur ajoute ou non', () => {
    expect(parse('/pr-dex/arena/')).toEqual({ name: 'arena', param: null })
  })

  // Le seul lien qu'on ait envie d'envoyer à un collègue : une espèce, ou un profil.
  it('lit le numéro d’espèce, et le rend en nombre', () => {
    expect(parse('/pr-dex/collection/025')).toEqual({ name: 'collection', param: 25 })
    expect(parse('/pr-dex/collection/151')).toEqual({ name: 'collection', param: 151 })
  })

  // Une espèce hors planche viendrait d'une URL bricolée ou d'un lien périmé : on retombe sur
  // la planche plutôt que d'ouvrir une fiche vide.
  it('refuse un numéro d’espèce hors bornes ou non numérique', () => {
    expect(parse('/pr-dex/collection/000')).toEqual({ name: 'collection', param: null })
    expect(parse('/pr-dex/collection/999')).toEqual({ name: 'collection', param: null })
    expect(parse('/pr-dex/collection/pikachu')).toEqual({ name: 'collection', param: null })
  })

  it('renvoie à la collection pour un lieu inconnu', () => {
    expect(parse('/pr-dex/nawak')).toEqual({ name: 'collection', param: null })
  })

  // Seuls la collection et le profil portent un paramètre : `/arena/quelquechose` n'a pas de sens.
  it('ignore un paramètre sur un lieu qui n’en prend pas', () => {
    expect(parse('/pr-dex/arena/42')).toEqual({ name: 'arena', param: null })
  })
})

describe('routePath', () => {
  it('reconstruit une URL complète, préfixe compris', () => {
    expect(routePath({ name: 'arena' }, '/pr-dex/')).toBe('/pr-dex/arena')
    expect(routePath({ name: 'collection', param: 25 }, '/pr-dex/')).toBe('/pr-dex/collection/025')
    expect(routePath({ name: 'shop' }, '/pr-dex/')).toBe('/pr-dex/shop')
    expect(routePath({ name: 'profile', param: 'marion' }, '/pr-dex/')).toBe('/pr-dex/profile/marion')
  })

  it('fait de la collection la racine, pour que l’URL par défaut reste courte', () => {
    expect(routePath({ name: 'collection' }, '/pr-dex/')).toBe('/pr-dex/')
    expect(routePath({ name: 'collection' }, '/')).toBe('/')
  })

  // Ce qui est écrit doit se relire : sans ça une URL partagée mènerait ailleurs qu'à l'écran
  // d'où elle a été copiée.
  it('se relit à l’identique', () => {
    const routes = [
      { name: 'collection', param: null }, { name: 'collection', param: 25 },
      { name: 'arena', param: null }, { name: 'shop', param: null },
      { name: 'profile', param: null }, { name: 'profile', param: 'marion' },
      { name: 'season', param: null },
    ]
    for (const r of routes) expect(parseRoute(routePath(r, '/pr-dex/'), '/pr-dex/')).toEqual(r)
  })
})

describe('createRouter', () => {
  let router = null

  beforeEach(() => {
    window.history.replaceState({}, '', '/collection')
  })
  afterEach(() => {
    router?.stop()
    router = null
  })

  const monte = () => (router = createRouter('/'))

  it('part de l’URL courante', () => {
    window.history.replaceState({}, '', '/arena')
    expect(monte().route.value).toEqual({ name: 'arena', param: null })
  })

  it('écrit l’URL en naviguant, sans recharger', () => {
    const r = monte()
    r.go('shop')
    expect(location.pathname).toBe('/shop')
    expect(r.route.value).toEqual({ name: 'shop', param: null })
  })

  it('emmène le paramètre', () => {
    const r = monte()
    r.go('collection', 25)
    expect(location.pathname).toBe('/collection/025')
    expect(r.route.value).toEqual({ name: 'collection', param: 25 })
  })

  /**
   * Le retour du navigateur doit refermer une fiche, pas quitter l'application : c'est le
   * geste que tout le monde fait sur téléphone, et il est perdu tant que la fiche n'a pas
   * d'URL.
   */
  it('suit le bouton retour du navigateur', async () => {
    const r = monte()
    r.go('collection', 25)
    window.history.replaceState({}, '', '/collection')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(r.route.value).toEqual({ name: 'collection', param: null })
  })

  // Deux clics sur le même onglet n'ont aucune raison d'empiler deux entrées d'historique :
  // il faudrait alors appuyer deux fois sur « retour » pour revenir d'où l'on vient.
  it('n’empile pas deux fois la même route', () => {
    const r = monte()
    const avant = history.length
    r.go('arena'); r.go('arena'); r.go('arena')
    expect(history.length).toBeLessThanOrEqual(avant + 1)
  })

  it('nettoie son écouteur à l’arrêt', () => {
    const retire = vi.spyOn(window, 'removeEventListener')
    monte().stop()
    expect(retire).toHaveBeenCalledWith('popstate', expect.any(Function))
    router = null
  })
})
