<script setup>
import { CircleX } from '@lucide/vue'
import PokeCard from './PokeCard.vue'

defineProps({
  error: { type: String, default: null }, // 'offline' | 'server'
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['connect'])

// Les quatre paliers, posés en éventail : l'écran d'accueil montre d'emblée ce qu'on va
// collectionner, et que la matière de la carte dit sa rareté. Espèces fixes, jamais tirées.
const FAN = [[16, 'c'], [37, 'u'], [4, 'r'], [146, 'l']]
</script>

<template>
  <div class="front">
    <div class="front-copy">
      <div class="front-mark"><i>PR</i>·DEX</div>
      <div class="eyebrow">Une PR mergée, un Pokémon</div>
      <p class="front-sub">
        Le dex se remplit depuis tes PR mergées sur GitHub. Connecte-toi une fois : rien d'autre à
        configurer, ta collection est liée à ton compte.
      </p>

      <div v-if="error" class="banner err">
        <CircleX class="bico" :size="16" aria-hidden="true" />
        <div>
          <template v-if="error === 'offline'">
            <span class="bt">Pas de réseau.</span>
            Impossible de joindre GitHub ou Supabase. Vérifie ta connexion et réessaie.
          </template>
          <template v-else>
            <span class="bt">Service indisponible.</span>
            Ce n'est pas ton compte — réessaie dans un moment.
          </template>
        </div>
      </div>

      <div class="front-actions">
        <button class="btn-solid" :disabled="busy" @click="emit('connect')">
          {{ busy ? 'Connexion…' : 'Se connecter avec GitHub' }}
        </button>
        <span class="muted">Aucune donnée de jeu n'est stockée ailleurs que sur ton compte.</span>
      </div>
    </div>

    <!-- Décor seulement : `inert` retire aussi les cartes de la tabulation, sans quoi le
         clavier tomberait sur quatre boutons masqués aux lecteurs d'écran. -->
    <div class="front-fan" aria-hidden="true" inert>
      <div v-for="([id, tier], i) in FAN" :key="id" class="pkc-stage front-card" :style="{ '--i': i }">
        <PokeCard :species-id="id" :tier="tier" scene="night" />
      </div>
    </div>
  </div>
</template>
