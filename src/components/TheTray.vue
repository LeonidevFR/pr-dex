<script setup>
import { computed } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  bySpecies: { type: Object, required: true },
  // Exemplaires disponibles par espèce (après consommation par des évolutions) — à défaut,
  // retombe sur le total brut de `bySpecies` (rétrocompatible avec un appelant qui ne le passe pas).
  copies: { type: Object, default: () => ({}) },
  evolvable: { type: Set, default: () => new Set() },
  filtersOpen: { type: Boolean, default: false },
  activeTiers: { type: Set, default: () => new Set(['c', 'u', 'r', 'l']) },
  caughtFilter: { type: String, default: 'all' }, // 'all' | 'caught' | 'uncaught'
})
const emit = defineEmits(['select', 'toggle-tier', 'set-caught-filter', 'reset-filters'])

const ids = Object.keys(DEX).map(Number)
const isShiny = (entries) => entries?.some((e) => e.shiny) ?? false
const copyCount = (id) => props.copies[id] ?? props.bySpecies[id]?.length ?? 0

const TIERS = Object.keys(TIER_LABEL)
const hasActiveFilters = computed(
  () => props.activeTiers.size < TIERS.length || props.caughtFilter !== 'all',
)

const visibleIds = computed(() =>
  ids.filter((id) => {
    if (!props.activeTiers.has(DEX[id].tier)) return false
    const caught = !!props.bySpecies[id]
    if (props.caughtFilter === 'caught' && !caught) return false
    if (props.caughtFilter === 'uncaught' && caught) return false
    return true
  }),
)
</script>

<template>
  <div v-if="filtersOpen" class="filters">
    <div class="filter-group">
      <button
        v-for="t in TIERS" :key="t" class="filter-chip"
        :class="{ active: activeTiers.has(t) }" :style="{ '--tier': TIER_VAR[t] }"
        @click="emit('toggle-tier', t)"
      >{{ TIER_LABEL[t] }}</button>
    </div>
    <div class="filter-group">
      <button
        class="filter-chip" :class="{ active: caughtFilter === 'all' }"
        @click="emit('set-caught-filter', 'all')"
      >Tous</button>
      <button
        class="filter-chip" :class="{ active: caughtFilter === 'caught' }"
        @click="emit('set-caught-filter', 'caught')"
      >Capturés</button>
      <button
        class="filter-chip" :class="{ active: caughtFilter === 'uncaught' }"
        @click="emit('set-caught-filter', 'uncaught')"
      >Non capturés</button>
    </div>
    <button v-if="hasActiveFilters" class="filter-reset" @click="emit('reset-filters')">Réinitialiser</button>
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
      <span v-if="bySpecies[id]" class="cell-origin mono">
        {{ bySpecies[id][0].via === 'catch' ? bySpecies[id][0].source : 'évolué' }}
      </span>
      <span v-if="copyCount(id) > 1" class="cell-dupes mono">×{{ copyCount(id) }}</span>
      <img
        :src="spriteUrl(id, isShiny(bySpecies[id]))" :alt="DEX[id].name" loading="lazy"
        @error="$event.target.dataset.broken = '1'"
      >
      <span v-if="evolvable.has(id)" class="cell-evo" title="Peut évoluer">▲</span>
      <span v-if="bySpecies[id]" class="tier"></span>
    </button>
  </div>
</template>
