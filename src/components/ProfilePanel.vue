<script setup>
import { computed } from 'vue'
import SeasonBadge from './SeasonBadge.vue'
import { seasonLabel } from '../../shared/arena-economy.js'

const props = defineProps({
  /** La fiche publique telle que la base la rend : nom, espèces, victoires, défaites. */
  fiche: { type: Object, default: null },
  /** Le login cherché dans l'URL, pour titrer la page avant que la fiche n'arrive. */
  cherche: { type: String, default: null },
  /** Les saisons closes, avec leur podium, pour dresser l'étagère. */
  seasons: { type: Array, default: () => [] },
  points: { type: Number, default: 0 },
  season: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  introuvable: { type: Boolean, default: false },
})

/**
 * La fiche publique d'un collègue, et rien d'autre.
 *
 * Elle servait aussi à sa propre fiche, avec un caviardage conditionnel partout : la même case
 * montrait un chiffre chez soi et une barre chez l'autre. « Moi » a repris le cas de son
 * propriétaire, qui n'a aucune raison de voir ses propres affaires hachurées. Ce qui reste ici
 * est toujours la vue d'un tiers, donc toujours caviardé — une condition de moins par case.
 */
/**
 * La fiche, dans l'ordre où on la lit. `secret` marque ce qui ne sort jamais de chez soi —
 * la case reste alors en place, hachurée : la retirer ferait une page plus courte dont on ne
 * saurait pas ce qu'elle a perdu. Une case barrée montre où passe la règle.
 */
const cases = computed(() => {
  const d = props.fiche ?? {}
  return [
    { v: String(d.species ?? 0).padStart(3, '0'), l: 'Espèces' },
    { secret: true, l: 'Exemplaires' },
    { secret: true, l: 'Pokédollars' },
    // « Crédits » tout court se lisait comme des plis à ouvrir. Ce sont des engagements
    // d'arène : un par jour ouvré, cinq au plus, perdus le dimanche soir.
    { secret: true, l: 'Crédits d’arène' },
    { v: d.wins ?? 0, l: 'Duels gagnés' },
    { v: d.losses ?? 0, l: 'Perdus' },
    { v: props.points, l: `Points · ${seasonLabel(props.season)}` },
    { secret: true, l: 'Exemplaires perdus' },
    // Vendu n'est pas perdu : l'un est une défaite, l'autre une décision.
    { secret: true, l: 'Revendus' },
  ]
})

/** Les trois marches, et rien d'autre : une saison sans podium n'a pas de badge à montrer. */
const RANGS = ['first_id', 'second_id', 'third_id']
const palmares = computed(() => {
  const id = props.fiche?.user_id
  if (!id) return []
  return props.seasons
    .map((s) => ({ season: s.season, rank: RANGS.findIndex((r) => s[r] === id) + 1 }))
    .filter((s) => s.rank > 0)
})
</script>

<template>
  <section class="view">
  <div class="view-head">
    <div>
      <div class="eyebrow">Fiche</div>
      <!--
        La fiche porte le nom du compte : celui que les deux classements affichent et sous
        lequel l'équipe se connaît. Le nom rendu par la base d'abord — c'est celui que les
        autres lisent — le sien ensuite, quand on regarde chez soi.
      -->
      <h1 class="view-title">
        La fiche de <i>{{ fiche?.login ?? cherche }}</i>
      </h1>
    </div>
  </div>

  <div v-if="loading" class="sect">
    <div class="arena-wait"><span></span><span></span><span></span></div>
  </div>

  <div v-else-if="introuvable" class="sect">
    <p class="muted">
      Personne ne joue sous ce nom. Le lien que tu as suivi désigne peut-être un collègue qui
      a changé de login GitHub depuis, ou qui n’a pas encore ouvert sa première carte.
    </p>
  </div>

  <template v-else>
    <div class="prof-cases">
      <div
        v-for="c in cases" :key="c.l"
        class="prof-case" :class="{ secret: c.secret }"
      >
        <b>{{ c.secret ? '—' : c.v }}</b>
        <span>{{ c.l }}</span>
      </div>
    </div>

    <div class="sect">
      <p class="muted">
        <b>Les cases barrées ne se publient pas</b>, et personne ne les voit — pas plus toi
        chez les autres qu’eux chez toi. Ce sont l’économie d’arène et le stock : la caisse, les
        crédits, les pertes et les ventes. Les espèces, les victoires et les défaites, elles, se
        lisent partout — le classement d’équipe en publie davantage encore.
      </p>
    </div>

    <div class="sect">
      <div class="eyebrow sect-h">
        <span>Palmarès</span>
        <span class="mono" style="font-size:11px;color:var(--fg-3)">
          {{ palmares.length }} podium{{ palmares.length > 1 ? 's' : '' }}
        </span>
      </div>
      <div v-if="palmares.length" class="prof-badges">
        <div v-for="p in palmares" :key="p.season" class="prof-badge">
          <SeasonBadge :season="p.season" :rank="p.rank" :size="58" />
          <span class="mono">{{ seasonLabel(p.season) }}</span>
          <span class="prof-rang">{{ p.rank === 1 ? '1er' : `${p.rank}e` }}</span>
        </div>
      </div>
      <p v-else class="muted">
        Aucune saison sur le podium pour l’instant. Les trois premiers d’une saison gardent
        son badge — une saison ne se rejoue pas.
      </p>
    </div>
  </template>
  </section>
</template>
