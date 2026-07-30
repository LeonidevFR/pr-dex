<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR, RAY_PALETTE, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
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
  c: { rayop: 0.10, glow: '8px', flashscale: 2.4, rayspeed: '7s' },
  u: { rayop: 0.18, glow: '16px', flashscale: 3.2, rayspeed: '6s' },
  r: { rayop: 0.42, glow: '38px', flashscale: 5.2, rayspeed: '3.2s' },
  l: { rayop: 0.65, glow: '66px', flashscale: 7.5, rayspeed: '1.8s' },
}

const RAY_LAYER_COUNT = { c: 3, u: 4, r: 5, l: 6 }
const MULTICOLOR_TIERS = new Set(['r', 'l'])
// Vitesses et pas de wedge décorrélés de l'index pour éviter que les couches se superposent
// à l'identique (lisible comme "un seul disque plus épais" plutôt que plusieurs rayons).
const SPEED_MULTIPLIERS = [1, 0.8, 1.3, 0.65, 1.15, 0.9]

const rayLayers = computed(() => {
  const count = RAY_LAYER_COUNT[tier.value]
  const multicolor = MULTICOLOR_TIERS.has(tier.value)
  const baseColor = TIER_VAR[tier.value]
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    color: multicolor ? RAY_PALETTE[i % RAY_PALETTE.length] : baseColor,
    direction: i % 2 === 0 ? 'normal' : 'reverse',
    speedMultiplier: SPEED_MULTIPLIERS[i % SPEED_MULTIPLIERS.length],
    wedgeDeg: Math.max(20 - i * 2.5, 6),
    opacityFactor: Math.max(1 - i * 0.12, 0.4),
  }))
})

function rayLayerStyle(layer) {
  return {
    '--ray-color': layer.color,
    '--ray-wedge': layer.wedgeDeg + 'deg',
    '--ray-opacity-factor': layer.opacityFactor,
    animationDuration: `calc(var(--rayspeed) * ${layer.speedMultiplier}), .8s`,
    animationDirection: `${layer.direction}, normal`,
  }
}

const stage = ref('sealed') // sealed → silhouette → revealed
let timer = null

const species = computed(() => DEX[props.entry.species])
const tier = computed(() => species.value.tier)
const intensity = computed(() => INTENSITY[tier.value])
// Le flash + la salve de particules ne sont pas réservés au chromatique : un rare ou un
// légendaire doit taper aussi fort, à chaque tirage — pas seulement le premier de sa vie.
const big = computed(() => props.entry.shiny || tier.value === 'r' || tier.value === 'l')

const style = computed(() => ({
  '--tier': TIER_VAR[tier.value],
  ...(stage.value !== 'sealed'
    ? {
        '--rayop': intensity.value.rayop,
        '--glow': intensity.value.glow,
        '--flashscale': intensity.value.flashscale,
        '--rayspeed': intensity.value.rayspeed,
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
  emit('claim', props.entry.key)
  const hold = tier.value === 'l' ? 2800 : 2200
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
            <div class="pkt-title">{{ entry.label }}</div>
            <div v-if="entry.ref" class="pkt-pr mono">{{ entry.ref }}</div>
          </div>
          <div class="pkt-foot">Briser le sceau</div>
        </button>
      </div>
      <div class="queue-note">{{ remaining > 1 ? remaining + ' plis en attente' : 'dernier pli' }}</div>
    </template>

    <template v-else>
      <div class="reveal" :class="stage">
        <div
          v-for="layer in rayLayers" :key="layer.key" class="ray-layer"
          :style="rayLayerStyle(layer)"
        ></div>
        <div v-if="stage === 'silhouette'" class="dev-ring"></div>
        <div v-if="stage === 'revealed'" class="flash"></div>
        <img
          :class="{ silh: stage === 'silhouette' }" :src="spriteUrl(entry.species, entry.shiny)"
          :alt="species.name" @error="$event.target.dataset.broken = '1'"
        >
        <div v-if="big && stage === 'revealed'" class="burst">
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
