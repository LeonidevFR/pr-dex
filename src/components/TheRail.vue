<script setup>
import {
  Award, LayoutGrid, Menu, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, SlidersHorizontal, Store, Sun,
  Swords, Trophy, User, X,
} from '@lucide/vue'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  caughtCount: { type: Number, required: true },
  pendingCount: { type: Number, required: true },
  syncing: { type: Boolean, default: false },
  syncError: { type: String, default: null }, // 'offline' | 'server' | 'conflict' | 'revoked'
  view: { type: String, default: 'collection' },
  theme: { type: String, default: 'dark' }, // 'light' | 'dark'
  // Succès débloqués pas encore montrés, rangés dans « Ma fiche » : sans pastille sur son
  // onglet, le récap attendrait une visite que rien ne suggère.
  achievementsBadge: { type: Number, default: 0 },
})
const emit = defineEmits(['open', 'settings', 'sync', 'navigate', 'toggle-theme'])

/**
 * Six lieux, dans une barre latérale.
 *
 * La barre du haut en tenait cinq, et à 1 280 px les outils y passaient déjà à la ligne : les
 * succès, rangés faute de place dans « Ma fiche », s'y perdaient au bas d'une longue page. À la
 * verticale, chaque lieu a sa ligne, son icône et sa pastille, et la liste peut s'allonger.
 *
 * L'en-tête garde ce qu'on touche en jouant : le compteur, Ouvrir et la synchro.
 */
const TABS = [
  ['collection', 'Collection', LayoutGrid],
  ['duels', 'Duels', Swords],
  ['shop', 'Boutique', Store],
  ['classements', 'Scores', Trophy],
  ['succes', 'Succès', Award],
  ['moi', 'Ma fiche', User],
]

// Repliée en icônes, mémorisée d'une visite à l'autre : c'est un réglage d'écran, pas d'état.
const COLLAPSED_KEY = 'pr-dex-sidebar-collapsed'
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false } }
const collapsed = ref(readCollapsed())
// La barre est fixe : la page se décale de sa largeur, lue sur la racine par la feuille de style.
watch(collapsed, (c) => { document.documentElement.dataset.sidebar = c ? 'collapsed' : 'open' }, { immediate: true })
function toggleCollapsed() {
  collapsed.value = !collapsed.value
  try { localStorage.setItem(COLLAPSED_KEY, collapsed.value ? '1' : '0') } catch { /* navigation privée */ }
}
// Sur mobile, la barre est un tiroir : il se referme dès qu'on a choisi où aller.
const drawerOpen = ref(false)
function go(key) {
  drawerOpen.value = false
  emit('navigate', key)
}

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
  if (props.syncing) return 'Recherche en cours : tes cartes s’afficheront toutes seules'
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
  <div v-if="drawerOpen" class="side-scrim" @click="drawerOpen = false"></div>
  <aside class="side" :class="{ collapsed, open: drawerOpen }">
    <div class="side-head">
      <div class="side-brand">
        <div class="wordmark"><i>PR</i><span class="side-full">·DEX</span></div>
        <div class="eyebrow rail-sub side-full">PR ou test : un Pokémon</div>
      </div>
      <button
        class="side-collapse" :aria-label="collapsed ? 'Déplier la barre' : 'Replier la barre'"
        :title="collapsed ? 'Déplier la barre' : 'Replier la barre'" @click="toggleCollapsed"
      >
        <PanelLeftOpen v-if="collapsed" :size="16" :stroke-width="1.75" aria-hidden="true" />
        <PanelLeftClose v-else :size="16" :stroke-width="1.75" aria-hidden="true" />
      </button>
      <button class="side-close" aria-label="Fermer le menu" @click="drawerOpen = false">
        <X :size="16" :stroke-width="1.75" aria-hidden="true" />
      </button>
    </div>
    <!-- Les vues sont des pages, pas des onglets d'une modale : une vraie navigation, avec
         le lieu courant annoncé. -->
    <nav class="rail-nav" aria-label="Vues">
      <button
        v-for="[key, label, icon] in TABS" :key="key" class="rail-tab" :class="{ active: view === key }"
        :aria-current="view === key ? 'page' : undefined" :title="collapsed ? label : undefined" @click="go(key)"
      >
        <component :is="icon" class="rail-tab-ico" :size="17" :stroke-width="1.75" aria-hidden="true" />
        <span class="rail-tab-label">{{ label }}</span>
        <span v-if="key === 'succes' && achievementsBadge" class="rail-tab-pip"><span>{{ achievementsBadge }}</span></span>
      </button>
    </nav>
    <div class="side-tools">
      <button
        class="gear theme-toggle" :aria-label="theme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair'"
        :title="theme === 'light' ? 'Passer au thème sombre' : 'Passer au thème clair'" @click="$emit('toggle-theme')"
      >
        <Moon v-if="theme === 'light'" :size="16" :stroke-width="1.75" aria-hidden="true" />
        <Sun v-else :size="16" :stroke-width="1.75" aria-hidden="true" />
        <span class="side-tool-label">{{ theme === 'light' ? 'Thème sombre' : 'Thème clair' }}</span>
      </button>
      <button class="gear" title="Réglages" aria-label="Réglages" @click="$emit('settings')">
        <SlidersHorizontal :size="16" :stroke-width="1.75" aria-hidden="true" />
        <span class="side-tool-label">Réglages</span>
      </button>
    </div>
  </aside>

  <header class="rail">
    <button class="side-burger" aria-label="Ouvrir le menu" @click="drawerOpen = true">
      <Menu :size="18" :stroke-width="1.75" aria-hidden="true" />
      <span v-if="achievementsBadge" class="side-burger-dot"></span>
    </button>
    <div class="progress">
      <span class="progress-count"><span class="eyebrow progress-label">Pokédex</span> <b>{{ caughtCount }}</b><i> / 151</i></span>
      <div class="bar"><div class="bar-fill" :style="{ width: (caughtCount / 151 * 100) + '%' }"></div></div>
    </div>
    <div class="rail-tools">
      <button class="claim-btn" :class="{ pulsing: pendingCount }" :disabled="!pendingCount" @click="$emit('open')">
        {{ pendingCount ? 'Ouvrir' : 'Rien à ouvrir' }}
        <span v-if="pendingCount" class="pip">{{ pendingCount }}</span>
      </button>
      <button class="gear sync" :title="syncTitle" :aria-label="syncTitle" :disabled="syncing || cooling" @click="triggerSync">
        <span class="side-tool-ico" :class="{ spinning: syncing }">
          <RefreshCw :size="15" :stroke-width="1.75" aria-hidden="true" />
        </span><span v-if="syncError" class="err-dot"></span>
      </button>
    </div>
  </header>
</template>
