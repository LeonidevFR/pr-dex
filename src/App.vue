<script setup>
import { ref } from 'vue'
import TheRail from './components/TheRail.vue'
import TheTray from './components/TheTray.vue'
import SpeciesSheet from './components/SpeciesSheet.vue'
import RitualOverlay from './components/RitualOverlay.vue'
import EvolutionOverlay from './components/EvolutionOverlay.vue'
import { useCollection } from './composables/useCollection.js'
import { loadDemoClient } from './fixtures/demo.js'

const collection = useCollection()
const selected = ref(null)
const ritualEntry = ref(null)
// Figé à l'ouverture du pli : `claim` retire aussitôt l'entrée de `pending`, donc une
// liaison directe sur `pending.length` décrémenterait sous le composant pendant qu'il
// est affiché. Le composant attend un `remaining` qui inclut le pli courant.
const ritualRemaining = ref(0)
const evoAnim = ref(null)

// Provisoire : branché sur les données de démo tant que l'écran de connexion n'existe pas.
collection.load(loadDemoClient())

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
</script>

<template>
  <TheRail
    :caught-count="collection.dex.caughtCount.value"
    :pending-count="collection.dex.pending.value.length"
    @open="openRitual"
    @settings="() => {}"
  />
  <TheTray :by-species="collection.dex.bySpecies.value" @select="(id) => (selected = id)" />
  <transition name="fade">
    <SpeciesSheet
      v-if="selected"
      :id="selected"
      :entries="collection.dex.bySpecies.value[selected] ?? null"
      :candies="collection.dex.candies(selected)"
      :can-evolve="collection.dex.canEvolve(selected)"
      :is-dead-end="collection.dex.isDeadEnd(selected)"
      @close="selected = null"
      @evolve="onEvolve"
    />
  </transition>
  <transition name="fade">
    <RitualOverlay
      v-if="ritualEntry"
      :key="ritualEntry.sha"
      :entry="ritualEntry"
      :remaining="ritualRemaining"
      @claim="collection.claim"
      @next="nextRitual"
      @skip-all="skipAll"
    />
  </transition>
  <transition name="fade">
    <EvolutionOverlay
      v-if="evoAnim"
      :from="evoAnim.from"
      :to="evoAnim.to"
      :shiny="evoAnim.shiny"
      @done="finishEvo"
    />
  </transition>
</template>
