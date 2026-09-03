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
  statusFilter: { type: String, default: 'all' }, // 'all' | 'caught' | 'uncaught' | 'evolvable'
})
const emit = defineEmits(['select', 'toggle-tier', 'set-status-filter', 'reset-filters'])

const ids = Object.keys(DEX).map(Number)
const isShiny = (entries) => entries?.some((e) => e.shiny) ?? false
const copyCount = (id) => props.copies[id] ?? props.bySpecies[id]?.length ?? 0

const TIERS = Object.keys(TIER_LABEL)
const hasActiveFilters = computed(
  () => props.activeTiers.size < TIERS.length || props.statusFilter !== 'all',
)

// « Évoluables » se lit sur le même jeu que le badge ▲ de la case : le filtre ne peut pas
// montrer autre chose que ce que la grille annonçait déjà.
const visibleIds = computed(() =>
  ids.filter((id) => {
    if (!props.activeTiers.has(DEX[id].tier)) return false
    const caught = !!props.bySpecies[id]
    if (props.statusFilter === 'caught' && !caught) return false
    if (props.statusFilter === 'uncaught' && caught) return false
    if (props.statusFilter === 'evolvable' && !props.evolvable.has(id)) return false
    return true
  }),
)

// Une grille vide est un état normal ici — on n'a pas toujours de quoi faire évoluer
// quelqu'un — mais elle ne doit pas rester muette : sans un mot, elle se lit comme un bug.
// La raison n'est nommée que si « Évoluables » est bien seul en cause : un palier décoché
// en même temps rendrait l'explication fausse.
const emptyLabel = computed(() => {
  if (visibleIds.value.length > 0) return null
  const seulementEvolvable = props.statusFilter === 'evolvable'
    && props.activeTiers.size === TIERS.length
  return seulementEvolvable
    ? 'Rien à faire évoluer pour l’instant : il faut un exemplaire disponible et assez de bonbons.'
    : 'Aucune espèce ne répond à ces filtres.'
})
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
        class="filter-chip" :class="{ active: statusFilter === 'all' }"
        @click="emit('set-status-filter', 'all')"
      >Tous</button>
      <button
        class="filter-chip" :class="{ active: statusFilter === 'caught' }"
        @click="emit('set-status-filter', 'caught')"
      >Capturés</button>
      <button
        class="filter-chip" :class="{ active: statusFilter === 'uncaught' }"
        @click="emit('set-status-filter', 'uncaught')"
      >Non capturés</button>
      <button
        class="filter-chip chip-evo" :class="{ active: statusFilter === 'evolvable' }"
        title="Espèces qui ont de quoi évoluer maintenant"
        @click="emit('set-status-filter', 'evolvable')"
      >Évoluables</button>
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

  <p v-if="emptyLabel" class="tray-empty">{{ emptyLabel }}</p>
</template>
