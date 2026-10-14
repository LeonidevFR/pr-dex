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
 * nuances de la même. Il est écrit SOUS la médaille, par l'étagère qui la pose, comme la plaque
 * d'un trophée.
 *
 * Il a d'abord été une pastille d'or, d'argent ou de bronze posée sur la médaille. Deux raisons
 * de l'abandonner, dans cet ordre. Le texte y était illisible — crème sur métal moyen, 2,32:1
 * pour l'or, et du gras de 9 px demande PLUS que 4,5:1, pas moins. Et même corrigée, à la taille
 * d'une étagère elle mangeait la silhouette et débordait d'un conteneur qui n'a pas à s'ouvrir
 * pour elle. Un mot sous le trophée se lit à toute taille et ne cache rien.
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
  '--b-plaque': badge.value.plaque,
  '--b-biseau': badge.value.biseau,
  '--b-email': EMAIL,
}))

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
  </span>
</template>
