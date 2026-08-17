<script setup>
import { computed, ref, watch } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { REWARD } from '../../shared/arena-economy.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  credits: { type: Number, required: true },
  pokedollars: { type: Number, required: true },
  challenges: { type: Array, required: true },
  engageable: { type: Array, required: true },
  /** Ses propres défis en attente. Pluriel : on peut en poster autant qu'on a de crédits. */
  myOpen: { type: Array, default: () => [] },
  levelOf: { type: Function, required: true },
  formOfKey: { type: Function, required: true },
  /** Le nom sous lequel on apparaît, ou `null` tant qu'on n'en a pas choisi. */
  pseudo: { type: String, default: null },
  busy: { type: Boolean, default: false },
  preselect: { type: String, default: null },
})
const emit = defineEmits(['engage', 'accept'])

const chosen = ref(null)
const rulesOpen = ref(false)

/**
 * L'espèce dont on est en train de choisir l'exemplaire. Deux temps plutôt qu'un : une liste à
 * plat de tous les exemplaires devient illisible dès qu'on possède le dex, et le premier geste
 * naturel est « je veux envoyer un Dracaufeu », pas « je veux envoyer ce Dracaufeu-là ».
 */
const picking = ref(null)

/**
 * Venir depuis la fiche d'une espèce, c'est arriver avec un Pokémon déjà en tête : on le
 * retient d'emblée plutôt que d'obliger à le retrouver dans la grille qu'on vient de quitter.
 */
watch(() => props.preselect, (key) => { if (key) { chosen.value = key; picking.value = null } },
  { immediate: true })

/**
 * Sans engagement disponible on peut encore regarder, mais plus miser. La liste reste affichée
 * à dessein : la faire disparaître donnait un écran qui semblait cassé alors qu'il appliquait
 * simplement une règle.
 */
const canPlay = computed(() => props.credits > 0)

/**
 * Les défis des AUTRES. Les siens en sont retirés — on ne relève pas son propre défi, et le
 * serveur le refuse — mais ils ne disparaissent pas pour autant : ils s'affichent à part, avec
 * ce qu'on y a engagé.
 */
const miens = computed(() => new Set(props.myOpen.map((d) => d.id)))
const others = computed(() => props.challenges.filter((c) => !miens.value.has(c.id)))

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
  <section class="page">
  <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
    <div>
      <span class="panel-plate mono">ARÈNE</span>
      <h2 class="panel-name" style="font-size:23px;margin-bottom:0">Duels</h2>
    </div>
  </div>

  <!--
    Sans nom, on n'existe pas dans l'arène : les vues publiques écartent les profils anonymes.
    Le rappel se pose ici plutôt que dans les réglages, à l'endroit où le manque a une
    conséquence — on ne va pas chercher un réglage dont on ignore l'existence.
  -->
  <div v-if="!pseudo" class="sect sans-nom">
    <p class="muted">
      <b>Tu joues encore sans nom.</b> Les autres te verront « Sans nom » sur tes défis, et tu
      n’apparaîtras pas au classement de la saison. Choisis-le dans les réglages — c’est la
      seule chose qu’ils verront de toi.
    </p>
  </div>

  <div class="sect">
    <div class="arena-head">
      <div>
        <div class="arena-big" :class="{ spent: !credits }">{{ credits }}</div>
        <div class="arena-unit">engagement{{ credits > 1 ? 's' : '' }}</div>
      </div>
      <div>
        <div class="arena-big">{{ pokedollars }} ₽</div>
        <div class="arena-unit">en caisse</div>
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
        {{ REWARD.r.dollars }} ₽ que si vous en avez engagé un chacun — un légendaire des
        deux côtés en vaut {{ REWARD.l.dollars }}.
      </span>
    </div>
    <div class="arena-rule">
      <b>Le hasard</b>
      <span class="muted">
        Un Pokémon plus fort gagne plus souvent, jamais toujours : même face au pire écart
        possible, le plus faible garde une chance sur vingt. Personne n’est intouchable, et un
        légendaire descendu chaque semaine finit toujours par tomber.
      </span>
    </div>
  </div>

  <!--
    Ses propres défis, tous. On n'en montrait qu'un, alors qu'on peut en poster autant qu'on a
    de crédits : les autres restaient invisibles à leur auteur, qui ne savait plus lesquels de
    ses Pokémon étaient immobilisés ni combien de défis il avait laissés traîner.
  -->
  <div v-if="myOpen.length" class="sect">
    <div class="eyebrow sect-h">
      <span>{{ myOpen.length > 1 ? 'Tes défis en cours' : 'Ton défi en cours' }}</span>
      <span v-if="myOpen.length > 1" class="mono" style="font-size:11px;color:var(--ink-3)">
        {{ myOpen.length }} exemplaires immobilisés
      </span>
    </div>
    <div v-for="d in myOpen" :key="d.id" class="repo-ptr" style="margin-bottom:8px">
      <span class="dot"></span>
      <b>{{ DEX[d.species]?.name ?? 'Un exemplaire' }}</b> est sur la table.
    </div>
    <p class="muted">
      Personne ne voit ce que tu as engagé. Un défi sans preneur au bout de vingt-quatre heures
      est relevé par l’ordinateur, et ton exemplaire redevient libre — gagnant ou perdant.
    </p>
  </div>

  <div class="sect">
    <div class="eyebrow sect-h">
      <span>Ce que tu engages</span>
      <span class="mono muted">{{ engageable.length }} exemplaire{{ engageable.length > 1 ? 's' : '' }}</span>
    </div>
    <p v-if="!engageable.length" class="muted">
      Aucun exemplaire à engager pour l’instant.
    </p>
    <div v-if="!picking" class="arena-list">
      <button
        v-for="g in bySpecies" :key="g.species"
        class="arena-pick"
        :class="{ on: picking === g.species || (chosen && found(chosen)?.species === g.species) }"
        :disabled="!canPlay"
        @click="openSpecies(g.species)"
      >
        <img :src="spriteUrl(g.species, g.shiny)" :alt="DEX[g.species].name">
        <span class="nm">
          {{ DEX[g.species].name }}<b v-if="g.count > 1" class="mult">×{{ g.count }}</b>
        </span>
        <span class="lv">niv. {{ g.maxLevel }}</span>
      </button>
    </div>

    <template v-if="picking">
      <p class="muted" style="margin:12px 0 8px">
        Lequel de tes <b>{{ DEX[picking].name }}</b> envoies-tu ? Le plus aguerri gagne plus
        souvent, et c’est aussi celui que tu regretteras le plus.
        <button class="cancel-btn" style="margin-left:8px;padding:4px 10px" @click="picking = null">
          Changer d’espèce
        </button>
      </p>
      <div class="log">
        <label v-for="e in specimens" :key="e.key" class="log-row picker-row">
          <input type="radio" name="arena-specimen" :value="e.key" v-model="chosen">
          <span class="log-sha mono">niv. {{ levelOf(e.key) }}</span>
          <span class="log-title">
            {{ e.label ?? DEX[e.species].name }}
            <span v-if="e.shiny" class="chip" style="margin-left:6px">✦</span>
          </span>
          <!--
            La forme du jour entre dans le calcul au même titre que le niveau : l'afficher
            ici, c'est la seule façon d'engager en connaissance de cause plutôt que de
            perdre sans comprendre pourquoi.
          -->
          <span class="log-date" :class="{ 'form-up': formOfKey(e.key).factor > 1,
                                           'form-down': formOfKey(e.key).factor < 1 }">
            {{ formOfKey(e.key).name }}
          </span>
        </label>
      </div>
    </template>
  </div>

  <!--
    Collée en bas du panneau : la grille défile, et une barre d'action posée à sa suite
    sortait de l'écran au moment précis où l'on venait de choisir. On cliquait, rien ne
    semblait se produire — parce que ce qui avait changé n'était plus visible.
  -->
  <div v-if="chosen" class="arena-bar">
    <div class="arena-bar-txt">
      <div class="line-name">
        {{ nameOf(chosen) }} · niv. {{ levelOf(chosen) }} ·
        <span :class="{ 'form-up': formOfKey(chosen).factor > 1,
                        'form-down': formOfKey(chosen).factor < 1 }">
          {{ formOfKey(chosen).name.toLowerCase() }}
        </span>
      </div>
      <div class="muted" style="font-size:11.5px">S’il perd, il est détruit.</div>
    </div>
    <div class="arena-bar-actions">
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
    <!--
      L'explication passe AVANT la liste, et le bouton porte lui-même son état : posée
      dessous, elle arrivait après le clic sur un bouton muet — on croyait le bouton cassé
      alors qu'il attendait qu'on choisisse sa propre mise.
    -->
    <p v-if="others.length && !chosen" class="muted" style="margin-bottom:10px">
      Choisis d’abord le Pokémon que <b>tu</b> engages, plus haut : vous révélerez vos deux
      choix en même temps.
    </p>
    <div v-for="d in others" :key="d.id" class="log-row">
      <span class="log-title">{{ d.pseudo ?? 'Sans nom' }}</span>
      <span class="log-sha mono">Pokémon caché</span>
      <button class="evo-btn" :disabled="busy || !chosen" @click="take(d.id)">
        {{ chosen ? 'Relever' : 'Choisis ta mise' }}
      </button>
    </div>
  </div>
  <!--
    Le classement et les badges vivaient ici, en onglet. Ils montraient un sous-ensemble de ce
    que la page Saison montre désormais — sans le compte à rebours, le badge en jeu, le barème
    ni l'étagère — et deux écrans qui disent la même chose finissent par ne plus la dire
    pareil. L'arène est le lieu où l'on se bat ; on y renvoie vers la saison plutôt que de la
    résumer.
  -->
  <div class="sect">
    <p class="muted">
      Le classement, le badge en jeu et ce qui reste à jouer sont sur l’écran
      <b>Saison</b>.
    </p>
  </div>

  </section>
</template>
