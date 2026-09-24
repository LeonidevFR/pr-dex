import { DEX } from '../../shared/species.js'
import { salePrice } from '../../shared/arena-economy.js'

/**
 * À partir de ce niveau, un exemplaire n'est plus du déchet mais un investissement : il a gagné
 * des duels pour l'atteindre. Il reste vendable — on ne décide pas à la place du joueur — mais il
 * n'est jamais présélectionné.
 */
export const NIVEAU_INVESTI = 5

/**
 * Le meilleur exemplaire d'une espèce, celui qu'on garde : le shiny d'abord, le plus aguerri
 * ensuite. C'est ce que garderait n'importe qui, et c'est donc ce que la sélection par défaut
 * doit épargner sans qu'on ait à le lui dire.
 */
const meilleur = (items) => [...items].sort(
  (a, b) => (b.shiny - a.shiny) || (b.level - a.level) || a.key.localeCompare(b.key),
)[0]

/**
 * Le surplus vendable, groupé par espèce.
 *
 * Groupé, parce que le besoin est « je veux ne plus avoir douze Nidoran », pas « je veux vendre
 * l'exemplaire github:4f3a ». Une liste plate de cent exemplaires ferait de la revente une
 * seconde corvée, ce qui raterait entièrement le problème qu'elle résout.
 *
 * `preselect` porte la réponse en un geste : tout le surplus, moins celui qu'on garde, moins les
 * shinies et les exemplaires déjà investis. Le défaut est donc toujours sûr — on peut confirmer
 * sans lire, et lire seulement si l'on veut plus.
 *
 * @param {Array<{species:number, key:string, shiny?:boolean}>} disponibles — le stock en main
 * @param {(key:string) => number} levelOf — le niveau d'un exemplaire, 1 par défaut
 */
export function saleGroups(disponibles, levelOf = () => 1) {
  const parEspece = new Map()
  for (const e of disponibles) {
    if (!DEX[e.species]) continue
    if (!parEspece.has(e.species)) parEspece.set(e.species, [])
    parEspece.get(e.species).push({
      key: e.key,
      level: levelOf(e.key) ?? 1,
      shiny: !!e.shiny,
    })
  }

  const groupes = []
  for (const [species, items] of parEspece) {
    // Un exemplaire unique n'est pas du surplus : on ne vend pas son dernier, le serveur le
    // refuserait, et le proposer serait promettre ce qui sera repris.
    if (items.length < 2) continue

    const garde = meilleur(items).key
    const complets = items
      .map((i) => ({
        ...i,
        price: salePrice(species, i.level, i.shiny),
        keeper: i.key === garde,
        preselect: i.key !== garde && !i.shiny && i.level < NIVEAU_INVESTI,
      }))
      .sort((a, b) => a.price - b.price || a.key.localeCompare(b.key))

    groupes.push({
      species,
      name: DEX[species].name,
      tier: DEX[species].tier,
      items: complets,
      preselected: complets.filter((i) => i.preselect).map((i) => i.key),
    })
  }

  // Le plus gros tas d'abord : c'est celui qui encombre, donc celui qu'on est venu traiter.
  return groupes.sort((a, b) => b.items.length - a.items.length || a.species - b.species)
}

/** Ce que rapporterait une sélection, au prix que le serveur appliquera. */
export const saleTotal = (groupes, choisies) => groupes
  .flatMap((g) => g.items)
  .filter((i) => choisies.has(i.key))
  .reduce((n, i) => n + i.price, 0)
