<script setup>
import { DEX, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

defineProps({
  from: { type: Number, required: true },
  to: { type: Number, required: true },
  shiny: { type: Boolean, default: false },
})
defineEmits(['done'])
</script>

<template>
  <div class="evostage" :style="{ '--tier': TIER_VAR[DEX[to].tier] }">
    <div class="evo-frame">
      <div class="evo-glow"></div>
      <img class="evo-from" :src="spriteUrl(from, shiny)" :alt="DEX[from].name">
      <img class="evo-to" :src="spriteUrl(to, shiny)" :alt="DEX[to].name">
    </div>
    <div class="evo-cap">
      <div class="reveal-banner" style="color:var(--ochre)">Évolution</div>
      <div class="reveal-name">{{ DEX[from].name }} → {{ DEX[to].name }}</div>
      <button class="next-btn" style="margin-top:20px" @click="$emit('done')">Voir la planche</button>
    </div>
  </div>
</template>
