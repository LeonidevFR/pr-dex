<script setup>
import { computed } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  speciesId: { type: Number, required: true },
  tier: { type: String, required: true },
  shiny: { type: Boolean, default: false },
  /**
   * L'éclairage, jamais la matière. La carte gagnée au tirage et la carte retrouvée à la
   * planche sont le même objet — sinon elle ne se posséderait pas, elle se rejouerait. La
   * scène nocturne se contente de pousser la dorure et le halo.
   */
  scene: { type: String, default: 'day' },
})

const species = computed(() => DEX[props.speciesId])
// Le cachet de cire scelle ce qui vaut d'être scellé : au-dessus, il ne signifierait plus rien.
const sealed = computed(() => props.tier === 'r' || props.tier === 'l')

const pad = (n) => String(n).padStart(3, '0')
</script>

<template>
  <div
    class="pkc" :class="[`scene-${scene}`, { 'is-shiny': shiny }]"
    :data-tier="tier" :style="{ '--tier': TIER_VAR[tier] }"
  >
    <div class="pkc-face pkc-front">
      <div class="pkc-bg"></div>
      <div class="pkc-frame"></div>
      <span class="pkc-corner tl"></span><span class="pkc-corner tr"></span>
      <span class="pkc-corner bl"></span><span class="pkc-corner br"></span>

      <div class="pkc-top">
        <span class="pkc-no mono">Nº {{ pad(speciesId) }}</span>
      </div>
      <div class="pkc-art">
        <img
          :src="spriteUrl(speciesId, shiny)" :alt="species.name"
          @error="$event.target.dataset.broken = '1'"
        >
      </div>
      <span v-if="sealed" class="pkc-wax">PR</span>

      <div class="pkc-sheen"></div>
      <div class="pkc-iris"></div>

      <div class="pkc-rule"></div>
      <div class="pkc-bot">
        <span class="pkc-name">{{ species.name }}{{ shiny ? ' ✦' : '' }}</span>
        <span class="pkc-tier">{{ TIER_LABEL[tier] }}</span>
      </div>
    </div>
  </div>
</template>
