<script setup>
import { ref, computed, onMounted } from 'vue'
import { rankPlayers, myStats } from '../lib/leaderboard.js'
import { TIER_VAR } from '../../shared/species.js'

const props = defineProps({
  client: { type: Object, required: true },
  today: { type: String, required: true },
})
defineEmits(['close'])

const tab = ref('ranking')
const rows = ref(null)
// À `true` dès le premier rendu : `onMounted` n'a pas encore tourné à cet instant, et un
// tableau vide n'a rien à afficher à la place — ce serait « personne » pendant un tick.
const loading = ref(true)
const error = ref(null)

// Rechargé à chaque ouverture, jamais mis en cache : le panneau est monté à l'ouverture et
// détruit à la fermeture, et les données tiennent en quelques Ko. Une erreur ne survit
// donc pas à une fermeture — rouvrir repart de zéro.
async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await props.client.readLeaderboard()
  } catch (e) {
    error.value = e.message ?? 'Le chargement a échoué.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const players = computed(() => (rows.value ? rankPlayers(rows.value, props.today) : []))
const stats = computed(() => (rows.value ? myStats(rows.value, props.today) : null))

const fmtPct = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
// « 0 sur N » plutôt qu'une division par zéro : le nombre dit la taille de l'échantillon.
const fmtOneIn = (s, total) => (s.oneIn ? `1 sur ${s.oneIn}` : `0 sur ${total}`)

const COLUMNS = [
  ['species', 'Espèces'], ['shiny', 'Shiny'], ['legendaries', 'Légendaires'], ['rares', 'Rares'],
  ['lineages', 'Lignées'], ['copies', 'Exemplaires'], ['recent', '30 jours'],
]
// Sur un écran étroit, seules ces colonnes restent visibles ; les autres se déplient au toucher.
const PRIMARY = new Set(['species', 'shiny'])
const expanded = ref(null)
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel board">
      <div class="panel-top board-top">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">ÉQUIPE</span>
          <h2 class="panel-name board-title">Tableau des scores</h2>
        </div>
      </div>

      <div class="board-tabs" role="tablist">
        <button class="board-tab" :class="{ active: tab === 'ranking' }" role="tab" @click="tab = 'ranking'">Classement</button>
        <button class="board-tab" :class="{ active: tab === 'stats' }" role="tab" @click="tab = 'stats'">Stats</button>
      </div>

      <div v-if="loading" class="board-loading mono">Chargement…</div>

      <div v-else-if="error" class="board-error">
        <p>{{ error }}</p>
        <button class="btn-ghost" @click="load">Réessayer</button>
      </div>

      <p v-else-if="!players.length" class="board-empty muted">
        Personne n'a encore retourné de carte. Le classement commence à la première.
      </p>

      <table v-else-if="tab === 'ranking'" class="board-table">
        <thead>
          <tr>
            <th class="board-rank">#</th>
            <th class="board-who">Joueur</th>
            <th v-for="[key, label] in COLUMNS" :key="key" :class="{ secondary: !PRIMARY.has(key) }">{{ label }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="p in players" :key="p.login">
            <tr :class="{ me: p.isMe }" @click="expanded = expanded === p.login ? null : p.login">
              <td class="board-rank mono">{{ p.rank }}</td>
              <td class="board-who">
                <img v-if="p.avatarUrl" class="board-avatar" :src="p.avatarUrl" alt="">
                <span v-else class="board-avatar board-avatar-empty"></span>
                <span class="board-login">{{ p.login }}</span>
              </td>
              <td v-for="[key] in COLUMNS" :key="key" class="mono" :class="{ secondary: !PRIMARY.has(key) }">
                <span v-if="key === 'legendaries'" class="board-dot" :style="{ background: TIER_VAR.l }"></span>
                <span v-else-if="key === 'rares'" class="board-dot" :style="{ background: TIER_VAR.r }"></span>
                {{ p[key] }}
              </td>
            </tr>
            <!-- Les colonnes masquées en étroit, avec leur libellé : des nombres seuls, sans
                 en-tête au-dessus, ne se liraient pas. Rendue partout, visible seulement en étroit. -->
            <tr v-if="expanded === p.login" class="board-detail" :class="{ me: p.isMe }">
              <td :colspan="2 + COLUMNS.length">
                <span v-for="[key, label] in COLUMNS.filter(([k]) => !PRIMARY.has(k))" :key="key" class="board-detail-item">
                  <span class="board-detail-label">{{ label }}</span> <b class="mono">{{ p[key] }}</b>
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <p v-else-if="!stats" class="board-empty muted">
        Retourne une carte pour voir tes stats.
      </p>

      <dl v-else class="board-stats">
        <div data-stat="opened"><dt>Plis ouverts</dt><dd class="stat-value mono">{{ stats.opened }}</dd></div>
        <div data-stat="species"><dt>Espèces</dt><dd class="stat-value mono">{{ stats.species }} / 151</dd></div>
        <div v-for="t in stats.tiers" :key="t.tier" :data-stat="'tier-' + t.tier">
          <dt><span class="board-dot" :style="{ background: TIER_VAR[t.tier] }"></span>{{ t.label }}</dt>
          <dd class="stat-value mono">{{ t.count }} <small>{{ fmtPct(t.pct) }}</small></dd>
        </div>
        <div data-stat="shiny">
          <dt>Shiny</dt>
          <dd class="stat-value mono">{{ stats.shiny.count }} <small>{{ fmtOneIn(stats.shiny, stats.opened) }}</small></dd>
        </div>
        <div data-stat="evolved"><dt>Pokémon évolués</dt><dd class="stat-value mono">{{ stats.evolved }}</dd></div>
      </dl>
    </div>
  </div>
</template>
