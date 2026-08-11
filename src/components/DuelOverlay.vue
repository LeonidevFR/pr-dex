<script setup>
import { computed, onMounted, ref } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { FORMS, TIER_POWER, levelFactor } from '../../shared/battle.js'
import { REWARD, COMPUTER_REWARD } from '../../shared/arena-economy.js'
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
onMounted(() => setTimeout(() => { stage.value = 'verdict' }, 2200))

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

/**
 * Ce que le duel rapporte, au palier de l'enjeu. Affiché en toutes lettres plutôt que laissé à
 * deviner : un gain qu'on ne voit pas est un gain qui n'existe pas pour le joueur.
 */
const reward = computed(() => {
  const t = props.duel.stake_tier
  if (versusComputer.value) return { dollars: Math.round(COMPUTER_REWARD[t]), points: 0, pack: false }
  return { dollars: REWARD[t].dollars, points: REWARD[t].points, pack: true }
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
        <div class="arena-vs">
          <div class="arena-mon" :class="{ lost: stage === 'verdict' && !iWon }">
            <img :src="spriteUrl(mine.species)" :alt="nameOf(mine.species)">
            <span class="line-name">{{ nameOf(mine.species) }}</span>
            <span class="mono muted">niv. {{ mine.level }}</span>
          </div>
          <span class="arena-vs-mark">VS</span>
          <div class="arena-mon" :class="{ lost: stage === 'verdict' && iWon }">
            <img :src="spriteUrl(theirs.species)" :alt="nameOf(theirs.species)">
            <span class="line-name">{{ nameOf(theirs.species) }}</span>
            <span class="mono muted">niv. {{ theirs.level }}</span>
          </div>
        </div>
      </div>

      <template v-if="stage === 'verdict'">
        <div class="sect">
          <div
            class="arena-verdict" :class="iWon ? 'won' : 'lost'"
            :style="{ '--t': TIER_VAR[duel.stake_tier] }"
          >{{ iWon ? 'Victoire' : 'Défaite' }}</div>
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

        <div v-if="iWon" class="sect">
          <div class="eyebrow sect-h"><span>Ce que tu remportes</span></div>
          <div class="arena-reward">
            <div>
              <span class="v">{{ reward.dollars }} ₽</span>
              <span class="arena-unit">gagnés</span>
            </div>
            <div v-if="reward.points">
              <span class="v">{{ reward.points }}</span>
              <span class="arena-unit">points de saison</span>
            </div>
            <div v-if="reward.pack">
              <span class="v">1</span>
              <span class="arena-unit">pli {{ TIER_LABEL[duel.stake_tier].toLowerCase() }}</span>
            </div>
          </div>
        </div>

        <div class="sect">
          <div class="eyebrow sect-h">
            <span>Enjeu du duel</span>
            <span class="chip" :style="{ '--t': TIER_VAR[duel.stake_tier] }">
              {{ TIER_LABEL[duel.stake_tier] }}
            </span>
          </div>
          <p class="muted">
            Vous avez engagé un {{ TIER_LABEL[tierOf(mine.species)].toLowerCase() }} et un
            {{ TIER_LABEL[tierOf(theirs.species)].toLowerCase() }} : le duel vaut donc le plus
            modeste des deux. Comme au poker, on ne remporte que la mise que l’autre a couverte.
          </p>
        </div>

        <div class="sect">
          <div class="eyebrow sect-h"><span>Comment ça s’est joué</span></div>

          <!--
            Trois tailles, trois rôles : ce qui a décidé du duel se lit d'un coup d'œil, ce qui
            l'explique se lit si l'on veut, et le détail du calcul ne réclame l'attention de
            personne. Tout au même corps donnait une bouillie de chiffres où le résultat se
            perdait au milieu des multiplicateurs.
          -->
          <div class="arena-duel-nums">
            <div>
              <span class="v">{{ Math.round(mine.power) }}</span>
              <span class="arena-unit">ta puissance</span>
            </div>
            <div>
              <span class="v">{{ Math.round(theirs.power) }}</span>
              <span class="arena-unit">la sienne</span>
            </div>
            <div>
              <span class="v" :class="{ win: iWon }">{{ myOdds }} %</span>
              <span class="arena-unit">tes chances</span>
            </div>
          </div>

          <div class="steps" style="margin-top:12px">
            <div v-for="[quoi, combien] in breakdown(mine)" :key="'m' + quoi" class="line">
              <span class="line-name">{{ quoi }}</span>
              <span class="mono">{{ combien }}</span>
            </div>
            <div class="line">
              <span class="line-name">tirage</span>
              <span class="mono">{{ Number(duel.roll).toFixed(4) }}</span>
            </div>
          </div>
          <p class="muted" style="margin-top:8px">
            Le tirage décide : sous {{ myOdds }} %, tu l’emportais. Aucun duel n’est joué
            d’avance — même face au pire écart possible, le plus faible garde une chance sur vingt.
          </p>
        </div>

        <div class="sect">
          <div class="front-actions">
            <button class="btn-solid" @click="$emit('close')">Fermer</button>
          </div>
        </div>
      </template>
      <div v-else class="sect">
        <div class="arena-wait"><span></span><span></span><span></span></div>
        <p class="muted" style="text-align:center">Le combat se joue…</p>
      </div>
    </div>
  </div>
</template>
