<script setup>
import { watch, onUnmounted } from 'vue'
import { CircleCheck, CircleX, X } from '@lucide/vue'

const props = defineProps({
  /** Le texte à annoncer, ou null. */
  message: { type: String, default: null },
  /** `true` pour une bonne nouvelle (vente, carte arrivée), `false` pour un refus du serveur. */
  good: { type: Boolean, default: false },
})
const emit = defineEmits(['dismiss'])

/**
 * Une bonne nouvelle se lit d'un coup d'œil et s'efface vite. Un refus porte le message du
 * serveur, qui dit quoi faire : il reste plus longtemps, et la croix le ferme plus tôt.
 */
const GOOD_MS = 5000
const BAD_MS = 10000

let timer = null
watch(
  () => [props.message, props.good],
  ([message, good]) => {
    clearTimeout(timer)
    if (message) timer = setTimeout(() => emit('dismiss'), good ? GOOD_MS : BAD_MS)
  },
  { immediate: true },
)
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <transition name="notice">
    <div
      v-if="message" :key="message" class="notice-toast" :class="{ bonne: good }"
      :role="good ? 'status' : 'alert'" aria-live="polite"
    >
      <component :is="good ? CircleCheck : CircleX" class="toast-ico" :size="18" aria-hidden="true" />
      <span class="toast-copy">{{ message }}</span>
      <button class="toast-x" aria-label="Fermer" @click="emit('dismiss')"><X :size="16" aria-hidden="true" /></button>
    </div>
  </transition>
</template>
