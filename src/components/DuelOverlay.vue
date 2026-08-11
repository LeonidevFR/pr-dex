<script setup>
import { computed, onMounted, ref } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { FORMS, TIER_POWER, levelFactor } from '../../shared/battle.js'
import { STATS } from '../../shared/species-stats.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  duel: { type: Object, required: true },
  userId: { type: String, required: true },
})
defineEmits(['close'])

/**
 * Deux temps, et le second ne vient qu'après le premier : on regarde les deux Pokémon avant de
 * savoir lequel tombe. Sans cette pause, la révélation et le verdict arrivent ensemble et le
 * duel n'a jamais eu lieu — il s'est juste affiché.
 */
const stage = ref('face')
onMounted(() => setTimeout(() => { stage.value = 'verdict' }, 1400))

/** Je suis le challengeur ou le preneur : tout l'affichage se lit depuis ce côté-là. */
const iAmChallenger = computed(() => props.duel.challenger_id === props.userId)

const side = (mine) => {
  const c = iAmChallenger.value === mine
  return {
    species: c ? props.duel.challenger_species : props.duel.opponent_species,
    level: c ? props.duel.challenger_level : props.duel.opponent_level,
    form: c ? props.duel.challenger_form : props.duel.opponent_form,
    power: Number(c ? props.duel.challenger_power : props.duel.opponent_power),
  }
}

const mine = computed(() => side(true))
const theirs = computed(() => side(false))

const versusComputer = computed(() => props.duel.status === 'computer')

const iWon = computed(() => props.duel.winner_id === props.userId)

/** La probabilité est stockée pour le camp challengeur : vue de l'autre côté, elle se retourne. */
const myOdds = computed(() => {
  const p = Number(props.duel.probability)
  return Math.round((iAmChallenger.value ? p : 1 - p) * 100)
})

const tierOf = (species) => DEX[species]?.tier ?? 'c'
const nameOf = (species) => DEX[species]?.name ?? '—'
const formName = (i) => FORMS[i]?.name ?? '—'

/**
 * Le détail du calcul, pour que le résultat se vérifie au lieu de se croire. Une issue
 * probabiliste sans explication passe pour arbitraire — surtout quand elle vient de détruire un
 * Pokémon qu'on a mis des semaines à obtenir.
 */
const breakdown = (s) => [
  ['stats de base', STATS[s.species]],
  [TIER_LABEL[tierOf(s.species)].toLowerCase(), `×${TIER_POWER[tierOf(s.species)].toFixed(2)}`],
  [`niveau ${s.level}`, `×${levelFactor(s.level).toFixed(2)}`],
  [formName(s.form).toLowerCase(), `×${FORMS[s.form]?.factor.toFixed(2)}`],
]
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(560px,100%)">
      <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">DUEL</span>
          <h2 class="panel-name" style="font-size:23px;margin-bottom:0">
            {{ versusComputer ? 'Contre l’ordinateur' : 'Contre un dresseur' }}
          </h2>
        </div>
      </div>

      <div class="sect">
        <div class="sim-row">
          <div class="sim">
            <img :src="spriteUrl(mine.species)" :alt="nameOf(mine.species)">
            <span class="line-name">{{ nameOf(mine.species) }}</span>
            <span class="mono muted">niv. {{ mine.level }}</span>
          </div>
          <span class="line-arrow mono">vs</span>
          <div class="sim">
            <img :src="spriteUrl(theirs.species)" :alt="nameOf(theirs.species)">
            <span class="line-name">{{ nameOf(theirs.species) }}</span>
            <span class="mono muted">niv. {{ theirs.level }}</span>
          </div>
        </div>
      </div>

      <template v-if="stage === 'verdict'">
        <div class="sect">
          <div class="reveal-banner" :style="{ '--t': TIER_VAR[duel.stake_tier] }">
            {{ iWon ? 'Victoire' : 'Défaite' }}
          </div>
          <p class="muted" style="margin-top:8px">
            <template v-if="versusComputer">
              L’ordinateur ne possède rien : personne ne perd de Pokémon, et il n’y a pas de pli
              à gagner — seulement des pokédollars, au cinquième du tarif.
            </template>
            <template v-else-if="iWon">
              Son exemplaire est détruit. Tu gardes le tien, il gagne un niveau, et un pli
              {{ TIER_LABEL[duel.stake_tier].toLowerCase() }} t’attend au prochain passage.
            </template>
            <template v-else>
              Ton exemplaire est détruit. L’espèce reste à la planche — c’est l’exemplaire qui
              disparaît, pas ce que tu as vu.
            </template>
          </p>
        </div>

        <div class="sect">
          <div class="eyebrow sect-h">
            <span>Enjeu du duel</span>
            <span class="chip" :style="{ '--t': TIER_VAR[duel.stake_tier] }">
              {{ TIER_LABEL[duel.stake_tier] }}
            </span>
          </div>
          <p class="muted">
            Le plus petit des deux engagements : on ne gagne jamais plus que ce que l’autre a mis
            sur la table.
          </p>
        </div>

        <div class="sect">
          <div class="eyebrow sect-h"><span>Comment ça s’est joué</span></div>
          <div class="steps">
            <div v-for="[quoi, combien] in breakdown(mine)" :key="'m' + quoi" class="line">
              <span class="line-name">{{ quoi }}</span>
              <span class="mono">{{ combien }}</span>
            </div>
            <div class="line line-here">
              <span class="line-name">ta puissance</span>
              <span class="mono">{{ Math.round(mine.power) }}</span>
            </div>
            <div class="line">
              <span class="line-name">la sienne</span>
              <span class="mono">{{ Math.round(theirs.power) }}</span>
            </div>
            <div class="line">
              <span class="line-name">tes chances</span>
              <span class="mono">{{ myOdds }} %</span>
            </div>
            <div class="line">
              <span class="line-name">tirage</span>
              <span class="mono">{{ Number(duel.roll).toFixed(4) }}</span>
            </div>
          </div>
          <p class="muted" style="margin-top:8px">
            Aucun duel n’est gagné d’avance : les chances sont bornées entre 10 et 90 %, quel que
            soit l’écart.
          </p>
        </div>

        <div class="sect">
          <div class="front-actions">
            <button class="btn-solid" @click="$emit('close')">Fermer</button>
          </div>
        </div>
      </template>
      <div v-else class="sect">
        <p class="muted">Les deux mises se révèlent…</p>
      </div>
    </div>
  </div>
</template>
