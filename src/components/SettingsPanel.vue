<script setup>
import { computed } from 'vue'
import { X, CircleX } from '@lucide/vue'

const props = defineProps({
  accountName: { type: String, required: true },
  providers: { type: Array, default: () => [] },
  canLinkSlack: { type: Boolean, default: false },
  linkError: { type: Object, default: null },
})
defineEmits(['close', 'disconnect', 'link-slack'])

const LABELS = { github: 'GitHub', slack_oidc: 'Slack' }
const connectedWith = computed(() => props.providers.map((p) => LABELS[p] ?? p).join(' et '))
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel settings">
      <button class="x" aria-label="Fermer" @click="$emit('close')"><X :size="18" aria-hidden="true" /></button>
      <div class="settings-body">
        <span class="panel-plate">Réglages</span>
        <h2 class="panel-name settings-title">Compte</h2>
        <div class="sect">
          <div class="eyebrow sect-h"><span>{{ connectedWith ? `Connecté avec ${connectedWith}` : 'Connecté' }}</span></div>
          <div class="repo-ptr"><span class="dot"></span>{{ accountName }}</div>
        </div>
        <div v-if="linkError" class="sect">
          <div class="banner err">
            <CircleX class="bico" :size="16" aria-hidden="true" />
            <div v-if="linkError.code === 'identity_already_exists' && /another user/i.test(linkError.description)">
              <span class="bt">Liaison impossible.</span>
              Ce compte Slack est déjà relié à un autre profil pr-dex.
            </div>
            <div v-else-if="linkError.code === 'identity_already_exists'">
              <span class="bt">Rien à faire.</span>
              Ce compte Slack est déjà relié à ton compte.
            </div>
            <div v-else>
              <span class="bt">La liaison avec Slack a échoué.</span>
              {{ linkError.description || linkError.code }}
            </div>
          </div>
        </div>
        <div v-if="canLinkSlack" class="sect">
          <button class="btn-ghost link-slack" @click="$emit('link-slack')">Lier mon compte Slack</button>
          <p class="muted">Tes boosters de monkey-testing arriveront dans cette collection.</p>
        </div>
        <div class="sect">
          <button class="btn-ghost" @click="$emit('disconnect')">Se déconnecter</button>
        </div>
        <div class="sect">
          <p class="muted">
            Ta collection est liée à ton compte. Les autres joueurs voient tes totaux dans le classement, pas le détail de tes PR.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
