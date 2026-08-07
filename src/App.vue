<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import TheRail from './components/TheRail.vue'
import TheTray from './components/TheTray.vue'
import SpeciesSheet from './components/SpeciesSheet.vue'
import RitualOverlay from './components/RitualOverlay.vue'
import EvolutionOverlay from './components/EvolutionOverlay.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ConnectScreen from './components/ConnectScreen.vue'
import { useCollection } from './composables/useCollection.js'
import { useAuth } from './composables/useAuth.js'
import { useTrayFilters } from './composables/useTrayFilters.js'
import { useKeyboardNav } from './composables/useKeyboardNav.js'
import { createSupabaseClient } from './lib/supabaseData.js'

const collection = useCollection()
const { session, ready, signInWithGithub, signOut } = useAuth()
const connected = ref(false)
const connectError = ref(null)
const connecting = ref(false)
const githubLogin = ref('')

const selected = ref(null)
const ritualEntry = ref(null)
const ritualRemaining = ref(0)
const ritualIsNew = ref(false)
const evoAnim = ref(null)
const settingsOpen = ref(false)

const filters = useTrayFilters()

// Stock disponible par espèce (une évolution passée a pu en consommer un) — recalculé sur
// les seules espèces déjà rencontrées, pas les 151 : les autres n'ont de toute façon rien à afficher.
const copiesById = computed(() => {
  const map = {}
  for (const id of Object.keys(collection.dex.bySpecies.value)) map[id] = collection.dex.copyCount(Number(id))
  return map
})

const caughtIds = computed(() => new Set(Object.keys(collection.dex.bySpecies.value).map(Number)))

async function connectSession(s) {
  connecting.value = true
  connectError.value = null
  githubLogin.value = s.user.user_metadata?.user_name ?? ''
  const client = createSupabaseClient(s.user.id)
  try {
    await client.checkAccess()
  } catch (e) {
    connectError.value = e.kind
    connecting.value = false
    return
  }
  await collection.load(client)
  connecting.value = false
  if (collection.error.value) { connectError.value = collection.error.value; return }
  connected.value = true
}

function disconnect() {
  signOut()
  settingsOpen.value = false
  connected.value = false
  connectError.value = null
}

onMounted(async () => {
  if (new URLSearchParams(location.search).has('demo')) {
    const { loadDemoClient } = await import('./fixtures/demo.js')
    githubLogin.value = 'démo'
    await collection.load(loadDemoClient())
    connected.value = true
  }
})

// OAuth GitHub redirige la page entière puis revient : pas d'appel ponctuel possible au montage,
// il faut réagir à l'arrivée tardive de la session (retour de redirection ou session déjà active).
watch(
  () => [ready.value, session.value],
  ([isReady, s]) => {
    if (!isReady || connected.value) return
    if (s) connectSession(s)
  },
  { immediate: true },
)

// Figé à l'ouverture du pli : `claim` retire aussitôt l'entrée de `pending`, donc une
// liaison directe sur `pending.length` décrémenterait sous le composant pendant qu'il
// est affiché. Le composant attend un `remaining` qui inclut le pli courant.
//
// Même raison pour `isNew`, plus impérieuse encore : `claim` inscrit l'espèce au dex avant
// même la révélation, donc une liaison directe la dirait déjà rencontrée — le marqueur ne
// s'allumerait jamais. Il se lit sur l'état d'avant l'ouverture, seul état où la question
// « jamais rencontrée ? » a un sens.
function showNextPacket() {
  const queue = collection.dex.pending.value
  ritualEntry.value = queue[0] ?? null
  ritualRemaining.value = queue.length
  ritualIsNew.value = ritualEntry.value ? collection.dex.isNewSpecies(ritualEntry.value.species) : false
}
const openRitual = showNextPacket
const nextRitual = showNextPacket

async function skipAll() {
  const rest = [...collection.dex.pending.value]
  ritualEntry.value = null
  for (const e of rest) await collection.claim(e.key)
}

async function onEvolve({ from, to }) {
  const shiny = collection.dex.bySpecies.value[from]?.some((e) => e.shiny) ?? false
  // Figé avant l'écriture, pour la même raison que `ritualIsNew` plus haut : `evolve`
  // inscrit l'espèce cible au dex dès l'appel, donc une lecture après coup la dirait
  // toujours déjà rencontrée. Les bonbons suivent la règle inverse et se lisent au rendu,
  // après la dépense — d'où leur absence de cet instantané.
  const isNew = collection.dex.isNewSpecies(to)
  selected.value = null
  await collection.evolve(from, to, new Date().toISOString().slice(0, 10))
  // L'écriture a échoué : pas de cérémonie pour une évolution qui n'a pas eu lieu.
  if (collection.error.value) return
  evoAnim.value = { from, to, shiny, isNew }
}

function finishEvo() {
  selected.value = evoAnim.value.to
  evoAnim.value = null
}

const overlayOpen = computed(() =>
  Boolean(ritualEntry.value || evoAnim.value || selected.value || settingsOpen.value),
)

// Priorité calquée sur l'empilement visuel donné par les z-index de styles.css :
// évolution (70), rituel (60), puis réglages et fiche (40). Fermer le rituel conserve
// les plis restants, comme le fait déjà sa croix.
function closeTopOverlay() {
  if (evoAnim.value) { finishEvo(); return }
  if (ritualEntry.value) { ritualEntry.value = null; return }
  if (settingsOpen.value) { settingsOpen.value = false; return }
  if (selected.value) selected.value = null
}

useKeyboardNav({
  blocked: overlayOpen,
  // Seul état sans bouton principal à focaliser : la home au repos. `openRitual` laisse
  // `ritualEntry` à null quand la file est vide — rien à cas-particulariser ici.
  onSpace: openRitual,
  onEscape: closeTopOverlay,
})
</script>

<template>
  <ConnectScreen
    v-if="!connected"
    :error="connectError" :busy="connecting"
    @connect="signInWithGithub"
  />

  <template v-else>
    <TheRail
      :caught-count="collection.dex.caughtCount.value"
      :pending-count="collection.dex.pending.value.length"
      :syncing="collection.loading.value" :sync-error="collection.error.value"
      :filters-open="filters.open.value" :filters-active="filters.active.value"
      @open="openRitual" @settings="settingsOpen = true" @sync="collection.refresh"
      @toggle-filters="filters.open.value = !filters.open.value"
    />
    <TheTray
      :by-species="collection.dex.bySpecies.value" :copies="copiesById" :evolvable="collection.dex.evolvableIds.value"
      :filters-open="filters.open.value" :active-tiers="filters.activeTiers.value"
      :caught-filter="filters.caughtFilter.value"
      @select="(id) => (selected = id)"
      @toggle-tier="filters.toggleTier" @set-caught-filter="filters.setCaughtFilter" @reset-filters="filters.reset"
    />

    <transition name="fade">
      <SpeciesSheet
        v-if="selected" :id="selected"
        :entries="collection.dex.bySpecies.value[selected] ?? null"
        :copies="collection.dex.copyCount(selected)"
        :candies="collection.dex.candies(selected)"
        :can-evolve="collection.dex.canEvolve(selected)"
        :is-dead-end="collection.dex.isDeadEnd(selected)"
        :caught-ids="caughtIds"
        @close="selected = null" @evolve="onEvolve"
      />
    </transition>

    <transition name="fade">
      <RitualOverlay
        v-if="ritualEntry" :key="ritualEntry.key" :entry="ritualEntry"
        :remaining="ritualRemaining" :is-new="ritualIsNew"
        @claim="collection.claim" @next="nextRitual" @skip-all="skipAll"
        @close="ritualEntry = null"
      />
    </transition>

    <transition name="fade">
      <EvolutionOverlay
        v-if="evoAnim" :from="evoAnim.from" :to="evoAnim.to" :shiny="evoAnim.shiny"
        :is-new="evoAnim.isNew" :candies="collection.dex.candies(evoAnim.to)" @done="finishEvo"
      />
    </transition>

    <transition name="fade">
      <SettingsPanel
        v-if="settingsOpen" :github-login="githubLogin" @close="settingsOpen = false" @disconnect="disconnect"
      />
    </transition>
  </template>
</template>
