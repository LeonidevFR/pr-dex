<script setup>
import { Gift, X } from '@lucide/vue'
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import TeamCard from './TeamCard.vue'
import { isGift } from '../composables/useTeamCards.js'

const props = defineProps({
  card: { type: Object, required: true },
  member: { type: Object, required: true },
  remaining: { type: Number, required: true },
  // Lu avant l'ouverture, comme `isNew` du rituel : `open` range la carte dans l'étagère aussitôt.
  isNew: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'next', 'close'])

/**
 * Le rituel d'une carte équipe : la scène du rituel, avec la fanfare du rare quelle que soit la
 * carte. Il n'y a pas de palier ici, et une carte qu'on ne voit que trois semaines par an n'a pas
 * de plancher à protéger.
 */
const stage = ref('awaiting')
const gift = computed(() => isGift(props.card.key))
const FANFARE = { flash: 4.2 * 1.7, sparks: 34, rings: 2 }
const loud = computed(() => stage.value === 'revealed')
const sparks = Array.from({ length: FANFARE.sparks }, (_, i) => {
  const angle = (i / FANFARE.sparks) * Math.PI * 2 + (i % 3) * 0.21
  const distance = 120 + (i % 5) * 46
  return {
    '--dx': (Math.cos(angle) * distance).toFixed(1) + 'px',
    '--dy': (Math.sin(angle) * distance).toFixed(1) + 'px',
    '--sd': (0.85 + (i % 4) * 0.22).toFixed(2) + 's',
  }
})
const rings = Array.from({ length: FANFARE.rings }, (_, i) => ({ animationDelay: i * 0.17 + 's' }))
const style = computed(() => (stage.value === 'revealed'
  ? { '--tier': 'var(--t-l)', '--ray': 'rgba(255,196,90,.7)', '--rayop': 0.8, '--wedge': '6deg', '--glow': '50px', '--rayspeed': '16s', '--flashscale': FANFARE.flash.toFixed(2) }
  : { '--tier': 'var(--t-l)', '--ray': 'rgba(150,138,118,.45)', '--rayop': 0.16, '--wedge': '12deg', '--glow': '10px', '--rayspeed': '24s' }))

function reveal() {
  if (stage.value !== 'awaiting') return
  stage.value = 'revealed'
  emit('open', props.card.key)
}

const cardEl = ref(null)
const nextEl = ref(null)
onMounted(() => cardEl.value?.$el?.focus())
watch(stage, async (s) => {
  await nextTick()
  if (s === 'revealed') nextEl.value?.focus()
})
</script>

<template>
  <div class="ritual" :class="{ leg: stage === 'revealed' }" :style="style">
    <button class="x ritual-close" aria-label="Revenir à la collection, garder les cartes restantes pour plus tard" @click="emit('close')">
      <X :size="18" aria-hidden="true" />
    </button>
    <div class="vignette"></div>
    <div class="reveal" :class="stage">
      <div class="rays"></div>
      <div v-if="loud" class="flash"></div>
      <span v-for="(r, i) in (loud ? rings : [])" :key="'r' + i" class="fx-ring" :style="r"></span>
      <div class="pkc-stage">
        <TeamCard
          ref="cardEl" :member="member" :provenance="{ ref: card.ref, label: card.label, date: card.date }"
          :flipped="stage === 'awaiting'" scene="night" @activate="reveal"
        />
      </div>
      <span v-for="(s, i) in (loud ? sparks : [])" :key="'s' + i" class="fx-spark" :style="s"></span>
    </div>

    <div v-if="stage === 'awaiting'" class="reveal-hint"><span>Cliquer pour retourner</span></div>

    <template v-if="stage === 'revealed'">
      <div class="reveal-meta">
        <div class="reveal-banner"><Gift :size="13" aria-hidden="true" />{{ gift ? 'Booster de Noël' : 'Bonus de Noël' }}<Gift :size="13" aria-hidden="true" /></div>
        <div class="reveal-name">{{ member.name }}</div>
        <div class="reveal-tags">
          <span v-if="isNew" class="chip new-chip">Nouveau</span>
          <span class="chip">Équipe</span>
        </div>
        <div class="reveal-note mono">
          <template v-if="!gift">En plus du Pokémon de cette carte · </template>{{ isNew ? 'Nouvelle dans ton étagère Équipe' : 'Déjà dans ton étagère Équipe' }}
        </div>
      </div>
      <button ref="nextEl" class="next-btn" @click="emit('next')">
        {{ remaining > 1 ? `Carte suivante · ${remaining - 1} restante${remaining - 1 > 1 ? 's' : ''}` : 'Retour à la collection' }}
      </button>
    </template>
  </div>
</template>
