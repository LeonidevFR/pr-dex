<script setup>
import { ref, watch, onMounted } from 'vue'
import TheRail from './components/TheRail.vue'
import TheTray from './components/TheTray.vue'
import SpeciesSheet from './components/SpeciesSheet.vue'
import RitualOverlay from './components/RitualOverlay.vue'
import EvolutionOverlay from './components/EvolutionOverlay.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ConnectScreen from './components/ConnectScreen.vue'
import { useCollection } from './composables/useCollection.js'
import { useAuth } from './composables/useAuth.js'
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
const evoAnim = ref(null)
const settingsOpen = ref(false)

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
function showNextPacket() {
  const queue = collection.dex.pending.value
  ritualEntry.value = queue[0] ?? null
  ritualRemaining.value = queue.length
}
const openRitual = showNextPacket
const nextRitual = showNextPacket

async function skipAll() {
  const rest = [...collection.dex.pending.value]
  ritualEntry.value = null
  for (const e of rest) await collection.claim(e.sha)
}

async function onEvolve({ from, to }) {
  const shiny = collection.dex.bySpecies.value[from]?.some((e) => e.shiny) ?? false
  selected.value = null
  await collection.evolve(from, to, new Date().toISOString().slice(0, 10))
  // L'écriture a échoué : pas de cérémonie pour une évolution qui n'a pas eu lieu.
  if (collection.error.value) return
  evoAnim.value = { from, to, shiny }
}

function finishEvo() {
  selected.value = evoAnim.value.to
  evoAnim.value = null
}
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
      @open="openRitual" @settings="settingsOpen = true"
    />
    <TheTray :by-species="collection.dex.bySpecies.value" @select="(id) => (selected = id)" />

    <transition name="fade">
      <SpeciesSheet
        v-if="selected" :id="selected"
        :entries="collection.dex.bySpecies.value[selected] ?? null"
        :candies="collection.dex.candies(selected)"
        :can-evolve="collection.dex.canEvolve(selected)"
        :is-dead-end="collection.dex.isDeadEnd(selected)"
        @close="selected = null" @evolve="onEvolve"
      />
    </transition>

    <transition name="fade">
      <RitualOverlay
        v-if="ritualEntry" :key="ritualEntry.sha" :entry="ritualEntry"
        :remaining="ritualRemaining"
        @claim="collection.claim" @next="nextRitual" @skip-all="skipAll"
      />
    </transition>

    <transition name="fade">
      <EvolutionOverlay
        v-if="evoAnim" :from="evoAnim.from" :to="evoAnim.to" :shiny="evoAnim.shiny" @done="finishEvo"
      />
    </transition>

    <transition name="fade">
      <SettingsPanel
        v-if="settingsOpen" :github-login="githubLogin" @close="settingsOpen = false" @disconnect="disconnect"
      />
    </transition>
  </template>
</template>
