<script setup>
import { computed, ref } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  credits: { type: Number, required: true },
  pokedollars: { type: Number, required: true },
  challenges: { type: Array, required: true },
  engageable: { type: Array, required: true },
  myOpen: { type: Object, default: null },
  levelOf: { type: Function, required: true },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'engage', 'accept'])

/** L'exemplaire retenu pour la prochaine mise — rien n'est engagé tant qu'on n'a pas confirmé. */
const chosen = ref(null)

const canPlay = computed(() => props.credits > 0 && props.engageable.length > 0)

/**
 * Les défis des autres. Le sien n'est pas relevable — on ne peut pas se battre contre soi-même —
 * et il est déjà rappelé à part, avec sa mise, que l'on est seul à voir.
 */
const others = computed(() => props.challenges.filter((c) => c.id !== props.myOpen?.id))

const tierOf = (key) => DEX[props.engageable.find((e) => e.key === key)?.species]?.tier ?? 'c'

const nameOf = (key) => DEX[props.engageable.find((e) => e.key === key)?.species]?.name ?? '—'


function play(vsComputer) {
  if (!chosen.value) return
  emit('engage', chosen.value, vsComputer)
  chosen.value = null
}

function take(duelId) {
  if (!chosen.value) return
  emit('accept', duelId, chosen.value)
  chosen.value = null
}
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(620px,100%)">
      <div class="panel-top" style="align-items:flex-start;padding-bottom:20px">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">ARÈNE</span>
          <h2 class="panel-name" style="font-size:23px;margin-bottom:0">Duels</h2>
        </div>
      </div>

      <div class="sect">
        <div class="eyebrow sect-h">
          <span>{{ credits }} engagement{{ credits > 1 ? 's' : '' }} disponible{{ credits > 1 ? 's' : '' }}</span>
          <span class="mono">{{ pokedollars }} ₽</span>
        </div>
        <p v-if="!credits" class="muted">
          Un engagement par jour ouvré, cumulable jusqu’à cinq. Reviens demain.
        </p>
      </div>

      <div v-if="myOpen" class="sect">
        <div class="eyebrow sect-h"><span>Ton défi en cours</span></div>
        <div class="repo-ptr">
          <span class="dot"></span>
          {{ DEX[myOpen.species]?.name }} t’attend sur la table — personne d’autre ne voit ce que tu as engagé.
        </div>
      </div>

      <div v-if="canPlay" class="sect">
        <div class="eyebrow sect-h"><span>Ce que tu engages</span></div>
        <div class="evo-choices">
          <button
            v-for="e in engageable" :key="e.key"
            class="evo-choice" :class="{ press: chosen === e.key }"
            :style="{ '--t': TIER_VAR[DEX[e.species].tier] }"
            @click="chosen = chosen === e.key ? null : e.key"
          >
            <img :src="spriteUrl(e.species, e.shiny)" :alt="DEX[e.species].name">
            <span class="line-name">{{ DEX[e.species].name }}</span>
            <span class="mono muted">niv. {{ levelOf(e.key) }}</span>
          </button>
        </div>
      </div>

      <div v-if="chosen" class="sect">
        <div class="eyebrow sect-h">
          <span>{{ nameOf(chosen) }}, niveau {{ levelOf(chosen) }}</span>
          <span class="chip" :style="{ '--t': TIER_VAR[tierOf(chosen)] }">{{ TIER_LABEL[tierOf(chosen)] }}</span>
        </div>
        <p class="muted">
          Si tu perds, il est détruit. L’espèce reste à la planche, l’exemplaire non.
        </p>
        <div class="front-actions" style="margin-top:12px">
          <button class="btn-solid" :disabled="busy" @click="play(false)">Poster un défi</button>
          <button class="btn-ghost" :disabled="busy" @click="play(true)">Affronter l’ordinateur</button>
        </div>
      </div>

      <div class="sect">
        <div class="eyebrow sect-h"><span>Défis ouverts</span></div>
        <p v-if="!others.length" class="muted">
          Personne n’a de défi en attente. Poste le tien — s’il reste sans preneur, l’ordinateur
          le relèvera demain.
        </p>
        <div v-for="d in others" :key="d.id" class="log-row">
          <span class="log-title">{{ d.pseudo ?? 'Sans nom' }}</span>
          <span class="log-sha mono">mise cachée</span>
          <button class="evo-btn" :disabled="busy || !chosen" @click="take(d.id)">Relever</button>
        </div>
        <p v-if="others.length && !chosen" class="muted" style="margin-top:8px">
          Choisis d’abord ce que tu engages : les deux mises se révèlent en même temps.
        </p>
      </div>
    </div>
  </div>
</template>
