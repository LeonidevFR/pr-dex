<script setup>
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps({
  caughtCount: { type: Number, required: true },
  pendingCount: { type: Number, required: true },
  syncing: { type: Boolean, default: false },
  syncError: { type: String, default: null }, // 'offline' | 'server' | 'conflict' | 'revoked'
})
const emit = defineEmits(['open', 'settings', 'sync'])

// Une sync qui échoue doit se voir : un bouton qui tourne puis ne change rien n'est pas
// distinguable d'« à jour » sans ce badge — c'est ce silence qui a fait perdre du temps
// en debug avant qu'on le remarque.
const SYNC_ERROR_LABEL = {
  offline: 'Hors ligne — la dernière synchronisation a échoué.',
  server: 'La synchronisation a échoué — réessaie.',
  conflict: 'Conflit de synchronisation — réessaie.',
  revoked: 'Session expirée — reconnecte-toi.',
}
const syncTitle = computed(() =>
  props.syncError ? (SYNC_ERROR_LABEL[props.syncError] ?? 'La synchronisation a échoué.')
    : 'Vérifier les nouvelles captures',
)

// Chaque sync relit Supabase : cinq clics rapides sont cinq requêtes pour la même absence
// de nouveauté. Un court cooldown après le déclenchement empêche le martelage sans gêner
// l'usage normal (une vérification ponctuelle après un merge, pas une action répétée).
const COOLDOWN_MS = 10_000
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
        class="gear sync" :class="{ spinning: syncing }" :title="syncTitle"
        :disabled="syncing || cooling" @click="triggerSync"
      >⟳<span v-if="syncError" class="err-dot"></span></button>
      <button class="gear" title="Réglages" @click="$emit('settings')">⚙</button>
    </div>
  </header>
</template>
