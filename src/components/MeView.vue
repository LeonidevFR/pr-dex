<script setup>
import { computed } from 'vue'
import SeasonBadge from './SeasonBadge.vue'
import PodiumShelf from './PodiumShelf.vue'
import { myStats } from '../lib/leaderboard.js'
import { TIER_VAR } from '../../shared/species.js'
import { useLeaderboardRows } from '../composables/useLeaderboardRows.js'
import { daysLeftInSeason, seasonLabel } from '../../shared/arena-economy.js'

const props = defineProps({
  client: { type: Object, required: true },
  today: { type: String, required: true },
  userId: { type: String, default: '' },
  /** Ce que l'arène sait de soi : caisse, crédits, stock, pertes, ventes. */
  prive: { type: Object, default: null },
  /** Ses propres victoires et défaites, telles que la vue publique les rend. */
  fiche: { type: Object, default: null },
  seasons: { type: Array, default: () => [] },
  points: { type: Number, default: 0 },
  season: { type: String, default: '' },
  rank: { type: Number, default: 0 },
  /** Faux avant le 1er décembre : il n'y a alors rien d'arène à montrer. */
  arenaOpen: { type: Boolean, default: false },
})

/**
 * Tout ce qui parle de soi, sur un écran.
 *
 * Il y en avait deux : « Statistiques », qui comptait la collection, et « Fiche », qui comptait
 * l'arène — chacune montrant une moitié de la même personne, dans deux quartiers différents.
 * On allait donc dans deux endroits pour répondre à une seule question.
 *
 * L'étagère des podiums y était même dessinée deux fois, par deux calculs distincts.
 *
 * Avant l'ouverture de l'arène, il ne reste que la collection : la page se réduit d'elle-même
 * plutôt que d'annoncer des caisses vides et des duels qu'on ne peut pas jouer.
 */
const { rows, loading, error, load } = useLeaderboardRows(props.client)
const stats = computed(() => (rows.value ? myStats(rows.value, props.today) : null))

const fmtPct = (n) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

const restants = computed(() => (props.season ? daysLeftInSeason(props.season) : 0))

/**
 * Le palmarès d'arène, sans caviardage : on est chez soi. C'est toute la différence avec la
 * fiche publique d'un collègue, qui montre les mêmes cases avec des barres à la place des
 * chiffres — et c'est pourquoi les deux écrans ne sont plus le même composant.
 */
const cases = computed(() => {
  const d = props.fiche ?? {}
  const p = props.prive ?? {}
  return [
    { v: p.copies ?? 0, l: 'Exemplaires' },
    { v: `${p.pokedollars ?? 0} ₽`, l: 'Pokédollars' },
    // « Crédits » tout court se lisait comme des plis à ouvrir. Ce sont des engagements
    // d'arène : un par jour ouvré, cinq au plus, perdus le dimanche soir.
    { v: p.credits ?? 0, l: 'Crédits d’arène' },
    { v: d.wins ?? 0, l: 'Duels gagnés' },
    { v: d.losses ?? 0, l: 'Perdus' },
    { v: p.destroyed ?? 0, l: 'Exemplaires perdus' },
    // Vendu n'est pas perdu : l'un est une défaite, l'autre une décision — et celle-ci a
    // rapporté quelque chose, qu'on affiche avec elle.
    { v: p.sold ?? 0, l: p.soldTotal ? `Revendus · ${p.soldTotal} ₽` : 'Revendus' },
  ]
})
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Moi</div>
        <!-- « Ce que tu as tiré » était le titre des statistiques seules. La page porte aussi
             la caisse, les duels et les médailles, qui ne se tirent pas. -->
        <h1 class="view-title">Ce qui est <i>à toi</i></h1>
      </div>
      <div v-if="arenaOpen" class="view-totals">
        <div>
          <div class="eyebrow">Points · {{ seasonLabel(season) }}</div>
          <div class="view-num gold">{{ points }}</div>
        </div>
        <div v-if="rank">
          <div class="eyebrow">Ton rang</div>
          <div class="view-num">{{ rank }}<small>{{ rank === 1 ? 'er' : 'e' }}</small></div>
        </div>
        <div>
          <div class="eyebrow">Jour{{ restants > 1 ? 's' : '' }} restant{{ restants > 1 ? 's' : '' }}</div>
          <div class="view-num">{{ restants }}</div>
        </div>
      </div>
    </div>

    <!--
      L'arène d'abord quand elle est ouverte : ce sont les chiffres qui bougent tous les jours.
      Les statistiques de collection, elles, se consultent de temps en temps.
    -->
    <div v-if="arenaOpen" class="sect">
      <div class="eyebrow sect-h"><span>Ton arène</span></div>
      <div class="prof-cases">
        <div v-for="c in cases" :key="c.l" class="prof-case">
          <b>{{ c.v }}</b>
          <span>{{ c.l }}</span>
        </div>
      </div>
      <p class="muted">
        Ces chiffres ne sortent pas d’ici : ta caisse, tes crédits, ton stock, tes pertes et tes
        ventes ne figurent dans aucune vue publique. Tes espèces, tes victoires et tes défaites,
        elles, se lisent au classement.
      </p>
    </div>

    <div v-if="loading" class="board-loading">Chargement…</div>
    <div v-else-if="error" class="board-error">
      <p>{{ error }}</p>
      <button class="btn-ghost" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!stats" class="board-empty">Retourne une carte pour voir tes stats.</p>

    <div v-else class="sect">
      <div class="eyebrow sect-h"><span>Ta collection</span></div>
      <dl class="board-stats">
        <div data-stat="opened"><dt>Cartes retournées</dt><dd class="stat-value">{{ stats.opened }}</dd></div>
        <div data-stat="species"><dt>Espèces</dt><dd class="stat-value">{{ stats.species }} / 151</dd></div>
        <div v-for="t in stats.tiers" :key="t.tier" :data-stat="'tier-' + t.tier">
          <dt><span class="board-dot" :style="{ background: TIER_VAR[t.tier] }"></span>{{ t.label }}</dt>
          <dd class="stat-value">{{ t.count }} <small>{{ fmtPct(t.pct) }}</small></dd>
        </div>
        <div data-stat="shiny">
          <dt>Shiny</dt>
          <dd class="stat-value">{{ stats.shiny.species }} / 151 <small>{{ stats.shiny.copies }} carte{{ stats.shiny.copies > 1 ? 's' : '' }}</small></dd>
        </div>
        <div data-stat="evolved"><dt>Pokémon évolués</dt><dd class="stat-value">{{ stats.evolved }}</dd></div>
      </dl>
    </div>

    <!--
      Le badge en jeu : c'est ce que la saison met sur la table, et le savoir change la façon de
      la jouer. Sans rang, puisqu'il n'est encore à personne.
    -->
    <template v-if="arenaOpen">
      <div class="sect saison-prix">
        <SeasonBadge :season="season" :rank="0" :size="84" />
        <div>
          <div class="eyebrow">Le badge en jeu</div>
          <p class="muted" style="margin-top:7px">
            Les trois premiers l’épinglent ici à la clôture. Il change à chaque saison, et une
            saison ne se rejoue pas.
          </p>
        </div>
      </div>

      <PodiumShelf :seasons="seasons" :user-id="userId" />
    </template>
  </section>
</template>
