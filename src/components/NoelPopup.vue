<script setup>
import { Gift, X } from '@lucide/vue'
import { ref, onMounted } from 'vue'

const emit = defineEmits(['open', 'later'])
const openEl = ref(null)
onMounted(() => openEl.value?.focus())
</script>

<template>
  <div class="scrim" @click.self="emit('later')">
    <div class="ach-sheet ach-recap noel-popup" role="dialog" aria-modal="true" aria-label="Joyeux Noël">
      <button class="x" aria-label="Plus tard" @click="emit('later')"><X :size="16" aria-hidden="true" /></button>
      <div class="noel-gift" aria-hidden="true"><Gift :size="40" :stroke-width="1.4" /></div>
      <div class="eyebrow ach-recap-kicker">Édition Noël</div>
      <h2 class="ach-recap-title">Joyeux Noël !</h2>
      <p class="noel-text">Un booster spécial t’attend sous le sapin.</p>
      <div class="noel-actions">
        <button ref="openEl" class="ach-recap-close" @click="emit('open')">Ouvrir le booster</button>
        <button class="filter-reset" @click="emit('later')">Plus tard</button>
      </div>
    </div>
  </div>
</template>
