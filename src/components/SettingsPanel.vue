<script setup>
defineProps({ githubLogin: { type: String, required: true } })
defineEmits(['close', 'disconnect'])
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(480px,100%)">
      <div class="panel-top" style="align-items:flex-start;padding-bottom:20px">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">RÉGLAGES</span>
          <h2 class="panel-name" style="font-size:23px;margin-bottom:0">Compte</h2>
        </div>
      </div>
      <div class="sect">
        <div class="eyebrow sect-h"><span>Connecté avec GitHub</span></div>
        <div class="repo-ptr"><span class="dot"></span>{{ githubLogin }}</div>
      </div>
      <div class="sect">
        <div class="front-actions" style="margin-top:12px">
          <button class="btn-ghost" @click="$emit('disconnect')">Se déconnecter</button>
        </div>
      </div>
      <div class="sect">
        <p class="muted">
          Tes captures et tes décisions sont liées à ton compte GitHub, isolées des autres
          joueurs par les règles d'accès de la base.
        </p>
      </div>
    </div>
  </div>
</template>
