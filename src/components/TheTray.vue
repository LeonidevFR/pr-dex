<script setup>
import { computed } from 'vue'
import { DEX, SPECIES, SPECIES_GEN2, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
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
  gen: { type: Number, default: 1 },
})
const emit = defineEmits(['select', 'toggle-tier', 'set-caught-filter', 'reset-filters', 'set-gen'])

/**
 * Deux étagères, jamais une seule grille.
 *
 * La planche des 151 est ce que le travail remplit — c'est elle que compte le rail et elle qui
 * définit ce qu'« avoir fini » veut dire. La Gen 2 ne s'obtient qu'en boutique : la verser dans
 * la même grille ferait passer le compteur à 251 et afficherait cent cases vides pour toujours,
 * là où elle est une collection à part, qu'on entame quand on a de quoi.
 */
const TABLES = { 1: SPECIES, 2: SPECIES_GEN2 }
const ids = computed(() => TABLES[props.gen].map(([id]) => id))
const isShiny = (entries) => entries?.some((e) => e.shiny) ?? false
const copyCount = (id) => props.copies[id] ?? props.bySpecies[id]?.length ?? 0

const TIERS = Object.keys(TIER_LABEL)
const hasActiveFilters = computed(
  () => props.activeTiers.size < TIERS.length || props.caughtFilter !== 'all',
)

const caughtInGen = computed(() =>
  ids.value.filter((id) => props.bySpecies[id]).length)

const visibleIds = computed(() =>
  ids.value.filter((id) => {
    if (!props.activeTiers.has(DEX[id].tier)) return false
    const caught = !!props.bySpecies[id]
    if (props.caughtFilter === 'caught' && !caught) return false
    if (props.caughtFilter === 'uncaught' && caught) return false
    return true
  }),
)
</script>

<template>
  <!--
    Deux étagères et non deux filtres : la planche se compte sur 151 et la Gen 2 sur 100, et
    mêler les deux ferait mentir la seule mesure qui dise « j'ai fini ».
  -->
  <div class="gen-tabs">
    <button
      class="filter-chip" :class="{ active: gen === 1 }" @click="emit('set-gen', 1)"
    >Génération 1 · {{ caughtInGen }}/151</button>
    <button
      class="filter-chip" :class="{ active: gen === 2 }" @click="emit('set-gen', 2)"
    >Génération 2 · {{ gen === 2 ? caughtInGen : '—' }}/100</button>
    <span v-if="gen === 2" class="muted" style="font-size:11.5px">
      Ne se tire jamais au travail : elle s’achète en arène, avec des pokédollars.
    </span>
  </div>

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
