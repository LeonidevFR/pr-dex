<script setup>
import { ref, computed } from 'vue'
import { rankPlayers, teamTotals, sortPlayers, speciesCopies } from '../lib/leaderboard.js'
import { DEX, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'
import { useLeaderboardRows } from '../composables/useLeaderboardRows.js'
import SpeciesPicker from './SpeciesPicker.vue'

const props = defineProps({
  client: { type: Object, required: true },
  today: { type: String, required: true },
})

const { rows, loading, error, load } = useLeaderboardRows(props.client)
const ranked = computed(() => (rows.value ? rankPlayers(rows.value, props.today) : []))
const totals = computed(() => (rows.value ? teamTotals(rows.value, props.today) : null))

const COLUMNS = [
  ['species', 'Espèces'], ['shinySpecies', 'Shiny'], ['legendaries', 'Légendaires'], ['rares', 'Rares'],
  ['lineages', 'Lignées'], ['achievements', 'Succès'], ['copies', 'Cartes'], ['recent', '30 jours'],
]
const cell = (p, key) => p[key] ?? '—'
// Sur un écran étroit, seules ces colonnes restent visibles ; les autres se déplient au toucher.
// Une espèce choisie prend la place de Shiny : à 390 px, trois colonnes chiffrées débordent.
const PRIMARY = computed(() => new Set(speciesId.value ? ['species'] : ['species', 'shinySpecies']))
// Repéré par le rang, pas par le login : deux comptes sans `user_name` s'appellent tous deux
// « inconnu », et une clé en double dépliait les deux lignes à la fois.
const expanded = ref(null)

// L'espèce choisie ajoute une colonne d'exemplaires en main, en tête et visible partout.
// La choisir trie dessus : c'est ce qu'on vient chercher en tapant « Évoli ».
const speciesId = ref(null)
const onlyOwners = ref(false)
const PICK = 'pick'

// `null` : l'ordre du classement. Sinon une colonne et un sens ; le rang affiché ne bouge pas.
const sort = ref(null)
const valueOf = (key) => (key === PICK ? (p) => speciesCopies(p, speciesId.value) : (p) => p[key])

function sortBy(key) {
  sort.value = sort.value?.key === key
    ? { key, dir: sort.value.dir === 'desc' ? 'asc' : 'desc' }
    : { key, dir: 'desc' }
}
const ariaSort = (key) => (sort.value?.key === key ? (sort.value.dir === 'desc' ? 'descending' : 'ascending') : 'none')

function pickSpecies(id) {
  speciesId.value = id
  sort.value = { key: PICK, dir: 'desc' }
}
function clearSpecies() {
  speciesId.value = null
  onlyOwners.value = false
  if (sort.value?.key === PICK) sort.value = null
}

const players = computed(() => {
  let list = ranked.value
  if (speciesId.value && onlyOwners.value) list = list.filter((p) => speciesCopies(p, speciesId.value) > 0)
  return sort.value ? sortPlayers(list, valueOf(sort.value.key), sort.value.dir) : list
})
const columnCount = computed(() => 2 + COLUMNS.length + (speciesId.value ? 1 : 0))
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Tableau des scores</div>
        <h1 class="view-title">Qui a le plus <i>de Pokémon</i></h1>
      </div>
      <div v-if="totals" class="view-totals">
        <div data-total="collective"><div class="eyebrow">Pokédex collectif</div><div class="view-num">{{ totals.collective }} <small>/ 151</small></div></div>
        <div data-total="opened"><div class="eyebrow">Cartes retournées</div><div class="view-num">{{ totals.opened }}</div></div>
        <div data-total="shiny"><div class="eyebrow">Shiny</div><div class="view-num gold">{{ totals.shiny }} <small>/ 151</small></div></div>
      </div>
    </div>

    <div v-if="loading" class="board-loading">Chargement…</div>
    <div v-else-if="error" class="board-error">
      <p>{{ error }}</p>
      <button class="btn-ghost" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!ranked.length" class="board-empty">
      Personne n'a encore retourné de carte. Le classement commence à la première.
    </p>

    <template v-else>
      <div class="toolbar board-toolbar">
        <SpeciesPicker placeholder="Classer sur une espèce" @select="pickSpecies" />
        <label v-if="speciesId" class="filter-chip board-owners" :class="{ active: onlyOwners }">
          <input v-model="onlyOwners" type="checkbox" class="sr-only">
          Seulement ceux qui en ont
        </label>
      </div>

      <table class="board-table">
        <thead>
          <tr>
            <th class="board-rank" :aria-sort="sort ? 'none' : 'descending'">
              <button class="board-sort" :class="{ sorted: !sort }" title="Ordre du classement" @click="sort = null">#</button>
            </th>
            <th class="board-who">Joueur</th>
            <th v-if="speciesId" class="board-pick" data-col="pick" :aria-sort="ariaSort(PICK)">
              <span class="board-pick-in">
                <button class="board-sort" :class="{ sorted: sort?.key === PICK, asc: sort?.dir === 'asc' }" @click="sortBy(PICK)">
                  <img :src="spriteUrl(speciesId)" alt="">{{ DEX[speciesId].name }}
                </button>
                <button class="board-pick-x" :aria-label="`Retirer ${DEX[speciesId].name}`" @click="clearSpecies">×</button>
              </span>
            </th>
            <th v-for="[key, label] in COLUMNS" :key="key" :class="{ secondary: !PRIMARY.has(key) }" :aria-sort="ariaSort(key)">
              <button class="board-sort" :class="{ sorted: sort?.key === key, asc: sort?.dir === 'asc' }" @click="sortBy(key)">{{ label }}</button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!players.length" class="board-none">
            <td :colspan="columnCount">Personne n'a de {{ DEX[speciesId].name }} en main.</td>
          </tr>
          <template v-for="p in players" :key="p.rank">
            <tr :class="{ me: p.isMe }" @click="expanded = expanded === p.rank ? null : p.rank">
              <td class="board-rank">{{ p.rank }}</td>
              <td class="board-who">
                <span class="board-who-in">
                  <img v-if="p.avatarUrl" class="board-avatar" :src="p.avatarUrl" alt="">
                  <span v-else class="board-avatar">{{ p.login[0]?.toUpperCase() }}</span>
                  <span class="board-login">{{ p.login }}</span>
                </span>
              </td>
              <td v-if="speciesId" class="mono lead board-pick" data-col="pick">{{ speciesCopies(p, speciesId) }}</td>
              <td v-for="[key] in COLUMNS" :key="key" class="mono" :class="{ secondary: !PRIMARY.has(key), lead: key === 'species' && !speciesId }">
                <span v-if="key === 'legendaries'" class="board-dot" :style="{ background: TIER_VAR.l }"></span>
                <span v-else-if="key === 'rares'" class="board-dot" :style="{ background: TIER_VAR.r }"></span>
                {{ cell(p, key) }}
              </td>
            </tr>
            <!-- Les colonnes masquées en étroit, avec leur libellé : des nombres seuls, sans
                 en-tête au-dessus, ne se liraient pas. Rendue partout, visible seulement en étroit. -->
            <tr v-if="expanded === p.rank" class="board-detail" :class="{ me: p.isMe }">
              <td :colspan="columnCount">
                <span v-for="[key, label] in COLUMNS.filter(([k]) => !PRIMARY.has(k))" :key="key" class="board-detail-item">
                  <span class="board-detail-label">{{ label }}</span> <b class="mono">{{ cell(p, key) }}</b>
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Ce que personne n'a encore vu. Pas de spoiler : la grille de chacun montre déjà les
           151 silhouettes, celle-ci ne dit que lesquelles restent éteintes chez tout le monde. -->
      <section class="team-missing" data-section="missing">
        <div class="eyebrow">Il manque à l'équipe</div>
        <h2 v-if="totals.missing.length" class="team-missing-title">
          {{ totals.missing.length }} espèce{{ totals.missing.length > 1 ? 's' : '' }} que personne n'a encore vue{{ totals.missing.length > 1 ? 's' : '' }}
        </h2>
        <h2 v-else class="team-missing-title">Rien. L'équipe a vu les 151.</h2>
        <ul v-if="totals.missing.length" class="missing-grid">
          <li v-for="id in totals.missing" :key="id" class="missing-item">
            <img :src="spriteUrl(id)" alt="" loading="lazy">
            <span class="missing-no mono">{{ String(id).padStart(3, '0') }}</span>
            <span class="missing-name"><span class="board-dot" :style="{ background: TIER_VAR[DEX[id].tier] }"></span>{{ DEX[id].name }}</span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
