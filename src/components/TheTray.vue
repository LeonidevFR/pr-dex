<script setup>
import { ref, computed } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  bySpecies: { type: Object, required: true },
  evolvable: { type: Set, default: () => new Set() },
})
defineEmits(['select'])

const ids = Object.keys(DEX).map(Number)
const isShiny = (entries) => entries?.some((e) => e.shiny) ?? false

const TIERS = ['c', 'u', 'r', 'l']
const filtersOpen = ref(false)
const activeTiers = ref(new Set(TIERS))
const caughtFilter = ref('all') // 'all' | 'caught' | 'uncaught'

const hasActiveFilters = computed(
  () => activeTiers.value.size < TIERS.length || caughtFilter.value !== 'all',
)

// Ne jamais désactiver le dernier palier restant : un filtre qui vide la grille en
// silence est pire qu'un clic ignoré.
function toggleTier(t) {
  const next = new Set(activeTiers.value)
  if (next.has(t)) { if (next.size > 1) next.delete(t) } else next.add(t)
  activeTiers.value = next
}

function resetFilters() {
  activeTiers.value = new Set(TIERS)
  caughtFilter.value = 'all'
}

const visibleIds = computed(() =>
  ids.filter((id) => {
    if (!activeTiers.value.has(DEX[id].tier)) return false
    const caught = !!props.bySpecies[id]
    if (caughtFilter.value === 'caught' && !caught) return false
    if (caughtFilter.value === 'uncaught' && caught) return false
    return true
  }),
)
</script>

<template>
  <div class="tray-controls">
    <button
      class="gear filter-toggle" :class="{ active: hasActiveFilters }"
      title="Filtrer la grille" @click="filtersOpen = !filtersOpen"
    >▽</button>
    <div v-if="filtersOpen" class="filters">
      <div class="filter-group">
        <button
          v-for="t in TIERS" :key="t" class="filter-chip"
          :class="{ active: activeTiers.has(t) }" :style="{ '--tier': TIER_VAR[t] }"
          @click="toggleTier(t)"
        >{{ TIER_LABEL[t] }}</button>
      </div>
      <div class="filter-group">
        <button class="filter-chip" :class="{ active: caughtFilter === 'all' }" @click="caughtFilter = 'all'">
          Tous
        </button>
        <button class="filter-chip" :class="{ active: caughtFilter === 'caught' }" @click="caughtFilter = 'caught'">
          Capturés
        </button>
        <button
          class="filter-chip" :class="{ active: caughtFilter === 'uncaught' }"
          @click="caughtFilter = 'uncaught'"
        >Non capturés</button>
      </div>
      <button v-if="hasActiveFilters" class="filter-reset" @click="resetFilters">Réinitialiser</button>
    </div>
  </div>

  <div class="tray">
    <button
      v-for="id in visibleIds" :key="id" class="cell"
      :class="{
        has: bySpecies[id], ghost: !bySpecies[id], shiny: isShiny(bySpecies[id]),
        legendary: bySpecies[id] && DEX[id].tier === 'l',
      }"
      :style="{ '--tier': TIER_VAR[DEX[id].tier] }"
      :disabled="!bySpecies[id]"
      @click="$emit('select', id)"
    >
      <span class="cell-no mono">{{ String(id).padStart(3, '0') }}</span>
      <span v-if="bySpecies[id]" class="cell-sha mono">
        {{ bySpecies[id][0].via === 'pr' ? bySpecies[id][0].sha.slice(0, 7) : 'évolué' }}
      </span>
      <span v-if="bySpecies[id]?.length > 1" class="cell-dupes mono">×{{ bySpecies[id].length }}</span>
      <img
        :src="spriteUrl(id, isShiny(bySpecies[id]))" :alt="DEX[id].name" loading="lazy"
        @error="$event.target.dataset.broken = '1'"
      >
      <span v-if="evolvable.has(id)" class="cell-evo" title="Peut évoluer">▲</span>
      <span v-if="bySpecies[id]" class="tier"></span>
    </button>
  </div>
</template>
