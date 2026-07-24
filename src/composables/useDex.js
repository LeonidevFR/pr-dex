import { computed } from 'vue'
import { DEX, familyOf, hasEvoInFamily, CANDY_PER_CATCH } from '../../shared/species.js'

/**
 * Dérive tout l'état affichable de `catches.json` et `state.json`. Aucun effet de bord,
 * aucune écriture : c'est `useCollection` qui décide, celui-ci ne fait que déduire.
 *
 * @param {import('vue').Ref<Array>} catches — entrées écrites par l'Action, append-only
 * @param {import('vue').Ref<Object>} state  — { claimed, spent, evolutions } écrit par le front
 */
export function useDex(catches, state) {
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

  const claimedSet = computed(() => new Set(state.value.claimed))

  // `key` identifie un exemplaire précis, capture de PR ou évolution, indépendamment de
  // l'espèce : une capture de PR se reconnaît par son sha, une évolution par son rang dans
  // `state.evolutions` (append-only, donc stable). Sert à savoir quel exemplaire précis a été
  // consommé par une évolution ultérieure.
  const claimed = computed(() =>
    catches.value.filter((c) => claimedSet.value.has(c.sha))
      .map((c) => ({ ...c, via: 'pr', key: c.sha })).sort(byDate),
  )

  const pending = computed(() =>
    catches.value.filter((c) => !claimedSet.value.has(c.sha)).map((c) => ({ ...c, via: 'pr' })).sort(byDate),
  )

  // Le chromatique est hérité de la capture précise qui a évolué, identifiée par sa clé.
  // Construit par accumulation (pas de simple `.map`) : une évolution en chaîne (ex. Ivysaur →
  // Venusaur) doit pouvoir retrouver un exemplaire produit par une évolution précédente, pas
  // seulement une capture de PR. `fromSha` reste lu pour les entrées écrites par une version
  // antérieure (avant l'introduction de `fromKey`).
  const evolved = computed(() => {
    const result = []
    state.value.evolutions.forEach((e, i) => {
      const pool = [...claimed.value, ...result]
      const fromKey = e.fromKey ?? e.fromSha
      const source = fromKey ? pool.find((c) => c.key === fromKey) : pool.find((c) => c.species === e.from)
      result.push({ ...e, via: 'evo', shiny: source?.shiny ?? false, key: `evo:${i}` })
    })
    return result
  })

  const bySpecies = computed(() => {
    const map = {}
    for (const e of [...claimed.value, ...evolved.value]) (map[e.species] ??= []).push(e)
    return map
  })

  const caughtCount = computed(() => Object.keys(bySpecies.value).length)

  // Un exemplaire consommé par une évolution ne compte plus dans le stock courant — mais
  // l'espèce reste acquise pour toujours dans `bySpecies` (le Pokédex garde ce qui a été vu,
  // même si le dernier exemplaire a servi à évoluer).
  const consumedKeys = computed(
    () => new Set(state.value.evolutions.map((e) => e.fromKey ?? e.fromSha).filter(Boolean)),
  )

  function availableEntries(id) {
    return (bySpecies.value[id] ?? []).filter((e) => !consumedKeys.value.has(e.key))
  }

  function copyCount(id) {
    return availableEntries(id).length
  }

  /**
   * Bonbons disponibles pour la famille de `id`. Seules les captures de PR en produisent :
   * une évolution consomme, elle ne crédite pas.
   *
   * Fonction simple et non `computed` : un `computed` qui ne fait que renvoyer une closure
   * ne mémoïse rien — sa propre dépendance est vide. La réactivité vient des `.value` lus
   * à l'appel, que le rendu d'un template suit correctement.
   */
  function candies(id) {
    const fam = familyOf(id)
    const earned = claimed.value.filter((e) => familyOf(e.species) === fam).length * CANDY_PER_CATCH
    return earned - (state.value.spent[fam] ?? 0)
  }

  // Une évolution consomme un exemplaire précis : sans stock disponible, plus de matière à
  // évoluer, même si l'espèce reste acquise et même si la famille a encore des bonbons.
  function canEvolve(id) {
    const s = DEX[id]
    if (!s?.to) return false
    if (copyCount(id) < 1) return false
    return candies(id) >= s.cost
  }

  function isDeadEnd(id) {
    return !hasEvoInFamily(id)
  }

  /**
   * Espèce jamais rencontrée : absente de `bySpecies`, donc ni capturée-ouverte ni obtenue par
   * évolution — la même définition que `caughtCount`, pour que le marqueur du rituel et le
   * compteur du rail ne puissent pas se contredire. Une capture encore en attente ne compte
   * pas : tant que le pli n'est pas ouvert, l'espèce n'a pas été vue.
   */
  function isNewSpecies(id) {
    return !bySpecies.value[id]
  }

  // Grille : quelles cases capturées ont de quoi évoluer maintenant, pour un badge discret —
  // la décision reste au joueur, ceci ne fait que la rendre visible sans ouvrir chaque fiche.
  const evolvableIds = computed(
    () => new Set(Object.keys(bySpecies.value).map(Number).filter((id) => canEvolve(id))),
  )

  return {
    claimed, pending, evolved, bySpecies, caughtCount, candies, canEvolve, isDeadEnd, evolvableIds,
    availableEntries, copyCount, isNewSpecies,
  }
}
