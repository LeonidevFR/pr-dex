<script setup>
import { ref } from 'vue'

const props = defineProps({
  initialRepo: { type: String, default: '' },
  error: { type: String, default: null }, // 'invalid' | 'revoked' | 'notfound' | 'offline' | 'server'
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['connect'])

const token = ref('')
const repo = ref(props.initialRepo)

const submit = () => emit('connect', { token: token.value.trim(), repo: repo.value.trim() })
</script>

<template>
  <div class="front">
    <div class="front-mark">PR<span>·</span>DEX</div>
    <p class="front-sub">
      Le dex vit dans un repo GitHub privé. Colle un jeton d'accès une fois : l'app lit tes captures
      et y écrit tes décisions. Rien n'est stocké ailleurs.
    </p>

    <div v-if="error" class="banner err">
      <span class="bico">✕</span>
      <div>
        <template v-if="error === 'invalid'">
          <span class="bt">Jeton invalide.</span>
          Le jeton est vide ou mal copié. Recopie-le en entier depuis GitHub, sans espace au début ni à la fin.
        </template>
        <template v-else-if="error === 'revoked'">
          <span class="bt">Jeton révoqué.</span>
          GitHub a refusé ce jeton — il a expiré ou a été supprimé. Fabriques-en un nouveau et colle-le ci-dessous.
        </template>
        <template v-else-if="error === 'notfound'">
          <span class="bt">Repo introuvable.</span>
          Le jeton est bon mais <b class="mono">{{ repo }}</b> n'existe pas ou n'est pas dans sa portée.
          Vérifie le nom du repo et que le jeton est bien scopé dessus.
        </template>
        <template v-else-if="error === 'offline'">
          <span class="bt">Pas de réseau.</span>
          Impossible de joindre GitHub. Vérifie ta connexion et réessaie.
        </template>
        <template v-else>
          <span class="bt">GitHub est indisponible.</span>
          Le service a répondu par une erreur. Ce n'est ni ton jeton ni ton repo — réessaie dans un moment.
        </template>
      </div>
    </div>

    <div class="sheet">
      <div class="sheet-h">
        <span class="eyebrow">Fabriquer le jeton</span>
        <span class="mono" style="font-size:11px;color:var(--ink-3)">github.com › settings › tokens</span>
      </div>
      <div class="sheet-b">
        <ol class="steps">
          <li>Sur GitHub, ouvre <code>Settings › Developer settings › Fine-grained tokens</code>.</li>
          <li>Portée : <b>ce repo uniquement</b> — <code>{{ repo || 'moi/pr-dex-data' }}</code>. Pas « all repositories ».</li>
          <li>Permission <code>Contents</code> en <b>Read and write</b>. Rien d'autre.</li>
          <li>Expiration : <b>No expiration</b> — c'est un outil perso qu'on ne veut pas ré-armer.</li>
        </ol>
        <div class="perm">
          <div class="perm-row"><span class="k">Portée</span> {{ repo || 'moi/pr-dex-data' }} — <b>ce repo seul</b></div>
          <div class="perm-row"><span class="k">Contents</span> <b>read / write</b></div>
          <div class="perm-row"><span class="k">Expiration</span> <b>aucune</b></div>
        </div>
        <div class="field">
          <label for="tok">Jeton d'accès</label>
          <input id="tok" v-model="token" type="password" placeholder="github_pat_..." @keyup.enter="submit">
        </div>
        <div class="field">
          <label for="rp">Repo de données</label>
          <input id="rp" v-model="repo" type="text" spellcheck="false" placeholder="moi/pr-dex-data" @keyup.enter="submit">
        </div>
        <div class="front-actions">
          <button class="btn-solid" :disabled="busy" @click="submit">
            {{ busy ? 'Connexion…' : 'Se connecter' }}
          </button>
          <span class="muted">Le jeton reste sur cette machine. Le site public ne contient aucune donnée.</span>
        </div>
      </div>
    </div>
  </div>
</template>
