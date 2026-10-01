import { ref, computed } from 'vue'
import { DEX, TIER_LABEL } from '../../shared/species.js'

const TIERS = Object.keys(TIER_LABEL)

/**
 * Minuscules, sans accents, sans rien d'autre que des lettres et des chiffres. « Évoli »,
 * « EVOLI » et « evoli » doivent se retrouver : personne ne tape l'accent d'un nom de Pokémon,
 * et « M. Mime » ou « Nidoran ♀ » portent des signes qu'on ne tape pas non plus.
 */
export function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Une recherche purement numérique est un numéro de Pokédex, comparé en entier : « 25 »,
 * « 025 » et « #25 » trouvent Pikachu, mais pas Élektek (125). Sinon, c'est un morceau de nom.
 */
export function matchesQuery(id, query) {
  const q = normalize(query ?? '')
  if (!q) return true
  if (/^\d+$/.test(q)) return Number(q) === id
  return normalize(DEX[id].name).includes(q)
}

/** État des filtres de la planche (paliers, statut, recherche). Pure UI, aucun effet de bord. */
export function useTrayFilters() {
  const activeTiers = ref(new Set(TIERS))
  const statusFilter = ref('all') // 'all' | 'caught' | 'uncaught' | 'evolvable'
  const query = ref('')

  const active = computed(
    () => activeTiers.value.size < TIERS.length || statusFilter.value !== 'all' || normalize(query.value) !== '',
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

  function setQuery(v) {
    query.value = v
  }

  function reset() {
    activeTiers.value = new Set(TIERS)
    statusFilter.value = 'all'
    query.value = ''
  }

  return { activeTiers, statusFilter, query, active, toggleTier, setStatusFilter, setQuery, reset }
}
