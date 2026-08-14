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
 * Il annonce plutôt qu'il n'excuse : personne n'a envie de lire qu'une fonctionnalité n'est pas
 * prête. On y montre ce qui se prépare — le badge qui sera en jeu, les règles du duel — pour
 * que l'attente serve à comprendre le mode avant d'y entrer.
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
        <span class="panel-plate mono">BIENTÔT</span>
        <h2 class="panel-name" style="font-size:28px;margin-bottom:0">L’arène ouvre le {{ quand }}</h2>
        <p class="muted" style="margin-top:8px">
          On y engage un de ses Pokémon contre celui d’un collègue. Le perdant est détruit — le
          vainqueur garde le sien, gagne des niveaux, des pokédollars et un pli.
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
        <span class="mono">le badge de la saison 1</span>
      </div>
    </div>

    <div class="sect">
      <div class="eyebrow sect-h"><span>Ce qui attend</span></div>
      <div class="teaser-liste">
        <p><b>Un engagement par crédit</b>, un crédit qui s’ajoute chaque jour ouvré,
          cinq en réserve au plus. Ce qui n’est pas joué est perdu le dimanche soir.</p>
        <p><b>Les deux mises restent scellées</b> jusqu’à la résolution : on choisit qui l’on
          affronte, jamais avec quoi. Personne ne peut ajuster sa mise en voyant celle de
          l’autre.</p>
        <p><b>Aucun duel n’est joué d’avance.</b> Les chances sont bornées entre 5 % et 95 % :
          le plus faible garde toujours une chance sur vingt, et le plus fort finit toujours par
          tomber.</p>
        <p><b>Écraser plus faible que soi ne fait pas progresser.</b> On ne gagne des niveaux
          qu’en affrontant à sa hauteur, ou plus fort.</p>
        <p><b>Deux mois par saison</b>, et les trois premiers gardent son badge. Une saison ne
          se rejoue pas.</p>
      </div>
    </div>

    <div class="sect">
      <p class="muted">
        D’ici là, rien ne change : les Pokémon continuent d’arriver à chaque PR mergée. Ceux que
        tu accumules maintenant seront ceux que tu engageras — un exemplaire de plus, c’est un
        duel de plus que tu pourras te permettre de perdre.
      </p>
    </div>
  </section>
</template>
