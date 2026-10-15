import { ref } from 'vue'
import { DEX } from '../../shared/species.js'

/**
 * Le routage de l'application, sans bibliothèque.
 *
 * Cinq lieux, deux paramètres, une lecture d'URL : `vue-router` apporterait des gardes, des
 * routes imbriquées et un système de transitions dont rien ici ne se sert, pour trente
 * kilo-octets dans un paquet qui n'a aucune dépendance d'exécution.
 *
 * Les chemins sont en anglais — c'est ce qu'on lit dans une barre d'adresse — alors que
 * l'interface est en français. La correspondance est ici, et nulle part ailleurs.
 *
 * Contrainte du terrain : le site est servi par GitHub Pages sous `/pr-dex/`, qui distribue
 * des fichiers. `/pr-dex/arena` ne correspond à aucun fichier et renvoie un 404 — d'où le
 * `404.html` identique à `index.html` produit au build (voir `package.json`) : Pages le sert
 * pour toute URL inconnue, l'application démarre et lit `location.pathname`. Le préfixe est
 * dans l'URL sans jamais faire partie de la route, et c'est `BASE_URL` qui le porte, pour que
 * le jour où un vrai domaine arrive il n'y ait qu'une ligne de configuration à changer.
 */
/**
 * Les lieux, et leur adresse. Les cinq premiers sont les onglets du rail ; le sixième n'en a
 * pas, parce qu'on n'y va jamais de soi-même — on y arrive par un lien ou par un nom cliqué
 * dans un classement.
 *
 * Il y en a eu sept, dont quatre repliés sous un onglet « Arène » avec leur propre barre.
 * Ce second niveau venait d'un classement par famille — la collection d'un côté, l'arène de
 * l'autre — qui dédoublait les écrans : deux classements des mêmes personnes, deux pages « ce
 * que j'ai ». Regroupés par fonction, ils tiennent en cinq sans second niveau.
 */
export const ROUTES = ['collection', 'duels', 'shop', 'classements', 'moi', 'profile']

/** Seuls ces deux lieux désignent quelque chose de précis : une espèce, une personne. */
const AVEC_PARAM = { collection: 'species', profile: 'login' }

const DEFAUT = { name: 'collection', param: null }

/** Retire le préfixe de déploiement et les barres superflues : reste le chemin de l'application. */
function nu(chemin, base) {
  const prefixe = base.replace(/\/$/, '')
  let reste = chemin.startsWith(prefixe) ? chemin.slice(prefixe.length) : chemin
  return reste.replace(/^\/+/, '').replace(/\/+$/, '')
}

export function parseRoute(chemin, base = import.meta.env.BASE_URL) {
  const [lieu, brut] = nu(chemin, base).split('/')
  if (!lieu || !ROUTES.includes(lieu)) return { ...DEFAUT }

  const attendu = AVEC_PARAM[lieu]
  if (!attendu || brut === undefined || brut === '') return { name: lieu, param: null }

  if (attendu === 'login') return { name: lieu, param: decodeURIComponent(brut) }

  // Une espèce hors planche vient d'une URL bricolée ou d'un lien périmé : on retombe sur la
  // planche plutôt que d'ouvrir une fiche vide.
  const id = Number(brut)
  return { name: lieu, param: Number.isInteger(id) && DEX[id] ? id : null }
}

export function routePath(route, base = import.meta.env.BASE_URL) {
  const prefixe = base.endsWith('/') ? base : base + '/'
  const { name, param } = route
  if (name === 'collection' && param == null) return prefixe
  if (param == null) return prefixe + name
  const suffixe = name === 'collection' ? String(param).padStart(3, '0') : encodeURIComponent(param)
  return `${prefixe}${name}/${suffixe}`
}

/**
 * Renvoie la route courante et de quoi en changer. `stop()` existe pour les tests et pour un
 * démontage propre : un écouteur `popstate` qui survit à son application rejouerait des
 * navigations dans le vide.
 */
export function createRouter(base = import.meta.env.BASE_URL) {
  const route = ref(parseRoute(location.pathname, base))

  const relire = () => { route.value = parseRoute(location.pathname, base) }
  window.addEventListener('popstate', relire)

  function go(name, param = null) {
    const suivante = parseRoute(routePath({ name, param }, base), base)
    // Deux clics sur le même onglet n'ont aucune raison d'empiler deux entrées d'historique :
    // il faudrait sinon appuyer deux fois sur « retour » pour revenir d'où l'on vient.
    if (suivante.name === route.value.name && suivante.param === route.value.param) return
    // La requête suit la navigation : `?demo` et `?teaser` sont des modes de session, lus au
    // démarrage. Les perdre au premier clic d'onglet renvoyait la démonstration sur l'écran de
    // connexion au premier rechargement.
    history.pushState({}, '', routePath(suivante, base) + location.search)
    route.value = suivante
  }

  return { route, go, stop: () => window.removeEventListener('popstate', relire) }
}
