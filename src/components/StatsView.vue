<script setup>
import { computed } from 'vue'
import { myStats } from '../lib/leaderboard.js'
import { TIER_VAR } from '../../shared/species.js'
import { useLeaderboardRows } from '../composables/useLeaderboardRows.js'

const props = defineProps({
  client: { type: Object, required: true },
  today: { type: String, required: true },
})

const { rows, loading, error, load } = useLeaderboardRows(props.client)
const stats = computed(() => (rows.value ? myStats(rows.value, props.today) : null))

const fmtPct = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Mes stats</div>
        <h1 class="view-title">Ce que <i>tes PR</i> ont tiré</h1>
      </div>
    </div>

    <div v-if="loading" class="board-loading">Chargement…</div>
    <div v-else-if="error" class="board-error">
      <p>{{ error }}</p>
      <button class="btn-ghost" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!stats" class="board-empty">Retourne une carte pour voir tes stats.</p>

    <dl v-else class="board-stats">
      <div data-stat="opened"><dt>Cartes retournées</dt><dd class="stat-value">{{ stats.opened }}</dd></div>
      <div data-stat="species"><dt>Espèces</dt><dd class="stat-value">{{ stats.species }} / 151</dd></div>
      <div v-for="t in stats.tiers" :key="t.tier" :data-stat="'tier-' + t.tier">
        <dt><span class="board-dot" :style="{ background: TIER_VAR[t.tier] }"></span>{{ t.label }}</dt>
        <dd class="stat-value">{{ t.count }} <small>{{ fmtPct(t.pct) }}</small></dd>
      </div>
      <div data-stat="shiny">
        <dt>Shiny</dt>
        <dd class="stat-value">{{ stats.shiny.species }} / 151 <small>{{ stats.shiny.copies }} exemplaire{{ stats.shiny.copies > 1 ? 's' : '' }}</small></dd>
      </div>
      <div data-stat="evolved"><dt>Pokémon évolués</dt><dd class="stat-value">{{ stats.evolved }}</dd></div>
    </dl>
  </section>
</template>
