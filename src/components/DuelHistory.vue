<script setup>
import { ref, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { DEX, TIER_LABEL } from '../../shared/species.js'
import { REWARD, COMPUTER_REWARD } from '../../shared/arena-economy.js'
import { LEVEL_MAX, levelGain, parisDay } from '../../shared/battle.js'
import { spriteUrl } from '../lib/sprites.js'
import { formatShortDate } from '../lib/dates.js'

const props = defineProps({
  /** `({ userId, offset, limit, issue, adversaire }) => Promise<{ duels, plus }>` */
  load: { type: Function, required: true },
  userId: { type: String, required: true },
  /** Change quand un duel vient de se jouer : la liste repart de la première page. */
  version: { type: null, default: null },
})

const PAGE = 20
const ISSUES = [['tous', 'Tous'], ['gagnes', 'Gagnés'], ['perdus', 'Perdus']]
const ADVERSAIRES = [['tous', 'Tous'], ['joueur', 'Joueurs'], ['ordinateur', 'Ordinateur']]

const issue = ref('tous')
const adversaire = ref('tous')
const duels = ref([])
const plus = ref(false)
const chargement = ref(false)
const erreur = ref(false)

/**
 * Chaque lecture porte un numéro : un filtre changé pendant qu'une page arrive ne doit pas voir
 * l'ancienne réponse s'ajouter à la nouvelle liste.
 */
let lecture = 0
async function lire(depuis) {
  const n = ++lecture
  chargement.value = true
  erreur.value = false
  try {
    const page = await props.load({
      userId: props.userId, offset: depuis, limit: PAGE, issue: issue.value, adversaire: adversaire.value,
    })
    if (n !== lecture) return
    duels.value = depuis ? [...duels.value, ...page.duels] : page.duels
    plus.value = page.plus
  } catch {
    if (n === lecture) erreur.value = true
  } finally {
    if (n === lecture) chargement.value = false
  }
}
watch([issue, adversaire, () => props.version], () => lire(0), { immediate: true })

/** Une ligne lue depuis mon camp, que j'aie posté le défi ou que je l'aie relevé. */
function ligne(d) {
  const challengeur = d.challenger_id === props.userId
  const camp = (moi) => {
    const c = challengeur === moi
    return {
      species: c ? d.challenger_species : d.opponent_species,
      level: c ? d.challenger_level : d.opponent_level,
      power: Number(c ? d.challenger_power : d.opponent_power),
    }
  }
  const moi = camp(true)
  const lui = camp(false)
  const ordinateur = d.status === 'computer'
  const gagne = d.winner_id === props.userId
  const t = d.stake_tier
  const details = [
    ordinateur ? 'contre l’ordinateur' : `contre ${d.adversaire_login ?? 'un collègue'}`,
    formatShortDate(d.resolved_at ? parisDay(new Date(d.resolved_at)) : null), `enjeu ${TIER_LABEL[t]?.toLowerCase() ?? '—'}`]
  if (ordinateur) {
    details.push(gagne ? `+${COMPUTER_REWARD[t]} ₽` : 'rien de perdu')
  } else if (gagne) {
    details.push(`+${REWARD[t].dollars} ₽`, `+${REWARD[t].points} pts`)
    const niv = Math.min(levelGain(moi.power, lui.power), LEVEL_MAX - moi.level)
    if (niv > 0) details.push(`+${niv} niv.`)
    details.push('1 carte')
  } else {
    details.push(`${DEX[moi.species]?.name ?? 'Ton Pokémon'} perdu`)
  }
  return {
    id: d.id, gagne, moi, lui, details, perte: !ordinateur && !gagne,
  }
}
const nom = (species) => DEX[species]?.name ?? '—'
</script>

<template>
  <div class="sect duel-histo">
    <div class="eyebrow sect-h"><span>Derniers duels</span></div>

    <div class="histo-filtres">
      <label class="vendre-tri">
        <span>Résultat</span>
        <span class="vendre-select">
          <select v-model="issue" aria-label="Résultat">
            <option v-for="[v, l] in ISSUES" :key="v" :value="v">{{ l }}</option>
          </select>
          <ChevronDown :size="14" aria-hidden="true" />
        </span>
      </label>
      <label class="vendre-tri">
        <span>Adversaire</span>
        <span class="vendre-select">
          <select v-model="adversaire" aria-label="Adversaire">
            <option v-for="[v, l] in ADVERSAIRES" :key="v" :value="v">{{ l }}</option>
          </select>
          <ChevronDown :size="14" aria-hidden="true" />
        </span>
      </label>
    </div>

    <p v-if="erreur" class="muted">L’historique n’a pas pu se charger. Réessaie dans un moment.</p>
    <p v-else-if="!duels.length && !chargement" class="muted">
      {{ issue === 'tous' && adversaire === 'tous' ? 'Aucun duel joué pour l’instant.' : 'Aucun duel ne correspond à ces filtres.' }}
    </p>

    <ol v-if="duels.length" class="histo-liste">
      <li v-for="l in duels.map(ligne)" :key="l.id" class="histo-ligne" :class="l.gagne ? 'gagne' : 'perdu'">
        <span class="histo-issue">{{ l.gagne ? 'Gagné' : 'Perdu' }}</span>
        <div class="histo-corps">
          <div class="histo-face">
            <span class="histo-camp">
              <img :src="spriteUrl(l.moi.species)" alt="" class="histo-sprite">
              <b>{{ nom(l.moi.species) }}</b><span class="mono">niv. {{ l.moi.level }}</span>
            </span>
            <span class="histo-camp">
              <span class="histo-vs">vs</span>
              <img :src="spriteUrl(l.lui.species)" alt="" class="histo-sprite">
              <b>{{ nom(l.lui.species) }}</b><span class="mono">niv. {{ l.lui.level }}</span>
            </span>
          </div>
          <div class="histo-details mono" :class="{ perte: l.perte }">{{ l.details.join(' · ') }}</div>
        </div>
      </li>
    </ol>

    <button v-if="plus && !erreur" class="btn-ghost histo-plus" :disabled="chargement" @click="lire(duels.length)">
      {{ chargement ? 'Chargement…' : 'Voir plus' }}
    </button>
  </div>
</template>
