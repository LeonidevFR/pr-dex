<script setup>
import { ref } from 'vue'
import TheRail from './components/TheRail.vue'
import TheTray from './components/TheTray.vue'
import { useCollection } from './composables/useCollection.js'
import { loadDemoClient } from './fixtures/demo.js'

const collection = useCollection()
const selected = ref(null)

// Provisoire : branché sur les données de démo tant que l'écran de connexion n'existe pas.
collection.load(loadDemoClient())
</script>

<template>
  <TheRail
    :caught-count="collection.dex.caughtCount.value"
    :pending-count="collection.dex.pending.value.length"
    @open="() => {}"
    @settings="() => {}"
  />
  <TheTray :by-species="collection.dex.bySpecies.value" @select="(id) => (selected = id)" />
</template>
