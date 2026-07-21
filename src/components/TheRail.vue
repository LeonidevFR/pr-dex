<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  caughtCount: { type: Number, required: true },
  pendingCount: { type: Number, required: true },
  syncing: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'settings', 'sync'])

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
        class="gear sync" :class="{ spinning: syncing }" title="Vérifier les nouvelles captures"
        :disabled="syncing || cooling" @click="triggerSync"
      >⟳</button>
      <button class="gear" title="Réglages" @click="$emit('settings')">⚙</button>
    </div>
  </header>
</template>
