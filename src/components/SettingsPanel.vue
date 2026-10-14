<script setup>
import { ref } from 'vue'
import { X, CircleX } from '@lucide/vue'

const props = defineProps({
  accountName: { type: String, required: true },
  identities: { type: Array, default: () => [] },
  // Faux en démo : aucune session réelle à laquelle lier ou retirer un compte.
  manageable: { type: Boolean, default: false },
  accountError: { type: Object, default: null },
})
const emit = defineEmits(['close', 'disconnect', 'link', 'unlink'])

const PROVIDERS = [['github', 'GitHub'], ['slack_oidc', 'Slack']]
const linked = (provider) => props.identities.find((i) => i.provider === provider)

// Délier coupe une source de cartes : un premier clic demande confirmation. Supabase refuse de
// retirer le dernier compte, le bouton n'apparaît donc qu'à partir de deux.
const confirming = ref(null)
function onUnlink(provider) {
  if (confirming.value !== provider) { confirming.value = provider; return }
  confirming.value = null
  emit('unlink', provider)
}
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel settings">
      <button class="x" aria-label="Fermer" @click="$emit('close')"><X :size="18" aria-hidden="true" /></button>
      <div class="settings-body">
        <span class="panel-plate">Réglages</span>
        <h2 class="panel-name settings-title">Compte</h2>
        <div class="sect">
          <div class="eyebrow sect-h"><span>Comptes liés</span></div>
          <div v-if="!manageable" class="repo-ptr"><span class="dot"></span>{{ accountName }}</div>
          <template v-else>
            <div v-for="[provider, label] in PROVIDERS" :key="provider" class="acct-row">
              <span class="acct-label">{{ label }}</span>
              <template v-if="linked(provider)">
                <span class="repo-ptr acct-name"><span class="dot"></span>{{ linked(provider).name }}</span>
                <button v-if="identities.length > 1" class="acct-btn unlink" @click="onUnlink(provider)">
                  {{ confirming === provider ? 'Confirmer' : 'Délier' }}
                </button>
              </template>
              <button v-else :class="['btn-ghost', 'acct-link', provider === 'github' ? 'link-github' : 'link-slack']" @click="$emit('link', provider)">
                Lier mon compte {{ label }}
              </button>
            </div>
            <p v-if="!linked('slack_oidc')" class="muted acct-hint">Tes boosters de monkey-testing arrivent par ton compte Slack.</p>
          </template>
        </div>
        <div v-if="accountError" class="sect">
          <div class="banner err">
            <CircleX class="bico" :size="16" aria-hidden="true" />
            <div v-if="accountError.code === 'identity_already_exists' && /another user/i.test(accountError.description)">
              <span class="bt">Liaison impossible.</span>
              Ce compte est déjà relié à un autre profil pr-dex.
            </div>
            <div v-else-if="accountError.code === 'identity_already_exists'">
              <span class="bt">Rien à faire.</span>
              Ce compte est déjà relié à ton compte.
            </div>
            <div v-else>
              <span class="bt">Ça n'a pas marché.</span>
              {{ accountError.description || accountError.code }}
            </div>
          </div>
        </div>
        <div class="sect">
          <button class="btn-ghost" @click="$emit('disconnect')">Se déconnecter</button>
        </div>
        <div class="sect">
          <p class="muted">
            Ta collection est liée à ton compte. Les autres joueurs voient tes totaux dans le classement, pas le détail de tes captures.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
