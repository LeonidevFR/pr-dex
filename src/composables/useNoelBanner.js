import { ref, computed } from 'vue'
import { noelSeasonOf } from '../../shared/noel.js'

/**
 * Le bandeau n'annonce l'édition qu'à ceux qui n'ont encore découvert aucun lutin : ensuite,
 * l'onglet Équipe · Noël porte la même explication. Fermé, il ne l'est que pour la page — rien
 * n'est mémorisé. `season` force une saison (la démo, hors calendrier).
 */
export function useNoelBanner({ today, season = noelSeasonOf(today), discovered = ref(0) } = {}) {
  const dismissed = ref(false)
  const visible = computed(() => season !== null && !dismissed.value && discovered.value === 0)
  const dismiss = () => { dismissed.value = true }
  return { visible, dismiss }
}
