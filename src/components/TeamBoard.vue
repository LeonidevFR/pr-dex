<script setup>
import { ref } from 'vue'
import { TIER_VAR } from '../../shared/species.js'

defineProps({
  /** Les joueurs déjà classés, rendus par la page. */
  players: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
})
defineEmits(['retry'])

/**
 * Le tableau de la collection d'équipe.
 *
 * Il occupait un écran à lui seul, avec son titre et ses totaux. Il est devenu un bloc : les
 * deux classements — la collection et les points de la saison — tiennent désormais sur la même
 * page, parce qu'ils classent les mêmes personnes sur deux mesures.
 *
 * La lecture des lignes reste à la page : un bloc qui va chercher ses propres données ne peut
 * pas cohabiter avec un autre qui en dépend, et les totaux de l'en-tête viennent des mêmes
 * lignes que ce tableau.
 */
const COLUMNS = [
  ['species', 'Espèces'], ['shiny', 'Shiny'], ['legendaries', 'Légendaires'], ['rares', 'Rares'],
  ['lineages', 'Lignées'], ['copies', 'Cartes'], ['recent', '30 jours'],
]
// Sur un écran étroit, seules ces colonnes restent visibles ; les autres se déplient au toucher.
const PRIMARY = new Set(['species', 'shiny'])
// Repéré par le rang, pas par le login : deux comptes sans `user_name` s'appellent tous deux
// « inconnu », et une clé en double dépliait les deux lignes à la fois.
const expanded = ref(null)
</script>

<template>
  <div class="sect">
    <div class="eyebrow sect-h">
      <span>La collection</span>
      <span v-if="players.length" class="mono" style="font-size:11px;color:var(--fg-3)">{{ players.length }} joueurs</span>
    </div>
    <div v-if="loading" class="board-loading">Chargement…</div>
    <div v-else-if="error" class="board-error">
      <p>{{ error }}</p>
      <button class="btn-ghost" @click="$emit('retry')">Réessayer</button>
    </div>
    <p v-else-if="!players.length" class="board-empty">
      Personne n'a encore retourné de carte. Le classement commence à la première.
    </p>

    <table v-else class="board-table">
      <thead>
        <tr>
          <th class="board-rank">#</th>
          <th class="board-who">Joueur</th>
          <th v-for="[key, label] in COLUMNS" :key="key" :class="{ secondary: !PRIMARY.has(key) }">{{ label }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="p in players" :key="p.rank">
          <tr :class="{ me: p.isMe }" @click="expanded = expanded === p.rank ? null : p.rank">
            <td class="board-rank">{{ p.rank }}</td>
            <td class="board-who">
              <span class="board-who-in">
                <img v-if="p.avatarUrl" class="board-avatar" :src="p.avatarUrl" alt="">
                <span v-else class="board-avatar">{{ p.login[0]?.toUpperCase() }}</span>
                <span class="board-login">{{ p.login }}</span>
              </span>
            </td>
            <td v-for="[key] in COLUMNS" :key="key" class="mono" :class="{ secondary: !PRIMARY.has(key), lead: key === 'species' }">
              <span v-if="key === 'legendaries'" class="board-dot" :style="{ background: TIER_VAR.l }"></span>
              <span v-else-if="key === 'rares'" class="board-dot" :style="{ background: TIER_VAR.r }"></span>
              {{ p[key] }}
            </td>
          </tr>
          <!-- Les colonnes masquées en étroit, avec leur libellé : des nombres seuls, sans
               en-tête au-dessus, ne se liraient pas. Rendue partout, visible seulement en étroit. -->
          <tr v-if="expanded === p.rank" class="board-detail" :class="{ me: p.isMe }">
            <td :colspan="2 + COLUMNS.length">
              <span v-for="[key, label] in COLUMNS.filter(([k]) => !PRIMARY.has(k))" :key="key" class="board-detail-item">
                <span class="board-detail-label">{{ label }}</span> <b class="mono">{{ p[key] }}</b>
              </span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
