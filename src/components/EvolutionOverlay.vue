<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR, familyOf } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  from: { type: Number, required: true },
  to: { type: Number, required: true },
  shiny: { type: Boolean, default: false },
  // Lu par App.vue AVANT l'écriture : `evolve` inscrit l'espèce cible au dex dès l'appel,
  // donc une lecture après coup répondrait toujours « déjà à la planche » et le marqueur
  // ne s'allumerait jamais. Même piège que `isNew` du rituel, même parade.
  isNew: { type: Boolean, default: false },
  // Solde de la famille APRÈS la dépense, à l'inverse : ici on veut ce qu'il reste,
  // pas ce qui vient d'être gagné.
  candies: { type: Number, required: true },
})
defineEmits(['done'])

const target = computed(() => DEX[props.to])
const family = computed(() => DEX[familyOf(props.to)])

const nextEl = ref(null)
let focusTimer = null

// Aligné sur le retard d'apparition de `.evo-cap` dans styles.css (fadeUp … 2.4s) : donner
// le focus avant la fin de la cérémonie permettrait de l'escamoter d'un Espace pressé trop tôt.
//
// Le délai ne consulte pas `prefers-reduced-motion`, comme le rituel depuis ac68ba4 : des
// postes le forcent (réglage caché, profil durci) alors que la cérémonie, elle, joue quand
// même. Raccourcir le focus sur ce signal rendrait le bouton activable pendant une animation
// bien visible — l'Espace suivant l'escamoterait.
const CAP_DELAY = 2400

onMounted(() => { focusTimer = setTimeout(() => nextEl.value?.focus(), CAP_DELAY) })
onUnmounted(() => clearTimeout(focusTimer))
</script>

<template>
  <div class="evostage" :style="{ '--tier': TIER_VAR[target.tier] }">
    <div class="evo-frame">
      <div class="evo-glow"></div>
      <img class="evo-from" :src="spriteUrl(from, shiny)" :alt="DEX[from].name">
      <img class="evo-to" :src="spriteUrl(to, shiny)" :alt="target.name">
    </div>
    <div class="evo-cap">
      <div v-if="shiny" class="reveal-banner">✦ Chromatique ✦</div>
      <div v-else-if="target.tier === 'l'" class="reveal-banner">★ Légendaire ★</div>
      <div v-else class="reveal-banner" style="color:var(--ochre)">Évolution</div>
      <div class="reveal-name">{{ DEX[from].name }} → {{ target.name }}</div>
      <div class="reveal-tags">
        <span v-if="isNew" class="chip new-chip">Nouveau</span>
        <span class="chip">{{ TIER_LABEL[target.tier] }}</span>
        <span v-if="shiny" class="chip shiny-chip">✦ Chromatique</span>
      </div>
      <div class="reveal-note mono">
        {{ isNew ? 'Première entrée à la planche' : 'Déjà à la planche' }} ·
        il reste {{ candies }} bonbon{{ candies > 1 ? 's' : '' }} <b>{{ family.name }}</b>
      </div>
      <button ref="nextEl" class="next-btn" style="margin-top:20px" @click="$emit('done')">Voir la planche</button>
    </div>
  </div>
</template>
