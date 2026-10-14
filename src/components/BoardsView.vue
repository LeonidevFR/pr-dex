<script setup>
import { computed } from 'vue'
import SeasonBoard from './SeasonBoard.vue'
import TeamBoard from './TeamBoard.vue'
import { rankPlayers, teamTotals } from '../lib/leaderboard.js'
import { useLeaderboardRows } from '../composables/useLeaderboardRows.js'
import { seasonLabel } from '../../shared/arena-economy.js'

const props = defineProps({
  client: { type: Object, default: null },
  today: { type: String, required: true },
  userId: { type: String, default: '' },
  /** Le classement de la saison en cours. Vide tant que l'arène n'a pas ouvert. */
  leaderboard: { type: Array, default: () => [] },
  season: { type: String, default: '' },
  /** Faux avant le 1er décembre : il n'y a alors qu'un classement à montrer. */
  arenaOpen: { type: Boolean, default: false },
})
defineEmits(['profile'])

/**
 * Les classements, sur un écran.
 *
 * Il y en avait deux, dans deux onglets : l'équipe d'un côté, la saison de l'autre, au second
 * niveau sous « Arène ». Or ce sont les MÊMES dix personnes classées sur deux mesures — ce
 * qu'on a collectionné, et ce qu'on a gagné en duel. Les séparer obligeait à chercher dans
 * deux quartiers pour répondre à une seule question : où j'en suis par rapport aux autres.
 *
 * Tant que l'arène est fermée il n'y a qu'une mesure, et la page n'annonce donc qu'elle.
 */
const titre = computed(() => (props.arenaOpen ? 'Où tu en es' : 'Qui a le plus'))

/**
 * La lecture vit ici et non dans le tableau : les totaux de l'en-tête sortent des mêmes lignes
 * que lui, et deux blocs qui liraient chacun pour soi feraient deux requêtes pour une réponse.
 */
const { rows, loading, error, load } = useLeaderboardRows(props.client)
const players = computed(() => (rows.value ? rankPlayers(rows.value, props.today) : []))
const totals = computed(() => (rows.value ? teamTotals(rows.value, props.today) : null))
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Scores</div>
        <h1 class="view-title">
          {{ titre }} <i>{{ arenaOpen ? 'face aux autres' : 'de Pokémon' }}</i>
        </h1>
        <p v-if="arenaOpen" class="muted" style="margin-top:10px">
          Les mêmes joueurs, deux mesures : ce qu’on a trouvé, et ce qu’on a gagné.
        </p>
      </div>
      <div v-if="totals" class="view-totals">
        <div data-total="collective"><div class="eyebrow">Pokédex collectif</div><div class="view-num">{{ totals.collective }} <small>/ 151</small></div></div>
        <div data-total="opened"><div class="eyebrow">Cartes retournées</div><div class="view-num">{{ totals.opened }}</div></div>
        <div data-total="shiny"><div class="eyebrow">Shiny</div><div class="view-num gold">{{ totals.shiny }}</div></div>
      </div>
    </div>

    <!--
      La collection d'abord : c'est la mesure qui existe depuis juillet, celle que le travail
      remplit tout seul. Les points de la saison viennent ensuite — ils ne comptent que pour qui
      joue, et ils repartent de zéro tous les deux mois.
    -->
    <TeamBoard :players="players" :loading="loading" :error="error" @retry="load" />

    <SeasonBoard
      v-if="arenaOpen"
      :leaderboard="leaderboard" :user-id="userId"
      @profile="$emit('profile', $event)"
    />
    <p v-if="arenaOpen && season" class="muted">
      Les points sont ceux de la <b>{{ seasonLabel(season) }}</b>, et d’elle seule : une saison
      close garde son podium, pas ses points.
    </p>
  </section>
</template>
