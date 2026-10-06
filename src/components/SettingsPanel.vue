<script setup>
import { X } from '@lucide/vue'
defineProps({ githubLogin: { type: String, required: true } })
defineEmits(['close', 'disconnect'])
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel settings">
      <button class="x" aria-label="Fermer" @click="$emit('close')"><X :size="18" aria-hidden="true" /></button>
      <div class="settings-body">
        <span class="panel-plate">Réglages</span>
        <h2 class="panel-name settings-title">Compte</h2>
        <div class="sect">
          <div class="eyebrow sect-h"><span>Connecté avec GitHub</span></div>
          <div class="repo-ptr"><span class="dot"></span>{{ githubLogin }}</div>
        </div>
        <div class="sect">
          <button class="btn-ghost" @click="$emit('disconnect')">Se déconnecter</button>
        </div>
        <div class="sect">
          <p class="muted">
            Ta collection est liée à ton compte GitHub. Les autres joueurs voient tes totaux dans le classement, pas le détail de tes PR.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
