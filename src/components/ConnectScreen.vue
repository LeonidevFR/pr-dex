<script setup>
import { ref, watch } from 'vue'
import PokeCard from './PokeCard.vue'
import NoticeToast from './NoticeToast.vue'

const props = defineProps({
  error: { type: String, default: null }, // 'offline' | 'server'
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['connect'])

// Les quatre paliers, posés en éventail : l'écran d'accueil montre d'emblée ce qu'on va
// collectionner, et que la matière de la carte dit sa rareté. Espèces fixes, jamais tirées.
const FAN = [[16, 'c'], [37, 'u'], [4, 'r'], [146, 'l']]

// L'échec de connexion s'annonce en toast. Le refermer ne touche pas à l'erreur, qui appartient à
// l'application : un nouvel échec, même identique au précédent, le rouvre au prochain essai.
const ERREURS = {
  offline: ['Pas de réseau.', 'Impossible de joindre GitHub ou Supabase. Vérifie ta connexion et réessaie.'],
  server: ['Service indisponible.', 'Ce n’est pas ton compte. Réessaie dans un moment.'],
}
const masque = ref(false)
watch(() => props.error, () => { masque.value = false })
watch(() => props.busy, (busy) => { if (busy) masque.value = false })
</script>

<template>
  <div class="front">
    <div class="front-copy">
      <div class="front-mark"><i>PR</i>·DEX</div>
      <div class="eyebrow">Une PR mergée ou un monkey-testing, un Pokémon</div>
      <p class="front-sub">
        Le dex se remplit depuis tes PR mergées sur GitHub et tes retours de monkey-testing sur
        Slack. Connecte-toi une fois : rien d'autre à configurer, ta collection est liée à ton compte.
      </p>

      <div class="front-actions">
        <button class="btn-solid" :disabled="busy" @click="emit('connect', 'github')">
          {{ busy ? 'Connexion…' : 'Se connecter avec GitHub' }}
        </button>
        <button class="btn-ghost btn-slack" :disabled="busy" @click="emit('connect', 'slack_oidc')">
          Se connecter avec Slack
        </button>
        <span class="muted">Pas de compte GitHub ? Slack suffit pour le monkey-testing.</span>
      </div>
    </div>

    <!-- Décor seulement : `inert` retire aussi les cartes de la tabulation, sans quoi le
         clavier tomberait sur quatre boutons masqués aux lecteurs d'écran. -->
    <div class="front-fan" aria-hidden="true" inert>
      <div v-for="([id, tier], i) in FAN" :key="id" class="pkc-stage front-card" :style="{ '--i': i }">
        <PokeCard :species-id="id" :tier="tier" scene="night" />
      </div>
    </div>

    <div class="toast-pile">
      <NoticeToast
        :title="error && !masque ? (ERREURS[error] ?? ERREURS.server)[0] : null"
        :message="error && !masque ? (ERREURS[error] ?? ERREURS.server)[1] : null"
        @dismiss="masque = true"
      />
    </div>
  </div>
</template>
