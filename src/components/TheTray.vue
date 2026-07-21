<script setup>
import { DEX, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

defineProps({
  bySpecies: { type: Object, required: true },
  evolvable: { type: Set, default: () => new Set() },
})
defineEmits(['select'])

const ids = Object.keys(DEX).map(Number)
const isShiny = (entries) => entries?.some((e) => e.shiny) ?? false
</script>

<template>
  <div class="tray">
    <button
      v-for="id in ids" :key="id" class="cell"
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
