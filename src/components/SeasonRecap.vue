<script setup>
import { computed } from 'vue'
import { X } from '@lucide/vue'
import SeasonBadge from './SeasonBadge.vue'
import { SEASON_PODIUM, seasonLabel } from '../../shared/arena-economy.js'

const props = defineProps({
  /** La saison close : `{ season, first_id, second_id, third_id, board }`, `board` étant son classement. */
  recap: { type: Object, required: true },
  userId: { type: String, default: '' },
  /** La saison qui commence. */
  current: { type: String, required: true },
})
defineEmits(['close'])

const nom = (id) => props.recap.board.find((r) => r.user_id === id)?.login ?? 'un joueur'
const podium = computed(() => [props.recap.first_id, props.recap.second_id, props.recap.third_id]
  .map((id, i) => (id ? { id, rang: i + 1, nom: nom(id), gain: SEASON_PODIUM[i] } : null))
  .filter(Boolean))
const moi = computed(() => podium.value.find((p) => p.id === props.userId) ?? null)
const monRang = computed(() => props.recap.board.find((r) => r.user_id === props.userId)?.rank ?? null)
const rangLu = (n) => (n === 1 ? '1er' : `${n}e`)
const pd = (n) => n.toLocaleString('fr-FR').replace(/\s/g, ' ')
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel season-recap" role="dialog" aria-labelledby="season-recap-title">
      <button class="x" aria-label="Fermer" @click="$emit('close')">
        <X :size="14" aria-hidden="true" />
      </button>
      <div class="eyebrow">Fin de saison</div>
      <h2 id="season-recap-title" class="season-recap-title">{{ seasonLabel(recap.season) }} terminée</h2>

      <ol v-if="podium.length" class="season-podium">
        <li v-for="p in podium" :key="p.id" :class="{ moi: p.id === userId }">
          <SeasonBadge :season="recap.season" :rank="p.rang" :size="64" />
          <b>{{ p.nom }}</b>
          <span class="mono">{{ rangLu(p.rang) }} · +{{ pd(p.gain) }} ₽</span>
        </li>
      </ol>

      <p v-if="moi" class="season-recap-moi">
        Tu finis {{ rangLu(moi.rang) }} : {{ pd(moi.gain) }} ₽ sont dans ta caisse et le badge rejoint
        ton étagère.
      </p>
      <p v-else-if="monRang" class="season-recap-moi">Tu finis {{ rangLu(monRang) }}.</p>
      <p v-else class="season-recap-moi">Tu n’as pas joué cette saison.</p>

      <p class="muted">
        La {{ seasonLabel(current) }} commence : les points repartent de zéro. Tes Pokémon gardent
        leurs niveaux.
      </p>
      <button class="btn-solid season-recap-go" @click="$emit('close')">C’est parti</button>
    </div>
  </div>
</template>
