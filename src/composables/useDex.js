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

  const claimed = computed(() =>
    catches.value.filter((c) => claimedSet.value.has(c.sha)).map((c) => ({ ...c, via: 'pr' })).sort(byDate),
  )

  const pending = computed(() =>
    catches.value.filter((c) => !claimedSet.value.has(c.sha)).map((c) => ({ ...c, via: 'pr' })).sort(byDate),
  )

  // Le chromatique est hérité de la capture précise qui a évolué, identifiée par son sha.
  // Sans `fromSha` (entrée écrite par une version antérieure), on retombe sur la première
  // capture de l'espèce source — au mieux ambigu, d'où l'enregistrement du sha désormais.
  const evolved = computed(() =>
    state.value.evolutions.map((e) => {
      const source = e.fromSha
        ? claimed.value.find((c) => c.sha === e.fromSha)
        : claimed.value.find((c) => c.species === e.from)
      return { ...e, via: 'evo', shiny: source?.shiny ?? false }
    }),
  )

  const bySpecies = computed(() => {
    const map = {}
    for (const e of [...claimed.value, ...evolved.value]) (map[e.species] ??= []).push(e)
    return map
  })

  const caughtCount = computed(() => Object.keys(bySpecies.value).length)

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

  function canEvolve(id) {
    const s = DEX[id]
    if (!s?.to) return false
    if (!bySpecies.value[id]) return false
    return candies(id) >= s.cost
  }

  function isDeadEnd(id) {
    return !hasEvoInFamily(id)
  }

  return { claimed, pending, evolved, bySpecies, caughtCount, candies, canEvolve, isDeadEnd }
}
