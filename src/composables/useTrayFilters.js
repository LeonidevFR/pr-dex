import { ref, computed } from 'vue'
import { TIER_LABEL } from '../../shared/species.js'

const TIERS = Object.keys(TIER_LABEL)

/** État des filtres du tiroir (paliers + statut de capture). Pure UI, aucun effet de bord. */
export function useTrayFilters() {
  const open = ref(false)
  const activeTiers = ref(new Set(TIERS))
  const caughtFilter = ref('all') // 'all' | 'caught' | 'uncaught'

  const active = computed(() => activeTiers.value.size < TIERS.length || caughtFilter.value !== 'all')

  // Ne jamais désactiver le dernier palier restant : un filtre qui vide la grille en
  // silence est pire qu'un clic ignoré.
  function toggleTier(t) {
    const next = new Set(activeTiers.value)
    if (next.has(t)) { if (next.size > 1) next.delete(t) } else next.add(t)
    activeTiers.value = next
  }

  function setCaughtFilter(v) {
    caughtFilter.value = v
  }

  function reset() {
    activeTiers.value = new Set(TIERS)
    caughtFilter.value = 'all'
  }

  return { open, activeTiers, caughtFilter, active, toggleTier, setCaughtFilter, reset }
}
