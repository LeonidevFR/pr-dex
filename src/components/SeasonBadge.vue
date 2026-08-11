<script setup>
import { computed } from 'vue'

const props = defineProps({
  season: { type: String, required: true },
  rank: { type: Number, default: 1 },
  size: { type: Number, default: 34 },
})

/**
 * Un badge dessiné plutôt qu'une image.
 *
 * Les badges d'arène officiels existent en SVG sous licence libre, mais ils sont quarante et
 * demandent un découpage — et surtout ils épuisent leur stock au bout de six ans de saisons.
 * Une forme dérivée du nom de la saison ne s'épuise jamais, ne pèse rien, et donne à la saison
 * 12 un badge aussi distinct qu'à la première.
 *
 * Le hachage est volontairement trivial : ce n'est pas une empreinte, c'est un moyen d'obtenir
 * deux formes qui ne se ressemblent pas.
 */
const graine = computed(() =>
  [...props.season].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7))

const OR = ['#c9a227', '#9aa0a6', '#a9713b']
const couleur = computed(() => OR[Math.min(props.rank, 3) - 1])

/** Entre cinq et huit branches : en deçà ce n'est plus une médaille, au-delà c'est un soleil. */
const branches = computed(() => 5 + (graine.value % 4))
const rotation = computed(() => graine.value % 40)

const points = computed(() => {
  const n = branches.value
  const r = 16
  const petit = 7 + (graine.value % 4)
  return Array.from({ length: n * 2 }, (_, i) => {
    const rayon = i % 2 ? petit : r
    const angle = (Math.PI * i) / n - Math.PI / 2
    return `${20 + rayon * Math.cos(angle)},${20 + rayon * Math.sin(angle)}`
  }).join(' ')
})
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 40 40" role="img"
    :aria-label="`Badge de la saison ${season}, rang ${rank}`"
  >
    <g :transform="`rotate(${rotation} 20 20)`">
      <polygon :points="points" :fill="couleur" fill-opacity=".22" :stroke="couleur" stroke-width="1.4" />
    </g>
    <circle cx="20" cy="20" r="7.5" :fill="couleur" fill-opacity=".9" />
    <text
      x="20" y="20" text-anchor="middle" dominant-baseline="central"
      font-family="ui-monospace, monospace" font-size="8" font-weight="700" fill="#fdfaf3"
    >{{ rank }}</text>
  </svg>
</template>
