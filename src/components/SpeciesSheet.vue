<script setup>
import { computed } from 'vue'
import { DEX, PARENT, TIER_LABEL, TIER_VAR, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  id: { type: Number, required: true },
  entries: { type: Array, default: null },
  candies: { type: Number, required: true },
  canEvolve: { type: Boolean, required: true },
  isDeadEnd: { type: Boolean, required: true },
})
defineEmits(['close', 'evolve'])

const species = computed(() => DEX[props.id])
const caught = computed(() => (props.entries?.length ?? 0) > 0)
const shiny = computed(() => props.entries?.some((e) => e.shiny) ?? false)
const targets = computed(() => {
  const to = species.value.to
  return to === null ? [] : Array.isArray(to) ? to : [to]
})
const pad = (n) => String(n).padStart(3, '0')
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" :style="{ '--tier': TIER_VAR[species.tier] }">
      <div class="panel-top">
        <button class="x" @click="$emit('close')">✕</button>
        <div class="panel-art" :class="{ ghost: !caught }">
          <img :src="spriteUrl(id, shiny)" :alt="species.name" @error="$event.target.dataset.broken = '1'">
        </div>
        <div>
          <span class="panel-plate mono">PLANCHE Nº {{ pad(id) }}</span>
          <h2 class="panel-name">{{ caught ? species.name : '—————' }}</h2>
          <span class="chip">{{ TIER_LABEL[species.tier] }}</span>
          <span v-if="shiny" class="chip shiny-chip" style="margin-left:6px">✦ Chromatique</span>
        </div>
      </div>

      <div v-if="!caught" class="sect">
        <p class="muted">
          Pas encore à la planche. Sortira d'une PR<template v-if="PARENT[id]">, ou d'une évolution de
          <b>{{ DEX[PARENT[id]].name }}</b></template>.
        </p>
      </div>

      <div v-if="caught" class="sect">
        <div class="eyebrow sect-h">
          <span>Journal des captures</span>
          <span class="mono" style="color:var(--ink-3)">
            {{ entries.length }} entrée{{ entries.length > 1 ? 's' : '' }}
          </span>
        </div>
        <div class="log">
          <component
            v-for="(e, i) in entries" :key="e.sha ?? e.date + '-' + i"
            :is="e.via === 'pr' ? 'a' : 'div'" class="log-row"
            :href="e.via === 'pr' ? `https://github.com/${e.repo}/pull/${e.pr}` : null"
            target="_blank" rel="noopener"
          >
            <span v-if="e.via === 'pr'" class="log-sha">{{ e.sha.slice(0, 7) }}</span>
            <span v-else class="log-evo">↑ évo</span>
            <span class="log-title">
              {{ e.via === 'pr' ? e.title : 'Évolué depuis ' + DEX[e.from].name }}
              <span v-if="e.via === 'pr'" class="log-repo"> · {{ e.repo }}#{{ e.pr }}</span>
            </span>
            <span class="log-date">{{ e.date }}</span>
          </component>
        </div>
      </div>

      <div v-if="caught && targets.length" class="sect">
        <div class="eyebrow sect-h"><span>Bonbons {{ DEX[familyOf(id)].name }}</span></div>
        <div class="candy">
          <div class="candy-meter">
            <div class="candy-nums"><b>{{ candies }}</b><i> / {{ species.cost }}</i></div>
            <div class="cbar">
              <div class="cbar-fill" :style="{ width: Math.min(100, candies / species.cost * 100) + '%' }"></div>
            </div>
          </div>
          <button
            v-if="targets.length === 1" class="evo-btn" :disabled="!canEvolve"
            @click="$emit('evolve', { from: id, to: targets[0] })"
          >
            Faire évoluer en {{ DEX[targets[0]].name }}
          </button>
        </div>
        <div v-if="targets.length > 1" class="evo-choices">
          <button
            v-for="t in targets" :key="t" class="evo-choice" :disabled="!canEvolve"
            @click="$emit('evolve', { from: id, to: t })"
          >
            <img :src="spriteUrl(t)" :alt="DEX[t].name">{{ DEX[t].name }}
          </button>
        </div>
        <p class="muted" style="margin-top:12px">
          {{ CANDY_PER_CATCH }} bonbons par capture dans la famille. Les doublons servent à ça.
        </p>
      </div>

      <div v-else-if="caught && entries.length > 1 && isDeadEnd" class="sect">
        <div class="eyebrow sect-h"><span>La réserve</span></div>
        <div class="reserve">
          <div class="reserve-count mono">{{ entries.length }}</div>
          <div class="reserve-txt">
            <p class="muted">
              <b>{{ species.name }}</b> n'évolue pas — ses doublons ne se convertissent pas, et c'est
              assumé. Ils s'empilent comme une petite collection dans la réserve : « encore un », mais
              dans un tiroir qui se remplit.
            </p>
            <div class="press"><span v-for="n in Math.min(entries.length, 12)" :key="n">{{ pad(id) }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
