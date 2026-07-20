<script setup>
defineProps({
  error: { type: String, default: null }, // 'offline' | 'server'
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['connect'])
</script>

<template>
  <div class="front">
    <div class="front-mark">PR<span>·</span>DEX</div>
    <p class="front-sub">
      Le dex se remplit depuis tes PR mergées sur GitHub. Connecte-toi une fois : rien d'autre à
      configurer, ta collection est liée à ton compte.
    </p>

    <div v-if="error" class="banner err">
      <span class="bico">✕</span>
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

    <div class="sheet">
      <div class="sheet-b">
        <div class="front-actions">
          <button class="btn-solid" :disabled="busy" @click="emit('connect')">
            {{ busy ? 'Connexion…' : 'Se connecter avec GitHub' }}
          </button>
          <span class="muted">Aucune donnée de jeu n'est stockée ailleurs que sur ton compte.</span>
        </div>
      </div>
    </div>
  </div>
</template>
