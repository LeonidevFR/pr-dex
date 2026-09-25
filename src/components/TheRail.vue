<script setup>
import AppIcon from './AppIcon.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  caughtCount: { type: Number, required: true },
  pendingCount: { type: Number, required: true },
  syncing: { type: Boolean, default: false },
  syncError: { type: String, default: null }, // 'offline' | 'server' | 'conflict' | 'revoked'
  filtersOpen: { type: Boolean, default: false },
  filtersActive: { type: Boolean, default: false },
  /** Le lieu courant, pour marquer l'onglet actif. */
  place: { type: String, default: 'collection' },
})
const emit = defineEmits(['open', 'settings', 'sync', 'toggle-filters', 'go'])

/**
 * Les cinq lieux, dans l'ordre où on les traverse : on collectionne, on se bat, on regarde où
 * ça mène, on dépense, on se contemple.
 *
 * Des onglets et non plus des icônes : une icône dit « une action », un onglet dit « tu es
 * ici ». Avec un seul écran la nuance ne coûtait rien ; à cinq lieux, ne pas savoir où l'on se
 * trouve devient le problème principal.
 */
const LIEUX = [
  { nom: 'collection', icone: 'grid', libelle: 'Collection' },
  { nom: 'arena', icone: 'arena', libelle: 'Arène' },
  { nom: 'season', icone: 'season', libelle: 'Saison' },
  { nom: 'shop', icone: 'shop', libelle: 'Boutique' },
  { nom: 'profile', icone: 'profile', libelle: 'Profil' },
]

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
  <header class="rail" :data-place="place">
    <div class="rail-haut">
      <div class="wordmark">PR<span>·</span>DEX</div>

      <nav class="tabs" aria-label="Les lieux">
        <button
          v-for="l in LIEUX" :key="l.nom"
          class="tab" :aria-current="place === l.nom ? 'page' : null"
          @click="emit('go', l.nom)"
        >
          <AppIcon :name="l.icone" :size="14" />
          <span>{{ l.libelle }}</span>
          <!-- La pastille suit l'onglet concerné : un pli en attente doit se voir depuis
               n'importe quel lieu, sans quoi on l'oublie en jouant ailleurs. -->
          <span v-if="l.nom === 'collection' && pendingCount" class="pip">{{ pendingCount }}</span>
        </button>
      </nav>

      <div class="rail-tools">
        <button class="gear sync" :title="syncTitle" :disabled="syncing || cooling" @click="triggerSync">
          <span :class="{ spinning: syncing }"><AppIcon name="sync" /></span>
          <span v-if="syncError" class="err-dot"></span>
        </button>
        <button class="gear" title="Réglages" @click="$emit('settings')"><AppIcon name="settings" /></button>
      </div>
    </div>

    <!--
      La progression et l'ouverture appartiennent à la planche, pas à l'application : les
      afficher au-dessus de la boutique ou du classement, c'est proposer un geste qui n'a rien
      à voir avec l'écran qu'on regarde. Elles suivent donc leur lieu.
    -->
    <div v-if="place === 'collection'" class="rail-bas">
      <div class="progress">
        <div class="progress-head">
          <span class="eyebrow">Espèces rencontrées</span>
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
          <AppIcon name="filter" />
        </button>
      </div>
    </div>
  </header>
</template>
