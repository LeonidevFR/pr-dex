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
      <!--
        Les illustrations empruntées se citent, et se citent quelque part où l'on peut les
        trouver. Les réglages sont le seul écran qui parle de l'application elle-même plutôt que
        du jeu : c'est là que ça a sa place, plutôt qu'en bas d'un écran de duel.
      -->
      <div class="sect">
        <div class="eyebrow sect-h"><span>Illustrations</span></div>
        <p class="muted">
          Les badges de saison sont découpés de « Pokemon Badges Kanto Vector », par
          <a href="https://www.vecteezy.com" target="_blank" rel="noopener">Vecteezy</a>.
          Les sprites viennent de PokéAPI. Pokémon est une marque de Nintendo, Game Freak et
          Creatures : ce dex est un jouet d'équipe, sans rapport avec eux et sans usage
          commercial.
        </p>
      </div>
    </div>
  </div>
</template>
