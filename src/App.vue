<script setup>
import { ref } from 'vue'
import TheRail from './components/TheRail.vue'
import TheTray from './components/TheTray.vue'
import SpeciesSheet from './components/SpeciesSheet.vue'
import { useCollection } from './composables/useCollection.js'
import { loadDemoClient } from './fixtures/demo.js'

const collection = useCollection()
const selected = ref(null)

// Provisoire : branché sur les données de démo tant que l'écran de connexion n'existe pas.
collection.load(loadDemoClient())

function onEvolve({ from, to }) {
  selected.value = null
  collection.evolve(from, to, new Date().toISOString().slice(0, 10))
}
</script>

<template>
  <TheRail
    :caught-count="collection.dex.caughtCount.value"
    :pending-count="collection.dex.pending.value.length"
    @open="() => {}"
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
</template>
