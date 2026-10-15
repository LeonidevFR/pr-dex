<script setup>
import { computed } from 'vue'
import SeasonBadge from './SeasonBadge.vue'

const props = defineProps({
  /** Les saisons closes, avec leur podium. */
  seasons: { type: Array, default: () => [] },
  userId: { type: String, default: '' },
})

/**
 * L'étagère des podiums.
 *
 * Elle était dessinée deux fois : sur l'écran Saison et sur la fiche, avec deux mises en page
 * et deux calculs du palmarès. Deux copies d'une même étagère finissent par se contredire, et
 * celle-ci est la seule chose du jeu qu'on garde pour de bon.
 *
 * Les saisons manquées gardent leur socle, vide : une étagère à trous raconte une histoire
 * qu'une liste de badges gagnés ne raconte pas.
 */
const RANGS = ['first_id', 'second_id', 'third_id']
const palmares = computed(() => props.seasons.map((s) => ({
  season: s.season,
  rank: RANGS.findIndex((r) => s[r] === props.userId) + 1,
})))

const gagnes = computed(() => palmares.value.filter((p) => p.rank).length)
</script>

<template>
  <div class="sect">
    <div class="eyebrow sect-h">
      <span>Ton étagère</span>
      <span class="mono" style="font-size:11px;color:var(--fg-3)">
        {{ gagnes }} sur {{ palmares.length }} saison{{ palmares.length > 1 ? 's' : '' }} close{{ palmares.length > 1 ? 's' : '' }}
      </span>
    </div>

    <p v-if="!palmares.length" class="muted">
      C’est la première saison. L’étagère se remplira à sa clôture.
    </p>

    <div v-else class="saison-etagere">
      <div v-for="p in palmares" :key="p.season" class="saison-socle" :class="{ vide: !p.rank }">
        <SeasonBadge v-if="p.rank" :season="p.season" :rank="p.rank" :size="58" />
        <span v-else class="socle-vide" aria-hidden="true"></span>
        <span class="mono qd">{{ p.season }}</span>
        <span class="rg">{{ p.rank ? `${p.rank}${p.rank === 1 ? 'er' : 'e'}` : 'hors podium' }}</span>
      </div>
    </div>
  </div>
</template>
