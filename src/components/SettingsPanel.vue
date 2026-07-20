<script setup>
defineProps({ repo: { type: String, required: true } })
defineEmits(['close', 'disconnect'])
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(480px,100%)">
      <div class="panel-top" style="align-items:flex-start;padding-bottom:20px">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">RÉGLAGES</span>
          <h2 class="panel-name" style="font-size:23px;margin-bottom:0">Source de données</h2>
        </div>
      </div>
      <div class="sect">
        <div class="eyebrow sect-h"><span>Repo pointé</span></div>
        <div class="repo-ptr"><span class="dot"></span>{{ repo }} · connecté</div>
      </div>
      <div class="sect">
        <div class="eyebrow sect-h"><span>Jeton d'accès</span></div>
        <div class="field">
          <input type="password" value="github_pat_••••••••••••••••" readonly style="opacity:.7">
        </div>
        <div class="front-actions" style="margin-top:12px">
          <button class="btn-ghost" @click="$emit('disconnect')">Remplacer le jeton</button>
        </div>
      </div>
      <div class="sect">
        <p class="muted">
          Le jeton est stocké sur cette machine uniquement. Les captures viennent de
          <b class="mono">catches.json</b> (écrit par l'Action) ; tes décisions vont dans
          <b class="mono">state.json</b> (écrit ici).
        </p>
      </div>
    </div>
  </div>
</template>
