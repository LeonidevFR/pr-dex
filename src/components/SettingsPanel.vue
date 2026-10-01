<script setup>
defineProps({ githubLogin: { type: String, required: true } })
defineEmits(['close', 'disconnect'])
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel settings">
      <button class="x" aria-label="Fermer" @click="$emit('close')">✕</button>
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
            Tes captures et tes décisions sont liées à ton compte GitHub, isolées des autres
            joueurs par les règles d'accès de la base.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
