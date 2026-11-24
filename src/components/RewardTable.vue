<script setup>
import { computed } from 'vue'
import { REWARD, SEASON_PODIUM, TIER_ORDER } from '../../shared/arena-economy.js'
import { TIER_LABEL, TIER_VAR } from '../../shared/species.js'

/**
 * Ce que rapporte une victoire, par palier d'enjeu.
 *
 * Il était rangé dans l'écran « Saison », à côté du classement. Mais ce n'est pas une
 * information de classement : c'est la table des gains, qu'on consulte en choisissant quoi
 * engager. Elle tient donc avec les duels, là où la question se pose.
 *
 * Le barème vient du moteur, jamais d'une liste recopiée : deux tables qui divergent valent
 * moins que pas de table du tout.
 */
const bareme = computed(() => TIER_ORDER.map((t) => ({ tier: t, ...REWARD[t] })))

const pd = (n) => n.toLocaleString('fr-FR').replace(/\s/g, ' ')
/** « 1 000, 500 et 250 » */
const podiumLu = `${SEASON_PODIUM.slice(0, -1).map(pd).join(', ')} et ${pd(SEASON_PODIUM.at(-1))}`
</script>

<template>
  <div class="sect">
    <div class="eyebrow sect-h"><span>Gains par enjeu</span></div>
    <div class="saison-bareme">
      <div v-for="b in bareme" :key="b.tier" class="saison-ligne">
        <span class="pastille" :style="{ background: TIER_VAR[b.tier] }"></span>
        <span class="quoi">enjeu {{ TIER_LABEL[b.tier].toLowerCase() }}</span>
        <span class="mono pts">{{ b.points }} pts</span>
        <span class="mono sous">{{ b.dollars }} ₽</span>
      </div>
    </div>
    <p class="muted" style="margin-top:12px">
      L’enjeu est celui du <b>moins rare des deux Pokémon</b>. À la clôture, le podium touche
      {{ podiumLu }} ₽ : de quoi fêter, pas de quoi dominer la saison suivante. Des ex aequo
      partagent la même marche et se partagent les primes des places qu’ils occupent.
    </p>
  </div>
</template>
