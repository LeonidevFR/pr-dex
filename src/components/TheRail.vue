<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({
  caughtCount: { type: Number, required: true },
  pendingCount: { type: Number, required: true },
  syncing: { type: Boolean, default: false },
  syncError: { type: String, default: null }, // 'offline' | 'server' | 'conflict' | 'revoked'
  filtersOpen: { type: Boolean, default: false },
  filtersActive: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'settings', 'sync', 'toggle-filters'])

// Une sync qui échoue doit se voir : un bouton qui tourne puis ne change rien n'est pas
// distinguable d'« à jour » sans ce badge — c'est ce silence qui a fait perdre du temps
// en debug avant qu'on le remarque.
const SYNC_ERROR_LABEL = {
  offline: 'Hors ligne — la dernière synchronisation a échoué.',
  server: 'La synchronisation a échoué — réessaie.',
  conflict: 'Conflit de synchronisation — réessaie.',
  revoked: 'Session expirée — reconnecte-toi.',
}
// Le clic déclenche un vrai run GitHub Action, pas une lecture instantanée : sans ce message,
// le bouton semble juste tourner dans le vide pendant que le run travaille en coulisses.
const syncTitle = computed(() => {
  if (props.syncing) return 'Recherche en cours côté GitHub (jusqu’à 30s)…'
  if (props.syncError) return SYNC_ERROR_LABEL[props.syncError] ?? 'La synchronisation a échoué.'
  return 'Vérifier les nouvelles captures'
})

// Chaque sync déclenche un vrai run de l'Action côté GitHub, pas juste une lecture — cinq
// clics rapides sont cinq runs pour le même résultat. 5 minutes : le temps qu'un run se
// termine avant qu'un nouveau ait un sens, sans gêner l'usage normal (une vérification
// ponctuelle après un merge, pas une action répétée).
const COOLDOWN_MS = 5 * 60 * 1000
const cooling = ref(false)
let cooldownTimer = null

function triggerSync() {
  if (props.syncing || cooling.value) return
  emit('sync')
  cooling.value = true
  cooldownTimer = setTimeout(() => { cooling.value = false }, COOLDOWN_MS)
}

onUnmounted(() => clearTimeout(cooldownTimer))
</script>

<template>
  <header class="rail">
    <div>
      <div class="wordmark">PR<span>·</span>DEX</div>
      <div class="eyebrow rail-sub">Une PR mergée, un Pokémon</div>
    </div>
    <div class="progress">
      <div class="progress-head">
        <span class="eyebrow">Collection</span>
        <span class="progress-count"><b>{{ String(caughtCount).padStart(3, '0') }}</b><i> / 151</i></span>
      </div>
      <div class="bar"><div class="bar-fill" :style="{ width: (caughtCount / 151 * 100) + '%' }"></div></div>
    </div>
    <div class="rail-tools">
      <button class="claim-btn" :class="{ pulsing: pendingCount }" :disabled="!pendingCount" @click="$emit('open')">
        {{ pendingCount ? 'Ouvrir' : 'Rien à ouvrir' }}
        <span v-if="pendingCount" class="pip">{{ pendingCount }}</span>
      </button>
      <button
        class="gear filter-toggle" :class="{ active: filtersOpen || filtersActive }"
        title="Filtrer la grille" @click="$emit('toggle-filters')"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        ><polygon points="3 4 21 4 14 12.5 14 20 10 20 10 12.5 3 4"></polygon></svg>
      </button>
      <button
        class="gear sync" :class="{ spinning: syncing }" :title="syncTitle"
        :disabled="syncing || cooling" @click="triggerSync"
      >⟳<span v-if="syncError" class="err-dot"></span></button>
      <button class="gear" title="Réglages" @click="$emit('settings')">⚙</button>
    </div>
  </header>
</template>
