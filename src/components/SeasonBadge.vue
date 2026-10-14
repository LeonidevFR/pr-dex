<script setup>
import { computed } from 'vue'
import { badgeOf, VIEWBOX, EMAIL } from '../lib/badges.js'

const props = defineProps({
  season: { type: String, required: true },
  /**
   * Le rang obtenu, ou `0` quand le badge n'est pas encore gagné — il se montre alors sans
   * pastille : coller « 1er » sur une médaille qui n'est à personne serait un mensonge, et la
   * masquer entièrement priverait la saison de ce qu'elle met en jeu.
   */
  rank: { type: Number, default: 1 },
  size: { type: Number, default: 34 },
})

/**
 * Le badge d'arène de la saison, frappé dans le métal de son nom.
 *
 * Le rang ne colore pas le badge : les huit ont leurs teintes propres, les repeindre en or,
 * argent et bronze les rendrait méconnaissables et ferait de huit médailles distinctes trois
 * nuances de la même. Il est porté à côté, par une pastille, et écrit en clair — la couleur
 * seule ne se lit pas de la même façon par tout le monde.
 */
const badge = computed(() => badgeOf(props.season))

/**
 * Le métal passe par des variables, et le dessin n'écrit aucune couleur : un badge posé à côté
 * d'un autre garde la sienne, sans préfixe de classe ni feuille de style à trimbaler. C'était
 * le vrai coût de la planche d'origine — trente-cinq classes identiques par badge, renommées à
 * la main pour qu'ils ne se repeignent pas entre eux.
 */
const metal = computed(() => ({
  '--taille': props.size + 'px',
  '--medaille': teinte.value,
  '--b-plaque': badge.value.plaque,
  '--b-biseau': badge.value.biseau,
  '--b-email': EMAIL,
}))

const OR = ['#c9a227', '#9aa0a6', '#a9713b']
const teinte = computed(() => OR[Math.min(Math.max(props.rank, 1), 3) - 1])

const RANG = { 1: '1er', 2: '2e', 3: '3e' }
const rangCourt = computed(() => RANG[props.rank] ?? `${props.rank}e`)
</script>

<template>
  <span
    class="sbadge" :style="metal"
    role="img"
    :aria-label="rank
      ? `Badge ${badge.nom} de la saison ${season}, rang ${rank}`
      : `Badge ${badge.nom}, en jeu pour la saison ${season}`"
  >
    <svg :viewBox="VIEWBOX" :width="size" :height="size" aria-hidden="true" v-html="badge.body"></svg>
    <span v-if="rank" class="sbadge-rang mono" aria-hidden="true">{{ rangCourt }}</span>
  </span>
</template>
