<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import { fnv1a } from '../../shared/draw.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  entry: { type: Object, required: true },
  remaining: { type: Number, required: true },
  // Lu par App.vue avant le `claim` — celui-ci inscrit l'espèce au dex dès le sceau brisé.
  isNew: { type: Boolean, default: false },
})
const emit = defineEmits(['claim', 'next', 'skip-all', 'close'])

/**
 * Quatre crans, durée quasi constante : le rituel se rejoue ~300 fois par an. L'écart
 * entre un commun et un légendaire passe par l'intensité (rayons, halo, flash), pas par
 * une attente plus longue — sinon on cherche à le sauter au bout d'une semaine.
 */
const INTENSITY = {
  c: { rayop: 0, glow: '8px', flashscale: 2.4 },
  u: { rayop: 0.10, glow: '16px', flashscale: 3.2 },
  r: { rayop: 0.20, glow: '30px', flashscale: 4.2 },
  l: { rayop: 0.34, glow: '52px', flashscale: 5.5 },
}

const stage = ref('sealed') // sealed → silhouette → revealed
let timer = null

const species = computed(() => DEX[props.entry.species])
const tier = computed(() => species.value.tier)
const intensity = computed(() => INTENSITY[tier.value])

const style = computed(() => ({
  '--tier': TIER_VAR[tier.value],
  ...(stage.value !== 'sealed'
    ? {
        '--rayop': intensity.value.rayop,
        '--glow': intensity.value.glow,
        '--flashscale': intensity.value.flashscale,
      }
    : {}),
}))

const sparks = Array.from({ length: 16 }, (_, i) => ({
  left: (fnv1a('sx' + i) % 100) + '%',
  top: (fnv1a('sy' + i) % 100) + '%',
  animationDelay: ((fnv1a('sd' + i) % 160) / 100) + 's',
}))

function tear() {
  stage.value = 'silhouette'
  // Émis avant que l'écriture ne soit confirmée : la révélation est une animation, pas une
  // preuve d'écriture. Si `claim` échoue, `state.claimed` n'est jamais mis à jour et le pli
  // reste dans `pending` — il réapparaît à la prochaine ouverture. C'est le comportement
  // voulu : ne pas avaler l'échec en gardant la révélation silencieuse sur son sort réel.
  emit('claim', props.entry.sha)
  const reduced = window.matchMedia('(prefers-reduced-motion:reduce)').matches
  const hold = reduced ? 150 : (tier.value === 'l' ? 2800 : 2200)
  timer = setTimeout(() => { stage.value = 'revealed' }, hold)
}

onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <div class="ritual" :class="{ opened: stage !== 'sealed', leg: stage !== 'sealed' && tier === 'l' }" :style="style">
    <button
      class="x ritual-close" aria-label="Revenir à la planche, garder les plis restants pour plus tard"
      @click="$emit('close')"
    >✕</button>

    <template v-if="stage === 'sealed'">
      <div class="stack">
        <div v-if="remaining > 2" class="ghost-pkt g1"></div>
        <div v-if="remaining > 1" class="ghost-pkt g2"></div>
        <button class="packet" @click="tear">
          <div class="pkt-head"><span class="pkt-kicker">Pli scellé · {{ entry.date }}</span></div>
          <div class="pkt-body">
            <div class="pkt-seal">✳</div>
            <div class="pkt-title">{{ entry.title }}</div>
            <div class="pkt-pr mono">{{ entry.repo }}#{{ entry.pr }}<br>{{ entry.sha.slice(0, 7) }}</div>
          </div>
          <div class="pkt-foot">Briser le sceau</div>
        </button>
      </div>
      <div class="queue-note">{{ remaining > 1 ? remaining + ' plis en attente' : 'dernier pli' }}</div>
    </template>

    <template v-else>
      <div class="reveal" :class="stage">
        <div v-if="tier !== 'c'" class="rays"></div>
        <div v-if="stage === 'silhouette'" class="dev-ring"></div>
        <div v-if="stage === 'revealed'" class="flash"></div>
        <img
          :class="{ silh: stage === 'silhouette' }" :src="spriteUrl(entry.species, entry.shiny)"
          :alt="species.name" @error="$event.target.dataset.broken = '1'"
        >
        <div v-if="entry.shiny && stage === 'revealed'" class="shiny-burst">
          <span v-for="(s, i) in sparks" :key="i" class="spark" :style="s"></span>
        </div>
      </div>

      <div v-if="stage === 'silhouette'" class="dev-note mono">
        {{ entry.shiny ? 'quelque chose scintille…' : 'révélation en cours…' }}
      </div>

      <template v-if="stage === 'revealed'">
        <div class="reveal-meta">
          <div v-if="entry.shiny" class="reveal-banner">✦ Chromatique ✦</div>
          <div v-else-if="tier === 'l'" class="reveal-banner">★ Légendaire ★</div>
          <div class="reveal-name">{{ species.name }}</div>
          <div class="reveal-tags">
            <span v-if="isNew" class="chip new-chip">Nouveau</span>
            <span class="chip">{{ TIER_LABEL[tier] }}</span>
            <span v-if="entry.shiny" class="chip shiny-chip">✦ Chromatique</span>
          </div>
          <div class="reveal-note mono">
            {{ isNew ? 'Première entrée à la planche' : 'Déjà à la planche' }} ·
            +{{ CANDY_PER_CATCH }} bonbons <b>{{ DEX[familyOf(entry.species)].name }}</b>
          </div>
        </div>
        <button class="next-btn" @click="$emit('next')">
          {{ remaining > 1 ? `Suivant · ${remaining - 1} restant${remaining - 1 > 1 ? 's' : ''}` : 'Retour à la planche' }}
        </button>
        <button
          v-if="remaining > 1" class="queue-note"
          style="background:none;border:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px"
          @click="$emit('skip-all')"
        >
          tout ouvrir sans cérémonie
        </button>
      </template>
    </template>
  </div>
</template>
