<script setup>
import { computed } from 'vue'
import { spriteUrl } from '../lib/sprites.js'

/**
 * Un cercle d'encre, le sprite en aplat de la même encre. Pas de texture ni d'effet de
 * tampon : l'encre suffit à dire le palier, et le badge reste lisible à 44 px dans un toast.
 */
const props = defineProps({
  achievement: { type: Object, required: true },
  // 'owned' : encre du palier · 'todo' : palier visible pas encore atteint · 'hidden' : caché, pas obtenu
  state: { type: String, default: 'owned' },
  size: { type: Number, default: 56 },
})

const icon = computed(() => props.achievement.icon)
const mask = computed(() => (icon.value.sprite ? { '--ach-sprite': `url(${spriteUrl(icon.value.sprite)})` } : null))
</script>

<template>
  <span
    class="ach-badge" :class="[`ach-${state}`, state === 'owned' ? `ach-t-${achievement.tier}` : null]"
    :style="{ '--ach-size': `${size}px` }" aria-hidden="true"
  >
    <span class="ach-badge-in">
      <span v-if="state === 'hidden'" class="ach-glyph ach-q">?</span>
      <span v-else-if="icon.sprite" class="ach-sprite" :style="mask"></span>
      <span v-else class="ach-glyph">{{ icon.glyph }}</span>
    </span>
  </span>
</template>
