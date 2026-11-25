<script setup>
import { Gift, X } from '@lucide/vue'
defineEmits(['dismiss'])
</script>

<template>
  <!-- Seul endroit qui annonce l'édition à tous, avant même la première carte équipe. -->
  <div class="banner invite noel-banner">
    <Gift class="bico" :size="16" aria-hidden="true" />
    <div class="invite-copy">
      <span class="bt">Édition Noël, du 15 décembre au 6 janvier.</span>
      Une carte sur quinze cache en plus, à côté de son Pokémon, une carte d’un membre de l’équipe.
      Et le 25, un booster de Noël t’attend.
    </div>
    <button class="invite-x" aria-label="Fermer le bandeau" @click="$emit('dismiss')"><X :size="16" aria-hidden="true" /></button>
  </div>
</template>
