<script setup>
import { computed, ref } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { REWARD } from '../../shared/arena-economy.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  credits: { type: Number, required: true },
  pokedollars: { type: Number, required: true },
  challenges: { type: Array, required: true },
  engageable: { type: Array, required: true },
  myOpen: { type: Object, default: null },
  levelOf: { type: Function, required: true },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'engage', 'accept'])

const chosen = ref(null)
const rulesOpen = ref(false)

/**
 * L'espèce dont on est en train de choisir l'exemplaire. Deux temps plutôt qu'un : une liste à
 * plat de tous les exemplaires devient illisible dès qu'on possède le dex, et le premier geste
 * naturel est « je veux envoyer un Dracaufeu », pas « je veux envoyer ce Dracaufeu-là ».
 */
const picking = ref(null)

/**
 * Sans engagement disponible on peut encore regarder, mais plus miser. La liste reste affichée
 * à dessein : la faire disparaître donnait un écran qui semblait cassé alors qu'il appliquait
 * simplement une règle.
 */
const canPlay = computed(() => props.credits > 0)

const others = computed(() => props.challenges.filter((c) => c.id !== props.myOpen?.id))

const found = (key) => props.engageable.find((e) => e.key === key)
const tierOf = (key) => DEX[found(key)?.species]?.tier ?? 'c'
const nameOf = (key) => DEX[found(key)?.species]?.name ?? '—'

/**
 * Les doublons d'une même espèce sont regroupés : à cinquante exemplaires ouverts, une liste à
 * plat devient illisible et l'on ne voit plus ce qu'on possède. On propose le plus aguerri de
 * chaque espèce — c'est celui qu'on engage en pratique — en annonçant combien attendent
 * derrière lui.
 */
const bySpecies = computed(() => {
  const map = new Map()
  for (const e of props.engageable) {
    const cur = map.get(e.species)
    if (!cur) map.set(e.species, { species: e.species, shiny: e.shiny, maxLevel: props.levelOf(e.key), count: 1 })
    else map.set(e.species, {
      ...cur,
      shiny: cur.shiny || e.shiny,
      maxLevel: Math.max(cur.maxLevel, props.levelOf(e.key)),
      count: cur.count + 1,
    })
  }
  return [...map.values()].sort((a, b) => b.maxLevel - a.maxLevel || a.species - b.species)
})

/** Les exemplaires d'une espèce, du plus aguerri au plus frais. */
const specimens = computed(() => props.engageable
  .filter((e) => e.species === picking.value)
  .sort((a, b) => props.levelOf(b.key) - props.levelOf(a.key)))

function openSpecies(species) {
  if (picking.value === species) { picking.value = null; return }
  picking.value = species
  chosen.value = null
  // Un seul exemplaire : le choisir est le seul geste possible, autant l'épargner au joueur.
  const seuls = props.engageable.filter((e) => e.species === species)
  if (seuls.length === 1) { chosen.value = seuls[0].key; picking.value = null }
}

function play(vsComputer) {
  if (!chosen.value) return
  emit('engage', chosen.value, vsComputer)
  chosen.value = null
}

function take(duelId) {
  if (!chosen.value) return
  emit('accept', duelId, chosen.value)
  chosen.value = null
}
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(680px,100%)">
      <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">ARÈNE</span>
          <h2 class="panel-name" style="font-size:23px;margin-bottom:0">Duels</h2>
        </div>
      </div>

      <div class="sect">
        <div class="arena-head">
          <div>
            <div class="arena-big" :class="{ spent: !credits }">{{ credits }}</div>
            <div class="arena-unit">engagement{{ credits > 1 ? 's' : '' }}</div>
          </div>
          <div>
            <div class="arena-big">{{ pokedollars }}</div>
            <div class="arena-unit">pokédollars</div>
          </div>
          <button class="btn-ghost" style="margin-left:auto" @click="rulesOpen = !rulesOpen">
            {{ rulesOpen ? 'Masquer les règles' : 'Comment ça marche' }}
          </button>
        </div>
        <p v-if="!credits" class="muted">
          Tu as joué tous tes engagements. Il en revient <b>un par jour ouvré</b>, et ils
          s’accumulent jusqu’à cinq — reviens demain.
        </p>
      </div>

      <div v-if="rulesOpen" class="sect">
        <div class="arena-rule">
          <b>Engager</b>
          <span class="muted">
            Tu mets un Pokémon en jeu sans savoir ce que l’autre engagera : vous découvrez vos
            deux choix en même temps. C’est tout l’intérêt — sinon le second ajusterait toujours
            juste ce qu’il faut pour gagner.
          </span>
        </div>
        <div class="arena-rule">
          <b>Perdre</b>
          <span class="muted">
            Le perdant perd son Pokémon, définitivement. L’espèce reste acquise à ta planche :
            c’est l’exemplaire qui disparaît, pas ce que tu as déjà découvert.
          </span>
        </div>
        <div class="arena-rule">
          <b>Gagner</b>
          <span class="muted">
            Tu gardes le tien, il monte d’un niveau ou plus, et tu remportes des pokédollars,
            des points de saison et un pli à ouvrir.
          </span>
        </div>
        <div class="arena-rule">
          <b>Combien</b>
          <span class="muted">
            Tu ne peux pas gagner plus que ce que l’adversaire a risqué. S’il engage un commun
            et toi un rare, le duel vaut un commun pour vous deux — comme au poker, on ne
            remporte que la mise que l’autre a couverte. Battre un rare ne vaut
            {{ REWARD.r.dollars }} pokédollars que si vous en avez engagé un chacun.
          </span>
        </div>
        <div class="arena-rule">
          <b>Le hasard</b>
          <span class="muted">
            Un Pokémon plus fort gagne plus souvent, jamais toujours : même face au pire écart
            possible, le plus faible garde une chance sur dix. Personne n’est intouchable, et un
            légendaire descendu chaque semaine finit toujours par tomber.
          </span>
        </div>
      </div>

      <div v-if="myOpen" class="sect">
        <div class="eyebrow sect-h"><span>Ton défi en cours</span></div>
        <div class="repo-ptr">
          <span class="dot"></span>
          {{ DEX[myOpen.species]?.name }} est sur la table. Personne ne voit lequel tu as engagé —
          et s’il reste sans preneur, l’ordinateur le relèvera demain.
        </div>
      </div>

      <div class="sect">
        <div class="eyebrow sect-h">
          <span>Ce que tu engages</span>
          <span class="mono muted">{{ engageable.length }} exemplaire{{ engageable.length > 1 ? 's' : '' }}</span>
        </div>
        <p v-if="!engageable.length" class="muted">
          Aucun exemplaire à engager pour l’instant.
        </p>
        <div class="arena-list">
          <button
            v-for="g in bySpecies" :key="g.species"
            class="arena-pick"
            :class="{ on: picking === g.species || (chosen && found(chosen)?.species === g.species) }"
            :disabled="!canPlay"
            @click="openSpecies(g.species)"
          >
            <img :src="spriteUrl(g.species, g.shiny)" :alt="DEX[g.species].name">
            <span class="nm">{{ DEX[g.species].name }}</span>
            <span class="lv">
              niv. {{ g.maxLevel }}<template v-if="g.count > 1"> · {{ g.count }} ex.</template>
            </span>
          </button>
        </div>

        <template v-if="picking">
          <p class="muted" style="margin:12px 0 8px">
            Lequel de tes <b>{{ DEX[picking].name }}</b> envoies-tu ? Le plus aguerri gagne plus
            souvent, et c’est aussi celui que tu regretteras le plus.
          </p>
          <div class="log">
            <label v-for="e in specimens" :key="e.key" class="log-row picker-row">
              <input type="radio" name="arena-specimen" :value="e.key" v-model="chosen">
              <span class="log-sha mono">niv. {{ levelOf(e.key) }}</span>
              <span class="log-title">
                {{ e.label ?? DEX[e.species].name }}
                <span v-if="e.shiny" class="chip" style="margin-left:6px">✦</span>
              </span>
              <span class="log-date">{{ e.date }}</span>
            </label>
          </div>
        </template>
      </div>

      <div v-if="chosen" class="sect">
        <div class="eyebrow sect-h">
          <span>{{ nameOf(chosen) }}, niveau {{ levelOf(chosen) }}</span>
          <span class="chip" :style="{ '--t': TIER_VAR[tierOf(chosen)] }">{{ TIER_LABEL[tierOf(chosen)] }}</span>
        </div>
        <p class="muted">
          Si tu perds, il est détruit. L’espèce reste à la planche, l’exemplaire non.
        </p>
        <div class="front-actions" style="margin-top:12px">
          <button class="btn-solid" :disabled="busy" @click="play(false)">Poster un défi</button>
          <button class="btn-ghost" :disabled="busy" @click="play(true)">Affronter l’ordinateur</button>
        </div>
      </div>

      <div class="sect">
        <div class="eyebrow sect-h"><span>Défis ouverts</span></div>
        <p v-if="!others.length" class="muted">
          Personne n’attend de preneur. Poste le tien — s’il reste seul, l’ordinateur le relèvera
          demain.
        </p>
        <div v-for="d in others" :key="d.id" class="log-row">
          <span class="log-title">{{ d.pseudo ?? 'Sans nom' }}</span>
          <span class="log-sha mono">Pokémon caché</span>
          <button class="evo-btn" :disabled="busy || !chosen" @click="take(d.id)">Relever</button>
        </div>
        <p v-if="others.length && !chosen" class="muted" style="margin-top:8px">
          Choisis d’abord ton Pokémon : vous révélerez vos deux choix en même temps.
        </p>
      </div>
    </div>
  </div>
</template>
