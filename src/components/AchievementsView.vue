<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import AchievementBadge from './AchievementBadge.vue'
import { ACHIEVEMENTS } from '../lib/achievements.js'
import { TIER_LABEL } from '../../shared/species.js'
import { formatDate } from '../lib/dates.js'

const props = defineProps({
  owned: { type: Object, required: true },
  counts: { type: Object, required: true },
  progress: { type: Object, required: true },
  triggers: { type: Object, default: () => ({}) },
  ready: { type: Boolean, default: false },
  error: { type: String, default: null },
  // `{ code, seq }` : le succès à montrer, demandé depuis un toast. `seq` change à chaque
  // demande, pour qu'un second clic sur le même succès le remontre.
  focus: { type: Object, default: null },
})
defineEmits(['retry'])

const FILTERS = [['all', 'Tous'], ['owned', 'Obtenus'], ['todo', 'En cours'], ['hidden', 'Cachés']]
const filter = ref('all')
const openCode = ref(null)

const items = computed(() => ACHIEVEMENTS.map((a) => {
  const row = props.owned[a.code] ?? null
  return {
    a, row,
    state: row ? 'owned' : a.hidden ? 'hidden' : 'todo',
    players: props.counts[a.code] ?? 0,
    progress: props.progress[a.code] ?? null,
  }
}))

const newestFirst = (x, y) => (x.row.unlocked_at < y.row.unlocked_at ? 1 : x.row.unlocked_at > y.row.unlocked_at ? -1 : 0)
const groups = computed(() => [
  ['owned', 'Obtenus', items.value.filter((i) => i.state === 'owned').sort(newestFirst)],
  ['todo', 'En cours', items.value.filter((i) => i.state === 'todo')],
  ['hidden', 'Cachés', items.value.filter((i) => i.state === 'hidden')],
].filter(([key, , list]) => list.length && (filter.value === 'all' || filter.value === key)))

const countOf = (key) => (key === 'all' ? items.value.length : items.value.filter((i) => i.state === key).length)
const ownedCount = computed(() => countOf('owned'))
const byTier = computed(() =>
  ['c', 'u', 'r', 'l'].map((t) => ({ t, n: items.value.filter((i) => i.state === 'owned' && i.a.tier === t).length })))

const who = (n) => (n === 0 ? 'Personne encore' : `${n} joueur${n > 1 ? 's' : ''} l’${n > 1 ? 'ont' : 'a'}`)
const pct = (p) => `${Math.min(100, (p.current / p.target) * 100)}%`

watch(
  () => props.focus?.seq,
  async () => {
    if (!props.focus) return
    filter.value = 'all'
    openCode.value = props.focus.code
    await nextTick()
    document.querySelector(`[data-code="${props.focus.code}"]`)?.scrollIntoView?.({ block: 'center' })
  },
  { immediate: true },
)

function toggle(item) {
  if (item.state !== 'owned') return
  openCode.value = openCode.value === item.a.code ? null : item.a.code
}
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Succès</div>
        <h1 class="view-title">Ce que <i>tu as</i> réussi</h1>
      </div>
    </div>

    <div v-if="error" class="board-error">
      <p>{{ error }}</p>
      <button class="btn-ghost" @click="$emit('retry')">Réessayer</button>
    </div>
    <div v-else-if="!ready" class="board-loading">Chargement…</div>

    <!-- La feuille reste en papier dans les deux thèmes : posée sur le velours, elle se lit
         comme un objet, au même titre que les cartes. -->
    <div v-else class="ach-sheet">
      <div class="ach-head">
        <h2 class="ach-title">Registre des succès</h2>
        <div class="ach-total"><b>{{ ownedCount }}</b> / {{ ACHIEVEMENTS.length }}</div>
        <div class="ach-tiers">
          <span v-for="{ t, n } in byTier" :key="t" class="ach-tier-count" :class="`ach-t-${t}`" :title="TIER_LABEL[t]">
            <i></i>{{ n }}
          </span>
        </div>
      </div>

      <div class="ach-filters">
        <button
          v-for="[key, label] in FILTERS" :key="key" class="ach-filter" :class="{ active: filter === key }"
          :aria-pressed="filter === key" @click="filter = key"
        >{{ label }}<em>{{ countOf(key) }}</em></button>
      </div>

      <template v-for="[key, label, list] in groups" :key="key">
        <h3 class="ach-group">{{ label }}</h3>
        <ul class="ach-list">
          <li
            v-for="item in list" :key="item.a.code" class="ach-row"
            :class="[`is-${item.state}`, { open: openCode === item.a.code }]" :data-code="item.a.code"
            :tabindex="item.state === 'owned' ? 0 : undefined"
            @click="toggle(item)" @keyup.enter="toggle(item)"
          >
            <AchievementBadge :achievement="item.a" :state="item.state" />
            <div class="ach-text">
              <div class="ach-name">{{ item.state === 'hidden' ? 'Succès caché' : item.a.name }}</div>
              <div class="ach-desc">
                {{ item.state === 'hidden' ? 'Il se révèle le jour où tu le débloques.' : item.a.desc }}
              </div>
              <!-- La date est déjà sur la ligne : le détail dit ce qui l'a déclenché. -->
              <div v-if="openCode === item.a.code && triggers[item.row.trigger_key]" class="ach-detail">
                {{ triggers[item.row.trigger_key] }}
              </div>
            </div>
            <div class="ach-when">
              <span v-if="item.state === 'owned'" class="ach-date">{{ formatDate(item.row.unlocked_at) }}</span>
              <template v-else-if="item.progress">
                <span class="ach-hand">{{ item.progress.current }} / {{ item.progress.target }}</span>
                <span class="ach-bar"><i :style="{ width: pct(item.progress) }"></i></span>
              </template>
            </div>
            <div class="ach-rarity">
              <b v-if="item.state !== 'hidden'" :class="`ach-t-${item.a.tier}`">{{ TIER_LABEL[item.a.tier] }}</b>
              <small>{{ who(item.players) }}</small>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>
