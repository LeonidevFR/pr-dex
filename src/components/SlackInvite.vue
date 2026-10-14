<script setup>
import { Sparkle, X } from '@lucide/vue'
defineEmits(['link', 'dismiss'])
</script>

<template>
  <!-- Pour les devs déjà inscrits avec GitHub : leurs boosters de monkey-testing arrivent par
       leur compte Slack, qu'il faut donc lier. Fermé, il ne revient plus. -->
  <div class="banner invite slack-invite">
    <Sparkle class="bico" :size="16" aria-hidden="true" />
    <div class="invite-copy">
      <span class="bt">Tu participes au monkey-testing ?</span>
      Lie ton compte Slack pour recevoir tes boosters.
    </div>
    <button class="btn-ghost invite-btn link-slack" @click="$emit('link')">Lier mon compte Slack</button>
    <button class="invite-x" aria-label="Fermer le bandeau" @click="$emit('dismiss')"><X :size="16" aria-hidden="true" /></button>
  </div>
</template>
