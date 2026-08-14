<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  githubLogin: { type: String, required: true },
  /** Le pseudonyme actuel, ou `null` tant qu'on n'en a pas choisi. */
  pseudo: { type: String, default: null },
  saving: { type: Boolean, default: false },
  /** `taken` quand le nom est déjà pris, `server` pour le reste. */
  pseudoError: { type: String, default: null },
})
const emit = defineEmits(['close', 'disconnect', 'set-pseudo'])

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

const saisie = ref(props.pseudo ?? '')
watch(() => props.pseudo, (p) => { if (p) saisie.value = p })

const valide = () => MOTIF.test(saisie.value.trim())
const soumettre = () => { if (valide()) emit('set-pseudo', saisie.value.trim()) }
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
        <div class="eyebrow sect-h">
          <span>Ton nom dans l’arène</span>
          <span v-if="!pseudo" class="chip" style="--tier:var(--stamp)">à choisir</span>
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
          <button class="evo-btn" type="submit" :disabled="saving || !valide() || saisie.trim() === pseudo">
            {{ pseudo ? 'Changer' : 'Choisir' }}
          </button>
        </form>
        <p v-if="pseudoError === 'taken'" class="muted pseudo-err">
          Ce nom est déjà pris. L’unicité ignore la casse et les espaces : <b>Leo</b> et
          <b>leo</b> comptent pour le même — dans une arène où l’on choisit son adversaire sur
          la foi d’un nom, deux joueurs qui se ressemblent suffisent à se faire passer l’un pour
          l’autre.
        </p>
        <p v-else-if="pseudoError" class="muted pseudo-err">
          L’enregistrement a échoué. Réessaie.
        </p>
        <p v-else-if="saisie.trim() && !valide()" class="muted pseudo-err">
          Lettres, chiffres, tiret, point souligné. De deux à vingt signes.
        </p>
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
