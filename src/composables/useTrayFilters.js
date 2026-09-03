import { ref, computed } from 'vue'
import { TIER_LABEL } from '../../shared/species.js'

const TIERS = Object.keys(TIER_LABEL)

/** État des filtres du tiroir (paliers + statut de l'espèce). Pure UI, aucun effet de bord. */
export function useTrayFilters() {
  const open = ref(false)
  const activeTiers = ref(new Set(TIERS))
  const statusFilter = ref('all') // 'all' | 'caught' | 'uncaught' | 'evolvable'

  const active = computed(
    () => activeTiers.value.size < TIERS.length || statusFilter.value !== 'all',
  )

  // Ne jamais désactiver le dernier palier restant : un filtre qui vide la grille en
  // silence est pire qu'un clic ignoré.
  function toggleTier(t) {
    const next = new Set(activeTiers.value)
    if (next.has(t)) { if (next.size > 1) next.delete(t) } else next.add(t)
    activeTiers.value = next
  }

  function setStatusFilter(v) {
    statusFilter.value = v
  }

  function reset() {
    activeTiers.value = new Set(TIERS)
    statusFilter.value = 'all'
  }

  return { open, activeTiers, statusFilter, active, toggleTier, setStatusFilter, reset }
}
