<script setup>
import { Moon, RefreshCw, SlidersHorizontal, Sun } from '@lucide/vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  caughtCount: { type: Number, required: true },
  pendingCount: { type: Number, required: true },
  syncing: { type: Boolean, default: false },
  syncError: { type: String, default: null }, // 'offline' | 'server' | 'conflict' | 'revoked'
  view: { type: String, default: 'collection' }, // 'collection' | 'team' | 'stats'
  theme: { type: String, default: 'dark' }, // 'light' | 'dark'
})
const emit = defineEmits(['open', 'settings', 'sync', 'navigate', 'toggle-theme'])

const TABS = [['collection', 'Collection'], ['team', 'Leaderboard'], ['stats', 'Statistiques']]

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
  if (props.syncing) return 'Recherche en cours côté GitHub (jusqu’à 2 min)…'
  if (props.syncError) return SYNC_ERROR_LABEL[props.syncError] ?? 'La synchronisation a échoué.'
  return 'Vérifier les nouvelles captures'
})

// Chaque sync déclenche un vrai run de l'Action côté GitHub, pas juste une lecture — cinq
// clics rapides sont cinq runs pour le même résultat. 1 minute : assez pour qu'un run ait eu
// le temps de finir (il dure rarement plus de 30s en pratique) sans faire attendre quelqu'un
// qui vient de merger et veut sa capture tout de suite — 5 minutes, essayé d'abord, s'est
// avéré frustrant dans ce cas précis très courant.
//
// Le cooldown est mémorisé dans localStorage, pas juste en mémoire : un simple F5 remettait
// sinon le compteur à zéro, ce qui a produit plusieurs runs rapprochés en pratique (observé
// en prod : quatre déclenchements en 5 minutes). Ça ne protège qu'un même navigateur — deux
// personnes qui cliquent à quelques minutes d'écart déclenchent quand même deux runs, le
// verrou n'étant pas partagé côté serveur.
const COOLDOWN_MS = 60 * 1000
const COOLDOWN_KEY = 'pr-dex-sync-cooldown-until'
const cooling = ref(false)
let cooldownTimer = null

function armCooldown(ms) {
  clearTimeout(cooldownTimer)
  cooling.value = true
  cooldownTimer = setTimeout(() => { cooling.value = false }, ms)
}

function triggerSync() {
  if (props.syncing || cooling.value) return
  emit('sync')
  localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS))
  armCooldown(COOLDOWN_MS)
}

onMounted(() => {
  const until = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0)
  const remaining = until - Date.now()
  if (remaining > 0) armCooldown(remaining)
})

onUnmounted(() => clearTimeout(cooldownTimer))
</script>

<template>
  <header class="rail">
    <div class="rail-brand">
      <div class="wordmark"><i>PR</i>·DEX</div>
      <div class="eyebrow rail-sub">Une PR mergée, un Pokémon</div>
    </div>
    <!-- Les vues sont des pages, pas des onglets d'une modale : une vraie navigation, avec
         l'onglet courant annoncé — c'était le défaut relevé sur le panneau de classement. -->
    <nav class="rail-nav" aria-label="Vues">
      <button
        v-for="[key, label] in TABS" :key="key" class="rail-tab" :class="{ active: view === key }"
        :aria-current="view === key ? 'page' : undefined" @click="emit('navigate', key)"
      >{{ label }}</button>
    </nav>
    <div class="progress">
      <span class="progress-count"><span class="eyebrow progress-label">Pokédex</span> <b>{{ caughtCount }}</b><i> / 151</i></span>
      <div class="bar"><div class="bar-fill" :style="{ width: (caughtCount / 151 * 100) + '%' }"></div></div>
    </div>
    <div class="rail-tools">
      <button class="claim-btn" :class="{ pulsing: pendingCount }" :disabled="!pendingCount" @click="$emit('open')">
        {{ pendingCount ? 'Retourner' : 'Rien à retourner' }}
        <span v-if="pendingCount" class="pip">{{ pendingCount }}</span>
      </button>
      <button class="gear sync" :title="syncTitle" :aria-label="syncTitle" :disabled="syncing || cooling" @click="triggerSync">
        <span :class="{ spinning: syncing }">
          <RefreshCw :size="15" :stroke-width="1.75" aria-hidden="true" />
        </span><span v-if="syncError" class="err-dot"></span>
      </button>
      <button
        class="gear theme-toggle" :aria-label="theme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair'"
        :title="theme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair'" @click="$emit('toggle-theme')"
      >
        <Moon v-if="theme === 'light'" :size="15" :stroke-width="1.75" aria-hidden="true" />
        <Sun v-else :size="15" :stroke-width="1.75" aria-hidden="true" />
      </button>
      <button class="gear" title="Réglages" aria-label="Réglages" @click="$emit('settings')">
        <SlidersHorizontal :size="15" :stroke-width="1.75" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>
