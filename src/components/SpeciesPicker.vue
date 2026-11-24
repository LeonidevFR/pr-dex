<script setup>
import { ref, computed } from 'vue'
import { Search } from '@lucide/vue'
import { DEX, TIER_VAR } from '../../shared/species.js'
import { matchesQuery, normalize } from '../composables/useTrayFilters.js'
import { spriteUrl } from '../lib/sprites.js'

/**
 * Un champ qui trouve une espèce par son nom ou son numéro et la renvoie par `select`. Ne
 * sait rien de l'écran qui l'accueille : le classement s'en sert pour choisir une colonne,
 * une palette Cmd+K pourra s'en servir pour ouvrir une fiche.
 */
const props = defineProps({
  placeholder: { type: String, default: 'Chercher un Pokémon' },
  limit: { type: Number, default: 8 },
})
const emit = defineEmits(['select'])

const query = ref('')
const open = ref(false)
const active = ref(0)
const listId = `species-picker-${Math.random().toString(36).slice(2, 8)}`

const IDS = Object.keys(DEX).map(Number)
// Les noms qui commencent par la saisie d'abord : « ev » doit proposer Évoli avant Leveinard.
const results = computed(() => {
  const q = normalize(query.value)
  if (!q) return []
  const starts = (id) => normalize(DEX[id].name).startsWith(q)
  const found = IDS.filter((id) => matchesQuery(id, query.value))
  return [...found.filter(starts), ...found.filter((id) => !starts(id))].slice(0, props.limit)
})

function onInput(e) {
  query.value = e.target.value
  active.value = 0
  open.value = true
}

function choose(id) {
  emit('select', id)
  query.value = ''
  open.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') { open.value = false; return }
  if (!results.value.length) return
  if (e.key === 'ArrowDown') { e.preventDefault(); open.value = true; active.value = (active.value + 1) % results.value.length }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + results.value.length) % results.value.length }
  else if (e.key === 'Enter') { e.preventDefault(); choose(results.value[active.value]) }
}
</script>

<template>
  <div class="species-picker">
    <label class="tray-search-wrap">
      <Search :size="14" aria-hidden="true" />
      <span class="sr-only">{{ placeholder }}</span>
      <input
        class="tray-search" type="search" role="combobox" autocomplete="off"
        :placeholder="placeholder" :value="query"
        :aria-expanded="open && results.length > 0" :aria-controls="listId"
        :aria-activedescendant="open && results.length ? `${listId}-${results[active]}` : undefined"
        @input="onInput" @keydown="onKeydown" @focus="open = true" @blur="open = false"
      >
    </label>
    <ul v-if="open && results.length" :id="listId" class="species-picker-list" role="listbox">
      <!-- `mousedown` et non `click` : le `blur` du champ fermerait la liste avant le clic. -->
      <li
        v-for="(id, i) in results" :id="`${listId}-${id}`" :key="id" role="option"
        class="species-picker-item" :class="{ active: i === active }" :aria-selected="i === active"
        @mousedown.prevent="choose(id)" @mouseenter="active = i"
      >
        <img :src="spriteUrl(id)" alt="" loading="lazy">
        <span class="mono species-picker-no">{{ String(id).padStart(3, '0') }}</span>
        <span class="board-dot" :style="{ background: TIER_VAR[DEX[id].tier] }"></span>{{ DEX[id].name }}
      </li>
    </ul>
  </div>
</template>
