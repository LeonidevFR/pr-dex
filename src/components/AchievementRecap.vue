<script setup>
import { computed, ref, onMounted } from 'vue'
import AchievementBadge from './AchievementBadge.vue'
import { BY_CODE } from '../lib/achievements.js'

/**
 * Une seule feuille pour tout ce qui est tombé sans être montré : au lancement, l'historique
 * de chacun ; ensuite, ce qu'un coéquipier a débloqué pour nous (« Jumeaux ») ou une écriture
 * rattrapée. Jamais une annonce par succès : à 12 d'un coup, ce serait du bruit.
 */
const props = defineProps({
  items: { type: Array, required: true },
  first: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const list = computed(() => props.items.filter((r) => BY_CODE[r.code]))
const title = computed(() =>
  props.first ? `Tu avais déjà ${list.value.length} succès` : 'Nouveau depuis ta dernière visite')

const closeEl = ref(null)
onMounted(() => closeEl.value?.focus())
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <div class="ach-sheet ach-recap" role="dialog" aria-modal="true" :aria-label="title">
      <div class="eyebrow ach-recap-kicker">Succès</div>
      <h2 class="ach-recap-title">{{ title }}</h2>
      <ul class="ach-recap-grid">
        <li v-for="r in list" :key="r.code">
          <AchievementBadge :achievement="BY_CODE[r.code]" />
          <span class="ach-name">{{ BY_CODE[r.code].name }}</span>
        </li>
      </ul>
      <button ref="closeEl" class="ach-recap-close" @click="emit('close')">Voir le registre</button>
    </div>
  </div>
</template>
