<script setup>
import { computed, ref } from 'vue'
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
  /**
   * Ce qui a produit l'exemplaire : `{ ref, label, date }`. Absente sur la fiche d'espèce,
   * où l'on consulte une espèce et non un exemplaire daté — la carte n'y a alors pas de dos.
   * `ref` peut manquer : toutes les sources ne fournissent pas de référence courte.
   */
  provenance: { type: Object, default: null },
  /**
   * Le retournement appartient au parent, jamais à la carte. Elle se contente d'émettre
   * `activate` quand on la sollicite ; ce que ça veut dire dépend de l'écran — le rituel y
   * lit « retourne-toi », la fiche d'espèce « montre le sprite en grand ».
   */
  flipped: { type: Boolean, default: false },
  /**
   * Sur mobile il n'y a pas de survol. L'inclinaison est un bonus de bureau : la carte doit
   * rester entière sans elle. On ne réclame pas pour autant l'accès aux capteurs de
   * mouvement — demander une permission système pour un effet décoratif est disproportionné.
   */
  tiltable: { type: Boolean, default: true },
})

const emit = defineEmits(['activate'])

const species = computed(() => DEX[props.speciesId])
// Le cachet de cire scelle ce qui vaut d'être scellé : au-dessus, il ne signifierait plus rien.
const sealed = computed(() => props.tier === 'r' || props.tier === 'l')

const pad = (n) => String(n).padStart(3, '0')

// `null` tant que le pointeur n'a pas touché la carte : elle reste alors strictement à plat,
// et aucune variable d'inclinaison n'est écrite — c'est ce que vérifie le mode non inclinable.
const tilt = ref(null)

const style = computed(() => ({
  '--tier': TIER_VAR[props.tier],
  ...(tilt.value
    ? {
        '--px': tilt.value.px,
        '--py': tilt.value.py,
        '--rx': tilt.value.rx + 'deg',
        '--ry': tilt.value.ry + 'deg',
      }
    : {}),
}))

const clamp = (v) => Math.min(Math.max(v, 0), 1)

function onMove(e) {
  if (!props.tiltable) return
  const r = e.currentTarget.getBoundingClientRect()
  const px = clamp((e.clientX - r.left) / r.width)
  const py = clamp((e.clientY - r.top) / r.height)
  // La position sert deux fois : au relief, et au déplacement du balayage de lumière — c'est
  // ce couplage qui fait lire « une surface éclairée » plutôt que « une image qui bouge ».
  tilt.value = {
    px: Number(px.toFixed(3)),
    py: Number(py.toFixed(3)),
    rx: Number(((0.5 - py) * 24).toFixed(2)),
    ry: Number(((px - 0.5) * 28).toFixed(2)),
  }
}

function onLeave() {
  if (!props.tiltable) return
  tilt.value = { px: 0.5, py: 0.5, rx: 0, ry: 0 }
}
</script>

<template>
  <div
    class="pkc" :class="[`scene-${scene}`, { 'is-shiny': shiny, 'is-flipped': flipped, 'is-live': tilt }]"
    :data-tier="tier" :style="style" tabindex="0" role="button"
    @pointermove="onMove" @pointerleave="onLeave"
    @click="emit('activate')"
    @keyup.enter="emit('activate')" @keyup.space="emit('activate')"
    @keydown.space.prevent
  >
    <!-- Les deux faces coexistent pour que le retournement soit une vraie rotation. Mais
         `backface-visibility` ne cache qu'à l'œil : sans `aria-hidden`, un lecteur d'écran
         annoncerait l'espèce avant que la carte ne soit retournée, ce qui vend la mèche. -->
    <div class="pkc-face pkc-front" :aria-hidden="flipped ? 'true' : null">
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

    <!-- Le dos, c'est le sachet ouvert, et l'étiquette de spécimen collée dessus. C'est ce
         qui donne une raison de retourner la carte : elle dit d'où elle vient. -->
    <div v-if="provenance" class="pkc-face pkc-back" :aria-hidden="flipped ? null : 'true'">
      <div class="pkc-back-head">
        <span class="pkc-mark">PR·DEX</span>
        <span class="pkc-torn">ouvert</span>
      </div>
      <div class="pkc-lab">
        <span class="pkc-lab-eyebrow">Provenance</span>
        <span v-if="provenance.ref" class="pkc-lab-ref mono">{{ provenance.ref }}</span>
        <span class="pkc-lab-title">{{ provenance.label }}</span>
        <span class="pkc-lab-date mono">{{ provenance.date }}</span>
      </div>
      <span class="pkc-back-foot">Une PR mergée · un tirage</span>
    </div>
  </div>
</template>
