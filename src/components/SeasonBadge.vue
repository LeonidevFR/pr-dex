<script setup>
import { computed } from 'vue'
import { badgeOf } from '../lib/badges.js'

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
 * Le badge d'arène de la saison.
 *
 * Il était dessiné par le programme jusqu'ici — une étoile dont le nombre de branches dérivait
 * du nom de la saison. C'était une solution au manque de badges ; il n'y a plus de manque, et
 * une vraie médaille vaut mieux qu'une forme dérivée d'un hachage.
 *
 * Le rang ne colore pas le badge : les huit ont leurs couleurs propres, les repeindre en or,
 * argent et bronze les rendrait méconnaissables et ferait de huit médailles distinctes trois
 * nuances de la même. Il est porté à côté, par une pastille, et écrit en clair — la couleur
 * seule ne se lit pas de la même façon par tout le monde.
 */
const badge = computed(() => badgeOf(props.season))

/**
 * Le style de la planche d'origine voyage AVEC le dessin, dans le contenu injecté : un
 * `<style>` écrit dans le gabarit serait intercepté par le compilateur de composant, qui le
 * prendrait pour la feuille de style du fichier.
 */
const contenu = computed(() => `<style>${badge.value.css}</style>${badge.value.body}`)

const OR = ['#c9a227', '#9aa0a6', '#a9713b']
const teinte = computed(() => OR[Math.min(Math.max(props.rank, 1), 3) - 1])

const RANG = { 1: '1er', 2: '2e', 3: '3e' }
const rangCourt = computed(() => RANG[props.rank] ?? `${props.rank}e`)
</script>

<template>
  <span
    class="sbadge" :style="{ '--taille': size + 'px', '--medaille': teinte }"
    role="img"
    :aria-label="rank ? `Badge de la saison ${season}, rang ${rank}` : `Badge en jeu pour la saison ${season}`"
  >
    <svg :viewBox="badge.viewBox" :width="size" :height="size" aria-hidden="true" v-html="contenu"></svg>
    <span v-if="rank" class="sbadge-rang mono" aria-hidden="true">{{ rangCourt }}</span>
  </span>
</template>
