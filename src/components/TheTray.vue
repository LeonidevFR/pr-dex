<script setup>
import { ChevronsUp, Gem, Search, Sparkle } from '@lucide/vue'
import { computed } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'
import { matchesQuery } from '../composables/useTrayFilters.js'

const props = defineProps({
  bySpecies: { type: Object, required: true },
  // Exemplaires disponibles par espèce (après consommation par des évolutions) — à défaut,
  // retombe sur le total brut de `bySpecies` (rétrocompatible avec un appelant qui ne le passe pas).
  copies: { type: Object, default: () => ({}) },
  evolvable: { type: Set, default: () => new Set() },
  activeTiers: { type: Set, default: () => new Set(['c', 'u', 'r', 'l']) },
  statusFilter: { type: String, default: 'all' }, // 'all' | 'caught' | 'uncaught' | 'evolvable'
  query: { type: String, default: '' },
})
const emit = defineEmits(['select', 'toggle-tier', 'set-status-filter', 'set-query', 'reset-filters'])

// Les mêmes mots que les filtres : une pastille qui abrège ce que le filtre écrit en entier
// obligeait à faire le lien. Le commun n'en a pas — c'est la case par défaut.
const PILL = { u: TIER_LABEL.u, r: TIER_LABEL.r, l: TIER_LABEL.l }

const ids = Object.keys(DEX).map(Number)
const isShiny = (entries) => entries?.some((e) => e.shiny) ?? false
const copyCount = (id) => props.copies[id] ?? props.bySpecies[id]?.length ?? 0

const TIERS = Object.keys(TIER_LABEL)
const hasActiveFilters = computed(
  () => props.activeTiers.size < TIERS.length || props.statusFilter !== 'all' || props.query.trim() !== '',
)

// « Évoluables » se lit sur le même jeu que le badge ▲ de la case : le filtre ne peut pas
// montrer autre chose que ce que la grille annonçait déjà. Ce jeu ne retient que les espèces
// dont l'évolution manque encore au Pokédex — évoluer vers une forme déjà vue n'apporte rien.
const visibleIds = computed(() =>
  ids.filter((id) => {
    if (!matchesQuery(id, props.query)) return false
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
  if (props.query.trim()) return 'Aucun Pokémon ne correspond'
  const seulementEvolvable = props.statusFilter === 'evolvable'
    && props.activeTiers.size === TIERS.length
  return seulementEvolvable
    ? 'Rien à faire évoluer pour l’instant. Il faut une carte libre, assez de bonbons, et une évolution que tu n’as pas encore.'
    : 'Aucune espèce ne répond à ces filtres.'
})

const evolvableCount = computed(() => props.evolvable.size)
const tierOf = (id) => DEX[id].tier
</script>

<template>
  <div class="toolbar">
    <label class="tray-search-wrap">
      <Search :size="14" aria-hidden="true" />
      <span class="sr-only">Chercher un Pokémon</span>
      <input
        class="tray-search" type="search" placeholder="Chercher un Pokémon" :value="query"
        @input="emit('set-query', $event.target.value)"
      >
    </label>
    <div class="filter-group">
      <button class="filter-chip" :class="{ active: statusFilter === 'all' }" @click="emit('set-status-filter', 'all')">Tous</button>
      <button class="filter-chip" :class="{ active: statusFilter === 'caught' }" @click="emit('set-status-filter', 'caught')">Capturés</button>
      <button class="filter-chip" :class="{ active: statusFilter === 'uncaught' }" @click="emit('set-status-filter', 'uncaught')">Manquants</button>
    </div>
    <span class="toolbar-sep" aria-hidden="true"></span>
    <div class="filter-group">
      <button
        v-for="t in TIERS" :key="t" class="filter-chip tier-chip"
        :class="{ active: activeTiers.has(t) }" :style="{ '--tier': TIER_VAR[t] }"
        :aria-pressed="activeTiers.has(t)" @click="emit('toggle-tier', t)"
      >{{ TIER_LABEL[t] }}</button>
    </div>
    <span class="toolbar-grow"></span>
    <button v-if="hasActiveFilters" class="filter-reset" @click="emit('reset-filters')">Réinitialiser</button>
    <button
      class="filter-chip chip-evo" :class="{ active: statusFilter === 'evolvable' }"
      title="Espèces qui ont de quoi évoluer maintenant vers une forme qui manque encore"
      @click="emit('set-status-filter', 'evolvable')"
    >Évoluables · {{ evolvableCount }}</button>
  </div>

  <div class="tray">
    <button
      v-for="id in visibleIds" :key="id" class="cell"
      :class="{
        has: bySpecies[id], ghost: !bySpecies[id], shiny: isShiny(bySpecies[id]),
        legendary: bySpecies[id] && tierOf(id) === 'l',
        rare: bySpecies[id] && tierOf(id) === 'r',
      }"
      :style="{ '--tier': TIER_VAR[tierOf(id)] }"
      :disabled="!bySpecies[id]"
      @click="$emit('select', id)"
    >
      <span class="cell-no mono">{{ String(id).padStart(3, '0') }}</span>
      <span v-if="bySpecies[id]" class="cell-origin mono">
        {{ bySpecies[id][0].via === 'catch' ? bySpecies[id][0].source : 'évolué' }}
      </span>
      <span v-if="bySpecies[id] && PILL[tierOf(id)]" class="cell-pill" :class="tierOf(id)">{{ PILL[tierOf(id)] }}</span>
      <img
        :src="spriteUrl(id, isShiny(bySpecies[id]))" :alt="DEX[id].name" loading="lazy"
        @error="$event.target.dataset.broken = '1'"
      >
      <span v-if="copyCount(id) > 1" class="cell-dupes mono">×{{ copyCount(id) }}</span>
      <!-- Des pictos plutôt que des halos : on repère le précieux en parcourant la grille, sans
           que la grille entière se mette à briller. -->
      <span class="cell-signs">
        <span v-if="evolvable.has(id)" class="cell-evo" title="Peut évoluer vers une forme manquante">
          <ChevronsUp :size="11" :stroke-width="2.5" aria-hidden="true" />
        </span>
        <span v-if="isShiny(bySpecies[id])" class="cell-shiny" role="img" aria-label="shiny">
          <Sparkle :size="12" fill="currentColor" aria-hidden="true" />
        </span>
        <span v-if="bySpecies[id] && tierOf(id) === 'l'" class="cell-legend" role="img" aria-label="légendaire">
          <Gem :size="13" aria-hidden="true" />
        </span>
      </span>
    </button>
  </div>

  <p v-if="emptyLabel" class="tray-empty">
    {{ emptyLabel }}
    <button v-if="query.trim()" class="filter-reset" @click="emit('reset-filters')">Effacer les filtres</button>
  </p>
</template>
