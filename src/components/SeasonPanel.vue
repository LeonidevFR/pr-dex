<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import SeasonBadge from './SeasonBadge.vue'
import {
  REWARD, SEASON_PODIUM, TIER_ORDER, seasonBounds, daysLeftInSeason, seasonLabel,
} from '../../shared/arena-economy.js'
import { TIER_LABEL, TIER_VAR } from '../../shared/species.js'

const props = defineProps({
  season: { type: String, required: true },
  /** Le classement de la saison en cours : `{ user_id, pseudo, points, rank }`. */
  leaderboard: { type: Array, default: () => [] },
  /** Les saisons closes, avec leur podium. */
  seasons: { type: Array, default: () => [] },
  userId: { type: String, default: '' },
})
defineEmits(['profile'])

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const bornes = computed(() => seasonBounds(props.season))
const restants = computed(() => daysLeftInSeason(props.season))

/** « juillet et août 2026 » : le nom de code ne dit rien à personne, les mois si. */
const periode = computed(() => {
  const { start, end } = bornes.value
  return `${MOIS[start.getMonth()]} et ${MOIS[end.getMonth()]} ${end.getFullYear()}`
})

/** La part écoulée, pour le sablier. Bornée : une saison close afficherait sinon plus de 100 %. */
const ecoule = computed(() => {
  const { start, end } = bornes.value
  const part = (Date.now() - start) / (end - start)
  return Math.round(Math.min(1, Math.max(0, part)) * 100)
})

const moi = computed(() => props.leaderboard.find((l) => l.user_id === props.userId) ?? null)

/**
 * Ce qu'il faut atteindre pour un badge : les points du troisième. Un classement dit où l'on
 * est ; il ne dit pas ce qu'il reste à faire, et c'est pourtant la seule question qu'on se pose
 * en le regardant.
 */
const coupe = computed(() => props.leaderboard.find((l) => l.rank === 3)?.points ?? null)

const retard = computed(() => {
  if (!moi.value || !coupe.value || moi.value.rank <= 3) return null
  return coupe.value - moi.value.points
})

const haut = computed(() => Math.max(1, ...props.leaderboard.map((l) => l.points)))

/** Le barème, dans l'ordre des paliers — c'est celui du moteur, pas une liste recopiée. */
const bareme = computed(() => TIER_ORDER.map((t) => ({ tier: t, ...REWARD[t] })))

/**
 * Les saisons closes où l'on est monté sur le podium. Une saison sans podium n'a pas de badge
 * à montrer, mais reste comptée dans le total : une étagère à trous raconte quelque chose.
 */
const RANGS = ['first_id', 'second_id', 'third_id']
const palmares = computed(() => props.seasons.map((s) => ({
  season: s.season,
  rank: RANGS.findIndex((r) => s[r] === props.userId) + 1,
})))
</script>

<template>
  <section class="page">
  <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
    <div>
      <span class="panel-plate mono">
        {{ seasonLabel(season).toUpperCase() }}<template v-if="seasonLabel(season) !== season"> · {{ season }}</template>
      </span>
      <h2 class="panel-name" style="font-size:26px;margin-bottom:0">{{ periode }}</h2>
      <p class="muted" style="margin-top:6px">
        Deux mois pour marquer des points. À la clôture, les trois premiers gardent le badge
        de la saison — elle ne se rejoue pas.
      </p>
    </div>
  </div>

  <!--
    Le badge en jeu, en tête : c'est ce que la saison met sur la table, et le savoir change la
    façon de la jouer. Sans rang, puisqu'il n'est encore à personne.
  -->
  <div class="sect saison-prix">
    <SeasonBadge :season="season" :rank="0" :size="84" />
    <div>
      <div class="eyebrow">Le badge en jeu</div>
      <p class="muted" style="margin-top:7px">
        Les trois premiers l’épinglent à leur profil à la clôture. Il change à chaque saison,
        et une saison ne se rejoue pas.
      </p>
    </div>
  </div>

  <div class="sect">
    <div class="arena-head">
      <div>
        <div class="arena-big">{{ restants }}</div>
        <div class="arena-unit">jour{{ restants > 1 ? 's' : '' }} restant{{ restants > 1 ? 's' : '' }}</div>
      </div>
      <div v-if="moi">
        <div class="arena-big">{{ moi.points }}</div>
        <div class="arena-unit">tes points</div>
      </div>
      <div v-if="moi">
        <div class="arena-big">{{ moi.rank }}<sup style="font-size:14px">{{ moi.rank === 1 ? 'er' : 'e' }}</sup></div>
        <div class="arena-unit">ton rang</div>
      </div>
    </div>
    <div class="saison-sablier" :aria-label="`${ecoule} % de la saison écoulés`">
      <i :style="{ width: ecoule + '%' }"></i>
    </div>
  </div>

  <div class="sect">
    <div class="eyebrow sect-h">
      <span>Le classement</span>
      <span class="mono" style="font-size:11px;color:var(--ink-3)">{{ leaderboard.length }} joueurs</span>
    </div>

    <p v-if="!leaderboard.length" class="muted">
      Personne n’a encore marqué. Le premier duel gagné ouvre le classement.
    </p>

    <div v-else class="saison-rangs">
      <button
        v-for="l in leaderboard" :key="l.user_id"
        class="saison-rang" :class="{ moi: l.user_id === userId, podium: l.rank <= 3 }"
        :title="`Voir le profil de ${l.pseudo}`"
        @click="$emit('profile', l.pseudo)"
      >
        <span class="pos mono">{{ l.rank }}</span>
        <span class="nom">{{ l.pseudo }}</span>
        <span class="piste"><i :style="{ width: Math.round(l.points / haut * 100) + '%' }"></i></span>
        <span class="pts mono">{{ l.points }}</span>
      </button>
    </div>

    <!-- Ce qu'il reste à faire, et non seulement où l'on est. -->
    <p v-if="retard" class="muted" style="margin-top:12px">
      Il te manque <b>{{ retard }} point{{ retard > 1 ? 's' : '' }}</b> pour la troisième
      marche — un duel gagné sur un enjeu rare en rapporte {{ REWARD.r.points }}.
    </p>
    <p v-else-if="moi && moi.rank <= 3" class="muted" style="margin-top:12px">
      Tu es sur le podium. Rien n’est acquis avant la clôture : les points continuent de
      bouger jusqu’au dernier jour.
    </p>
  </div>

  <div class="sect">
    <div class="eyebrow sect-h"><span>Ce qui rapporte</span></div>
    <div class="saison-bareme">
      <div v-for="b in bareme" :key="b.tier" class="saison-ligne">
        <span class="pastille" :style="{ background: TIER_VAR[b.tier] }"></span>
        <span class="quoi">enjeu {{ TIER_LABEL[b.tier].toLowerCase() }}</span>
        <span class="mono pts">{{ b.points }} pts</span>
        <span class="mono sous">{{ b.dollars }} ₽</span>
      </div>
    </div>
    <p class="muted" style="margin-top:12px">
      L’enjeu est toujours <b>le plus petit des deux engagements</b> : miser gros contre un
      petit ne rapporte pas gros. À la clôture, le podium touche
      {{ SEASON_PODIUM.join(', ') }} ₽ — de quoi fêter, pas de quoi dominer la suivante.
    </p>
  </div>

  <div class="sect">
    <div class="eyebrow sect-h">
      <span>Ton étagère</span>
      <span class="mono" style="font-size:11px;color:var(--ink-3)">
        {{ palmares.filter((p) => p.rank).length }} sur {{ palmares.length }} saisons closes
      </span>
    </div>

    <p v-if="!palmares.length" class="muted">
      C’est la première saison. L’étagère se remplira à sa clôture.
    </p>

    <div v-else class="saison-etagere">
      <!-- Les saisons manquées gardent leur socle, vide : une étagère à trous raconte une
           histoire qu'une liste de badges gagnés ne raconte pas. -->
      <div v-for="p in palmares" :key="p.season" class="saison-socle" :class="{ vide: !p.rank }">
        <SeasonBadge v-if="p.rank" :season="p.season" :rank="p.rank" :size="46" />
        <span v-else class="socle-vide" aria-hidden="true"></span>
        <span class="mono qd">{{ p.season }}</span>
        <span class="rg">{{ p.rank ? `${p.rank}${p.rank === 1 ? 'er' : 'e'}` : 'hors podium' }}</span>
      </div>
    </div>
  </div>
  </section>
</template>
