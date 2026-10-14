<script setup>
import { ref, watch } from 'vue'
import { X, CircleX } from '@lucide/vue'

const props = defineProps({
  accountName: { type: String, required: true },
  identities: { type: Array, default: () => [] },
  // Faux en démo : aucune session réelle à laquelle lier ou retirer un compte.
  manageable: { type: Boolean, default: false },
  accountError: { type: Object, default: null },
  /** Le pseudonyme actuel, ou `null` tant qu'on n'en a pas choisi. */
  pseudo: { type: String, default: null },
  saving: { type: Boolean, default: false },
  /** `taken` quand le nom est déjà pris, `server` pour le reste. */
  pseudoError: { type: String, default: null },
})
const emit = defineEmits(['close', 'disconnect', 'link', 'unlink', 'set-pseudo'])

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

/**
 * Le pseudonyme est la seule donnée personnelle qu'un adversaire lira, et sans lui on n'existe
 * pas dans l'arène : les vues publiques écartent les profils anonymes, si bien qu'on
 * n'apparaît ni au classement, ni dans les défis autrement que « Sans nom ».
 *
 * Bornes volontairement étroites — lettres, chiffres, tiret, point souligné, de 2 à 20 signes.
 * Un nom qui se lit à voix haute et se retape sans hésiter : c'est ce qu'on va coller à côté
 * d'un badge et dans une URL de profil.
 */
const MOTIF = /^[a-zA-Z0-9À-ÿ._-]{2,20}$/

/**
 * Pré-rempli avec le login GitHub quand aucun nom n'a encore été choisi.
 *
 * Le champ démarrait vide, et la conséquence n'était pas anodine : au lancement, personne
 * n'aurait de nom tant qu'il n'aurait pas trouvé cet écran — donc un classement vide et des
 * défis anonymes, alors que tout le monde est déjà connu au travail sous ce login-là.
 *
 * Proposé, jamais imposé : c'est la seule donnée qu'un adversaire lira, et la publier reste un
 * geste volontaire. Un clic suffit à confirmer, une frappe à changer.
 */
const suggere = (nom) => (nom ?? '').replace(/[^a-zA-Z0-9À-ÿ._-]/g, '').slice(0, 20)

const saisie = ref(props.pseudo ?? suggere(props.accountName))
watch(() => props.pseudo, (p) => { if (p) saisie.value = p })

const valide = () => MOTIF.test(saisie.value.trim())
const soumettre = () => { if (valide()) emit('set-pseudo', saisie.value.trim()) }
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
          <div class="eyebrow sect-h">
            <span>Ton nom dans l’arène</span>
            <span v-if="!pseudo" class="chip" style="--tier:var(--gold)">à choisir</span>
          </div>
          <p class="muted" style="margin-bottom:12px">
            C’est la seule chose que les autres verront de toi. Sans lui tu n’apparais ni au
            classement ni dans les défis, et personne ne peut ouvrir ton profil.
          </p>
          <form class="pseudo-form" @submit.prevent="soumettre">
            <input
              v-model="saisie" class="pseudo-input" type="text" maxlength="20"
              placeholder="deux à vingt signes" aria-label="Ton nom dans l’arène"
              :disabled="saving"
            >
            <button
              class="evo-btn" type="submit"
              :disabled="saving || !valide() || saisie.trim() === pseudo"
            >{{ pseudo ? 'Changer' : 'Choisir' }}</button>
          </form>
          <p v-if="pseudoError === 'taken'" class="muted pseudo-err">
            Ce nom est déjà pris. L’unicité ignore la casse et les espaces : <b>Leo</b> et
            <b>leo</b> comptent pour le même — dans une arène où l’on choisit son adversaire sur
            la foi d’un nom, deux joueurs qui se ressemblent suffisent à se faire passer l’un
            pour l’autre.
          </p>
          <p v-else-if="pseudoError" class="muted pseudo-err">
            L’enregistrement a échoué. Réessaie.
          </p>
          <p v-else-if="saisie.trim() && !valide()" class="muted pseudo-err">
            Lettres, chiffres, tiret, point souligné. De deux à vingt signes.
          </p>
        </div>
        <div class="sect">
          <button class="btn-ghost" @click="$emit('disconnect')">Se déconnecter</button>
        </div>
        <div class="sect">
          <p class="muted">
            Ta collection est liée à ton compte. Les autres joueurs voient tes totaux dans le classement, pas le détail de tes captures.
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
  </div>
</template>
