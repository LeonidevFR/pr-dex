<script setup>
import { computed } from 'vue'
import { REWARD } from '../../shared/arena-economy.js'

const props = defineProps({
  /** Le classement de la saison en cours : `{ user_id, slug, login, avatar_url, points, rank }`. */
  leaderboard: { type: Array, default: () => [] },
  userId: { type: String, default: '' },
})
defineEmits(['profile'])

/**
 * Le classement de la saison.
 *
 * Il vivait dans un écran « Saison » avec le badge en jeu, le barème et l'étagère des podiums —
 * quatre choses qui ne se regardent pas au même moment. Le classement se compare aux autres, le
 * reste se regarde seul. Il tient donc ici, à côté du classement d'équipe, et les trois autres
 * blocs sont partis là où l'on en a besoin.
 */
const moi = computed(() => props.leaderboard.find((l) => l.user_id === props.userId) ?? null)

/**
 * Ce qu'il faut atteindre pour un badge : les points du troisième. Un classement dit où l'on
 * est ; il ne dit pas ce qu'il reste à faire, et c'est pourtant la seule question qu'on se pose
 * en le regardant.
 */
const coupe = computed(() => props.leaderboard.find((l) => l.rank === 3)?.points ?? null)

const retard = computed(() => {
  if (!moi.value || !coupe.value || moi.value.rank <= 3) return null
  return coupe.value - moi.value.points
})
</script>

<template>
  <div class="sect">
    <div class="eyebrow sect-h">
      <span>Les points de la saison</span>
      <span class="mono" style="font-size:11px;color:var(--fg-3)">{{ leaderboard.length }} joueurs</span>
    </div>

    <p v-if="!leaderboard.length" class="muted">
      Personne n’a encore marqué. Le premier duel gagné ouvre le classement.
    </p>

    <!--
      La même table que le classement d'équipe. Les deux classent les mêmes personnes, sur deux
      mesures : les résoudre sous deux formes obligeait à réapprendre à lire.
    -->
    <table v-else class="board-table">
      <thead>
        <tr>
          <th class="board-rank">Rang</th>
          <th class="board-who">Joueur</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="l in leaderboard" :key="l.user_id"
          :class="{ me: l.user_id === userId, podium: l.rank <= 3 }"
        >
          <td class="board-rank">{{ l.rank }}</td>
          <td class="board-who">
            <!--
              L'identité GitHub, avatar compris, exactement comme au classement d'équipe : on se
              reconnaît sous le nom qu'on porte partout ailleurs. `slug` adresse la fiche, `login`
              la nomme : les deux coïncident pour un dev, et diffèrent pour un testeur venu de
              Slack, dont l'URL porte l'identifiant de membre.
            -->
            <component
              :is="l.slug ? 'button' : 'span'" class="board-who-in"
              :class="{ 'saison-voir': l.slug }"
              :title="l.slug ? `Voir la fiche de ${l.login}` : null"
              @click="l.slug && $emit('profile', l.slug)"
            >
              <img v-if="l.avatar_url" class="board-avatar" :src="l.avatar_url" alt="">
              <span v-else class="board-avatar">{{ (l.login ?? '?')[0].toUpperCase() }}</span>
              <span class="board-login">{{ l.login ?? 'inconnu' }}</span>
            </component>
          </td>
          <td class="lead">{{ l.points }}</td>
        </tr>
      </tbody>
    </table>

    <!-- Ce qu'il reste à faire, et non seulement où l'on est. -->
    <p v-if="retard" class="muted" style="margin-top:12px">
      Il te manque <b>{{ retard }} point{{ retard > 1 ? 's' : '' }}</b> pour la troisième
      marche — un duel gagné sur un enjeu rare en rapporte {{ REWARD.r.points }}.
    </p>
    <p v-else-if="moi && moi.rank <= 3" class="muted" style="margin-top:12px">
      Tu es sur le podium. Rien n’est acquis avant la clôture : les points continuent de
      bouger jusqu’au dernier jour.
    </p>
  </div>
</template>
