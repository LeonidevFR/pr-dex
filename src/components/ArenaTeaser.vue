<script setup>
import { computed } from 'vue'
import SeasonBadge from './SeasonBadge.vue'
import { FIRST_SEASON, arenaOpensAt } from '../../shared/arena-economy.js'

/**
 * Ce qu'on voit à la place de l'arène avant son ouverture.
 *
 * Les saisons se découpent sur le calendrier, pas sur une date de lancement : ouvrir en cours
 * de route donnerait une première saison tronquée, qui ne vaudrait pas les suivantes alors
 * qu'elle décernerait les mêmes badges. L'arène attend donc le premier jour de la saison 1, et
 * cet écran occupe l'intervalle.
 *
 * Il annonce l'arène au lieu de s'excuser qu'elle ne soit pas prête : la date, le badge en jeu
 * et les règles, pour qu'on connaisse le mode avant d'y entrer.
 */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const ouverture = computed(() => arenaOpensAt())

const quand = computed(() => {
  const d = ouverture.value
  return `${d.getDate()}${d.getDate() === 1 ? 'er' : ''} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
})

/** Le compte à rebours en jours entiers : le jour même compte encore comme un jour d'attente. */
const jours = computed(() =>
  Math.max(0, Math.ceil((ouverture.value - Date.now()) / 86_400_000)))
</script>

<template>
  <section class="page teaser">
    <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
      <div>
        <div class="eyebrow">Bientôt</div>
        <h1 class="view-title">L’arène ouvre <i>le {{ quand }}</i></h1>
        <p class="muted" style="margin-top:8px">
          Tu y mets un de tes Pokémon en jeu contre celui d’un collègue. Le perdant perd son
          Pokémon. Le gagnant le garde, peut monter de niveau, et gagne des pokédollars, des
          points de saison et une carte.
        </p>
      </div>
    </div>

    <div class="sect teaser-tete">
      <div>
        <div class="arena-big">{{ jours }}</div>
        <div class="arena-unit">jour{{ jours > 1 ? 's' : '' }} d’attente</div>
      </div>
      <div class="teaser-badge">
        <SeasonBadge :season="FIRST_SEASON" :rank="0" :size="78" />
        <span class="mono">Badge de la saison 1</span>
      </div>
    </div>

    <div class="sect">
      <div class="eyebrow sect-h"><span>Les règles</span></div>
      <div class="teaser-liste">
        <p><b>Un duel coûte un crédit.</b> Tu en reçois un par jour ouvré, cinq au maximum. Les
          crédits non utilisés sont perdus chaque dimanche soir.</p>
        <p><b>Tu ne vois pas le Pokémon de ton adversaire</b> avant le résultat, et lui ne voit
          pas le tien.</p>
        <p><b>Le plus faible a toujours sa chance.</b> Les chances de victoire restent entre 5 %
          et 95 %.</p>
        <p><b>Battre plus faible que toi ne fait pas monter de niveau.</b> Il faut affronter un
          Pokémon de ta force, ou plus fort.</p>
        <p><b>Contre l’ordinateur, tu ne risques rien.</b> Tu gagnes un peu de pokédollars,
          mais ni niveau, ni point, ni carte. Un défi que personne ne relève en 24 h est joué
          contre lui.</p>
        <p><b>Une saison dure deux mois.</b> Les trois premiers gagnent son badge et une prime
          de 1 000, 500 ou 250 ₽.</p>
        <p><b>Les pokédollars servent en boutique</b>, pour acheter des cartes. Tes doublons
          s’y revendent.</p>
      </div>
    </div>

    <div class="sect">
      <p class="muted">
        D’ici là, tes PR mergées et tes monkey-testings continuent de te rapporter des Pokémon.
        Garde tes doublons : tu pourras les engager sans risquer ton seul exemplaire.
      </p>
    </div>
  </section>
</template>
