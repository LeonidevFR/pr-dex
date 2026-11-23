<script setup>
import { ref, computed } from 'vue'
import TeamCard from './TeamCard.vue'

const props = defineProps({
  members: { type: Array, required: true },
  owned: { type: Object, required: true },
})

const sorted = computed(() => [...props.members].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
const count = computed(() => props.members.filter((m) => props.owned[m.id]).length)
const zoom = ref(null)
const first = (id) => props.owned[id][0]
</script>

<template>
  <section class="team-shelf">
    <p class="team-shelf-note">
      <b>{{ count }} sur {{ members.length }} lutin{{ members.length > 1 ? 's' : '' }} de Noël découvert{{ count > 1 ? 's' : '' }}.</b>
      Édition Noël, du 15 décembre au 6 janvier : une carte sur quinze en cache une de l’équipe, en plus de son Pokémon. Elles sont décoratives : elles ne comptent ni au
      Pokédex, ni au leaderboard, ni en arène.
    </p>
    <div class="tray team-tray">
      <button
        v-for="m in sorted" :key="m.id" class="cell team-cell"
        :class="{ has: owned[m.id], ghost: !owned[m.id], legendary: owned[m.id] }" style="--tier: var(--t-l)"
        :disabled="!owned[m.id]" @click="zoom = m"
      >
        <template v-if="owned[m.id]">
          <img v-if="m.photoUrl" class="team-cell-photo" :src="m.photoUrl" :alt="m.name" loading="lazy">
          <span v-else class="team-cell-photo team-photo-none" aria-hidden="true">{{ m.name[0] }}</span>
          <span class="team-cell-name">{{ m.name }}</span>
          <span v-if="owned[m.id].length > 1" class="cell-dupes mono">×{{ owned[m.id].length }}</span>
        </template>
        <span v-else class="team-cell-q" aria-label="carte pas encore trouvée">?</span>
      </button>
    </div>

    <div v-if="zoom" class="zoom-scrim" @click.self="zoom = null">
      <div class="zoom-card">
        <TeamCard :member="zoom" :provenance="{ ref: first(zoom.id).ref, label: first(zoom.id).label, date: first(zoom.id).date }" />
        <span class="zoom-hint">Cliquer à côté pour fermer</span>
      </div>
    </div>
  </section>
</template>
