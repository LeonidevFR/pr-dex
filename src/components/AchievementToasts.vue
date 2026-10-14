<script setup>
import { watch, onUnmounted } from 'vue'
import AchievementBadge from './AchievementBadge.vue'
import { BY_CODE } from '../lib/achievements.js'
import { TIER_LABEL } from '../../shared/species.js'

const props = defineProps({
  toasts: { type: Array, required: true },
  counts: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['dismiss', 'open'])

// Le toast entre après 0,9 s (animation CSS), le temps que la carte finisse de se retourner,
// puis reste 5 s. Le délai court depuis l'arrivée dans la liste, entrée comprise.
const TOAST_MS = 5900
const timers = new Map()
watch(
  () => props.toasts.map((t) => t.id),
  (ids) => {
    for (const id of ids) {
      if (timers.has(id)) continue
      timers.set(id, setTimeout(() => { timers.delete(id); emit('dismiss', id) }, TOAST_MS))
    }
  },
  { immediate: true },
)
onUnmounted(() => { for (const t of timers.values()) clearTimeout(t) })

const who = (n) => (n ? `${n} joueur${n > 1 ? 's' : ''} l’${n > 1 ? 'ont' : 'a'}` : 'Personne d’autre')
</script>

<template>
  <div class="ach-toasts" aria-live="polite">
    <transition-group name="ach-toast">
      <button
        v-for="t in toasts" :key="t.id" class="ach-toast" :class="`ach-t-${BY_CODE[t.code].tier}`"
        @click="emit('open', t.code); emit('dismiss', t.id)"
      >
        <AchievementBadge :achievement="BY_CODE[t.code]" :size="44" />
        <span class="ach-toast-text">
          <span class="ach-toast-kicker">Succès débloqué</span>
          <span class="ach-toast-name">{{ BY_CODE[t.code].name }}</span>
          <span class="ach-toast-sub">{{ TIER_LABEL[BY_CODE[t.code].tier] }} · {{ who(counts[t.code]) }}</span>
        </span>
      </button>
    </transition-group>
  </div>
</template>
