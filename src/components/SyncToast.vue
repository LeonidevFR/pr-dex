<script setup>
import { watch, onUnmounted } from 'vue'
import { RefreshCw, Sparkle, CircleX, X } from '@lucide/vue'

const props = defineProps({
  // `{ phase: 'waiting' | 'running' | 'found' | 'failed', count? }`, ou null.
  sync: { type: Object, default: null },
})
const emit = defineEmits(['open', 'dismiss'])

// Le résultat reste quelques secondes, puis s'efface seul. L'attente, elle, reste affichée
// jusqu'au bout : c'est elle qui dit « inutile de recharger ».
const RESULT_MS = 8000
let timer = null
watch(
  () => props.sync?.phase,
  (phase) => {
    clearTimeout(timer)
    if (phase === 'found' || phase === 'failed') timer = setTimeout(() => emit('dismiss'), RESULT_MS)
  },
  { immediate: true },
)
onUnmounted(() => clearTimeout(timer))

const cardsLabel = (n) => (n > 1 ? `${n} nouvelles cartes` : `${n} nouvelle carte`)
</script>

<template>
  <transition name="toast">
    <div v-if="sync" class="sync-toast" :class="`is-${sync.phase}`" role="status" aria-live="polite">
      <template v-if="sync.phase === 'waiting' || sync.phase === 'running'">
        <RefreshCw class="toast-ico spinning" :size="18" aria-hidden="true" />
        <div class="toast-copy">
          <span class="bt">{{ sync.phase === 'waiting' ? 'En attente de GitHub…' : 'On cherche tes nouvelles cartes.' }}</span>
          Elles s'afficheront toutes seules d'ici une trentaine de secondes. Inutile de recharger la page.
        </div>
      </template>
      <template v-else-if="sync.phase === 'found'">
        <Sparkle class="toast-ico" :size="18" aria-hidden="true" />
        <div class="toast-copy"><span class="bt">{{ cardsLabel(sync.count) }}</span></div>
        <button class="btn-solid sync-open" @click="emit('open')">Retourner</button>
        <button class="toast-x" aria-label="Fermer" @click="emit('dismiss')"><X :size="16" aria-hidden="true" /></button>
      </template>
      <template v-else>
        <CircleX class="toast-ico" :size="18" aria-hidden="true" />
        <div class="toast-copy"><span class="bt">La recherche a échoué.</span> Réessaie dans un moment.</div>
        <button class="toast-x" aria-label="Fermer" @click="emit('dismiss')"><X :size="16" aria-hidden="true" /></button>
      </template>
    </div>
  </transition>
</template>
