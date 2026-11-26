<script setup>
import { computed, ref } from 'vue'
import { Snowflake } from '@lucide/vue'
import { formatDate } from '../lib/dates.js'

/**
 * La carte d'un membre de l'équipe : un carton vert sapin semé de flocons, un ruban rouge noué
 * en coin, une photo à la place du sprite, la description sous le nom. La dorure du légendaire
 * reste (filets, halo), mais la carte ne s'y confond plus : c'est une édition à part. Même objet que la PokeCard — même face, même dos, même
 * retournement piloté par le parent — sans numéro ni palier : elle n'appartient à aucune planche.
 */
const props = defineProps({
  member: { type: Object, required: true },
  provenance: { type: Object, default: null },
  flipped: { type: Boolean, default: false },
  scene: { type: String, default: 'day' },
})
const emit = defineEmits(['activate'])

const tilt = ref(null)
const style = computed(() => ({
  '--tier': 'var(--t-l)',
  ...(tilt.value ? { '--px': tilt.value.px, '--py': tilt.value.py, '--rx': tilt.value.rx + 'deg', '--ry': tilt.value.ry + 'deg' } : {}),
}))
const clamp = (v) => Math.min(Math.max(v, 0), 1)
function onMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const px = clamp((e.clientX - r.left) / r.width)
  const py = clamp((e.clientY - r.top) / r.height)
  tilt.value = { px: +px.toFixed(3), py: +py.toFixed(3), rx: +((0.5 - py) * 24).toFixed(2), ry: +((px - 0.5) * 28).toFixed(2) }
}
const onLeave = () => { tilt.value = { px: 0.5, py: 0.5, rx: 0, ry: 0 } }
const initial = computed(() => props.member.name.trim()[0]?.toUpperCase() ?? '?')
</script>

<template>
  <div
    class="pkc pkc-team" :class="[`scene-${scene}`, { 'is-flipped': flipped, 'is-live': tilt }]"
    data-tier="l" :style="style" tabindex="0" role="button"
    @pointermove="onMove" @pointerleave="onLeave"
    @click="emit('activate')"
    @keyup.enter="emit('activate')" @keyup.space="emit('activate')"
    @keydown.space.prevent
  >
    <div class="pkc-face pkc-front" :aria-hidden="flipped ? 'true' : null">
      <div class="pkc-bg"></div>
      <div class="pkc-frame"></div>
      <span class="pkc-corner tl"></span><span class="pkc-corner tr"></span>
      <span class="pkc-corner bl"></span><span class="pkc-corner br"></span>
      <span class="team-ribbon" aria-hidden="true">
        <svg class="team-bow" viewBox="0 0 32 24">
          <path d="M15 13 10 22.5l3-1 2 2.5zM17 13l5 9.5-3-1-2 2.5z" />
          <path d="M16 12C10 2 2 4 4 10c1 4 7 4 12 2zM16 12c6-10 14-8 12-2-1 4-7 4-12 2z" />
          <circle cx="16" cy="12" r="2.6" />
        </svg>
      </span>
      <div class="pkc-top"><span class="pkc-no mono">Équipe · Noël</span></div>
      <div class="pkc-art">
        <img v-if="member.photoUrl" class="team-photo" :src="member.photoUrl" :alt="member.name">
        <span v-else class="team-photo team-photo-none" aria-hidden="true">{{ initial }}</span>
      </div>
      <div class="pkc-sheen"></div>
      <div class="pkc-rule"></div>
      <div class="pkc-bot">
        <span class="pkc-name">{{ member.name }}</span>
        <span class="team-blurb">{{ member.blurb }}</span>
      </div>
    </div>

    <div v-if="provenance" class="pkc-face pkc-back" data-back="noel" :aria-hidden="flipped ? null : 'true'">
      <div class="pkc-back-rosace"></div>
      <div class="pkc-back-sheen"></div>
      <div class="pkc-back-head mono">
        <span class="pkc-back-no">Édition Noël</span>
        <span class="pkc-back-date">{{ formatDate(provenance.date) }}</span>
      </div>
      <span class="pkc-mark"><Snowflake class="pkc-back-legend" aria-hidden="true" /><span class="pkc-mark-word"><i>PR</i>·DEX</span></span>
      <div class="pkc-lab">
        <span class="pkc-lab-eyebrow">Provenance</span>
        <span v-if="provenance.ref" class="pkc-lab-ref mono">{{ provenance.ref }}</span>
        <span class="pkc-lab-title">{{ provenance.label }}</span>
      </div>
    </div>
  </div>
</template>
