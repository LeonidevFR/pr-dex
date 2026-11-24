<script setup>
import { ref, computed, watch } from 'vue'
import { X } from '@lucide/vue'
import NoticeToast from './NoticeToast.vue'

const props = defineProps({
  accountName: { type: String, required: true },
  identities: { type: Array, default: () => [] },
  // Faux en démo : aucune session réelle à laquelle lier ou retirer un compte.
  manageable: { type: Boolean, default: false },
  accountError: { type: Object, default: null },
})
const emit = defineEmits(['close', 'disconnect', 'link', 'unlink'])

/** L'échec d'une liaison, lu pour un humain : `[titre, détail]`. */
const echec = computed(() => {
  const e = props.accountError
  if (!e) return null
  if (e.code === 'identity_already_exists' && /another user/i.test(e.description)) {
    return ['Liaison impossible.', 'Ce compte est déjà relié à un autre profil pr-dex.']
  }
  if (e.code === 'identity_already_exists') return ['Rien à faire.', 'Ce compte est déjà relié à ton compte.']
  return ['Ça n’a pas marché.', e.description || e.code]
})
const masque = ref(false)
watch(() => props.accountError, () => { masque.value = false })

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
        <div class="sect">
          <button class="btn-ghost" @click="$emit('disconnect')">Se déconnecter</button>
        </div>
        <div class="sect">
          <p class="muted">
            Ta collection est liée à ton compte, et le classement la publie : les autres y lisent
            tes espèces, tes shiny, tes rares, tes lignées et ton nombre de cartes. Le détail
            voyage avec : l’écran n’affiche que les totaux, mais la réponse du serveur contient
            chaque capture. Considère ta collection comme visible de l’équipe.
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
            Les badges de saison sont dessinés pour ce dex : huit médailles, une par mécanique
            du jeu. Les sprites viennent de PokéAPI. Pokémon est une marque de Nintendo, Game
            Freak et Creatures : ce dex est un jouet d'équipe, sans rapport avec eux et sans
            usage commercial.
          </p>
        </div>
      </div>
    </div>
    <div class="toast-pile">
      <NoticeToast
        :title="echec && !masque ? echec[0] : null" :message="echec && !masque ? echec[1] : null"
        @dismiss="masque = true"
      />
    </div>
  </div>
</template>
