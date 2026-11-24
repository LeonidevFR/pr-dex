<script setup>
import RewardTable from './RewardTable.vue'
import { Sparkle } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { REWARD } from '../../shared/arena-economy.js'
import { spriteUrl } from '../lib/sprites.js'
import { routePath } from '../composables/useRoute.js'

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
  busy: { type: Boolean, default: false },
  preselect: { type: String, default: null },
})
const emit = defineEmits(['engage', 'accept', 'navigate'])

const chosen = ref(null)
/** Le défi qu'on a choisi de relever : on choisit ensuite le Pokémon qu'on lui oppose. */
const target = ref(null)
const pickSection = ref(null)
function aim(defi) {
  target.value = defi
  pickSection.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}
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
  // La liste des exemplaires se referme avec l'engagement, sinon la grille des espèces reste
  // masquée derrière celle de l'espèce qu'on vient de jouer : pour en engager un second, il
  // fallait d'abord comprendre qu'il y avait une liste à refermer.
  chosen.value = null
  picking.value = null
}

function take(duelId) {
  if (!chosen.value) return
  emit('accept', duelId, chosen.value)
  chosen.value = null
  picking.value = null
  target.value = null
}
</script>

<template>
  <section class="view">
    <!--
      Le motif de la refonte : surtitre minuscule, titre éditorial, et les chiffres qui comptent
      en haut à droite — là où le Pokédex met déjà son compteur. Les crédits et la caisse sont à
      l'arène ce que « 42 / 151 » est à la collection : ce qu'on vient vérifier d'un coup d'œil.
    -->
    <div class="view-head">
      <div>
        <div class="eyebrow">Arène</div>
        <h1 class="view-title">Duels</h1>
      </div>
      <div class="view-totals">
        <div>
          <div class="eyebrow">Engagements</div>
          <div class="view-num" :class="{ 'is-spent': !credits }">{{ credits }}</div>
        </div>
        <div>
          <div class="eyebrow">En caisse</div>
          <div class="view-num gold">{{ pokedollars }} ₽</div>
        </div>
      </div>
    </div>

  <!-- Les défis des collègues d'abord : c'est ce qui attend une réponse, et ce qui expire. -->
  <div class="sect">
    <div class="eyebrow sect-h">
      <span>Défis à relever</span>
      <span v-if="others.length" class="mono">{{ others.length }} en attente</span>
    </div>
    <p v-if="!others.length" class="muted">
      Personne n’attend de preneur. Poste le tien : s’il reste seul, l’ordinateur le relèvera
      demain.
    </p>
    <div v-else class="defis">
      <div v-for="d in others" :key="d.id" class="defi" :class="{ cible: target?.id === d.id }">
        <div class="defi-txt">
          <span><b class="defi-login">{{ d.login ?? 'Un collègue' }}</b> te défie</span>
          <span class="muted">Son Pokémon reste caché jusqu’au combat.</span>
        </div>
        <button
          class="defi-btn" :class="target?.id === d.id ? 'btn-ghost' : 'btn-solid'"
          :disabled="busy || !canPlay" :aria-pressed="target?.id === d.id" @click="aim(d)"
        >{{ target?.id === d.id ? 'Choisi' : 'Relever' }}</button>
      </div>
    </div>
  </div>

  <div class="sect">
    <div class="sect-h">
      <span>Règles</span>
      <button class="btn-ghost" @click="rulesOpen = !rulesOpen">
        {{ rulesOpen ? 'Masquer les règles' : 'Comment ça marche' }}
      </button>
    </div>
    <p v-if="!credits" class="muted">
      Tu as joué tous tes engagements. Il en revient <b>un par jour ouvré</b>, et ils
      s’accumulent jusqu’à cinq. Reviens demain.
    </p>
  <template v-if="rulesOpen">
    <div class="arena-rule">
      <b>Engager</b>
      <span class="muted">
        Tu mets un Pokémon en jeu sans savoir ce que l’autre engagera : vous découvrez vos
        deux choix en même temps.
      </span>
    </div>
    <div class="arena-rule">
      <b>Joueur ou ordinateur</b>
      <span class="muted">
        Contre un collègue, tu postes un défi ou tu relèves le sien. Le perdant perd son Pokémon,
        le gagnant prend tous les gains. Un défi que personne ne relève en vingt-quatre heures
        est joué contre l’ordinateur. Contre l’ordinateur, le duel se joue tout de suite et ne
        risque rien : personne ne perd de Pokémon, mais tu ne gagnes ni niveau, ni point de
        saison, ni carte, et les pokédollars sont au cinquième du tarif. Les deux coûtent un
        engagement.
      </span>
    </div>
    <!--
      La forme est nommée dans les règles, jamais chiffrée. Donner la table transformerait le
      choix en addition : chacun la lirait une fois et calculerait. Dire qu'elle change chaque
      jour et qu'on ne voit que la sienne suffit à ce qu'on la surveille — ce qu'elle pèse,
      chacun se le figurera à l'usage.
    -->
    <div class="arena-rule">
      <b>La forme du jour</b>
      <span class="muted">
        Chaque exemplaire a une forme qui change tous les jours et qui entre dans son résultat.
        Tu la vois sur ta fiche d’espèce, pour tes Pokémon seulement : celle de ton adversaire
        t’est cachée, comme sa mise. À toi de juger si le jour est bon.
      </span>
    </div>
    <div class="arena-rule">
      <b>Perdre</b>
      <span class="muted">
        Le perdant perd son Pokémon, définitivement. L’espèce reste acquise à ta collection :
        c’est l’exemplaire qui disparaît, pas ce que tu as déjà découvert.
      </span>
    </div>
    <div class="arena-rule">
      <b>Gagner</b>
      <span class="muted">
        Tu gardes le tien, il monte d’un niveau ou plus, et tu remportes des pokédollars,
        des points de saison et une carte à découvrir.
      </span>
    </div>
    <div class="arena-rule">
      <b>Combien</b>
      <span class="muted">
        Le duel rapporte ce que rapporte le moins rare des deux Pokémon. Un rare contre un
        commun rapporte comme un commun. Pour gagner {{ REWARD.r.dollars }} ₽, il faut un rare de
        chaque côté ; un légendaire de chaque côté en rapporte {{ REWARD.l.dollars }}.
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
  </template>
  </div>
  <!-- Le barème fait partie des règles : il s'ouvre avec elles. -->
  <RewardTable v-if="rulesOpen" />

  <!--
    Ses propres défis, tous. On n'en montrait qu'un, alors qu'on peut en poster autant qu'on a
    de crédits : les autres restaient invisibles à leur auteur, qui ne savait plus lesquels de
    ses Pokémon étaient immobilisés ni combien de défis il avait laissés traîner.
  -->
  <div v-if="myOpen.length" class="sect">
    <div class="eyebrow sect-h">
      <span>{{ myOpen.length > 1 ? 'Tes défis en cours' : 'Ton défi en cours' }}</span>
      <span v-if="myOpen.length > 1" class="mono" style="font-size:11px;color:var(--fg-3)">
        {{ myOpen.length }} exemplaires immobilisés
      </span>
    </div>
    <div v-for="d in myOpen" :key="d.id" class="repo-ptr" style="margin-bottom:8px">
      <span class="dot"></span>
      <b>{{ DEX[d.species]?.name ?? 'Un exemplaire' }}</b> est sur la table.
    </div>
    <p class="muted">
      Personne ne voit ce que tu as engagé. Un défi sans preneur au bout de vingt-quatre heures
      est relevé par l’ordinateur. Gagnant ou perdant, ton exemplaire redevient libre.
    </p>
  </div>

  <div ref="pickSection" class="sect">
    <div class="eyebrow sect-h">
      <span>Choisis ton Pokémon</span>
      <span class="mono muted">{{ engageable.length }} exemplaire{{ engageable.length > 1 ? 's' : '' }}</span>
    </div>
    <p v-if="target" class="defi-rappel">
      Tu relèves le défi de <b>{{ target.login ?? 'un collègue' }}</b> : choisis le Pokémon que tu
      lui opposes.
      <button class="cancel-btn" style="margin-left:8px;padding:4px 10px" @click="target = null">Annuler</button>
    </p>
    <p v-if="!engageable.length" class="muted">
      Aucun exemplaire à engager pour l’instant.
    </p>
    <!--
      Les mêmes vignettes que le choix d'exemplaire de la fiche : un seul geste de sélection
      dans toute l'application. Les tuiles d'avant étaient un reste de l'ancienne direction,
      avec leur cadre carré et leur typographie à part.
    -->
    <div v-if="!picking" class="specimens especes">
      <button
        v-for="g in bySpecies" :key="g.species" type="button" class="specimen"
        :class="{ on: chosen && found(chosen)?.species === g.species, shiny: g.shiny }"
        :aria-pressed="chosen && found(chosen)?.species === g.species ? 'true' : 'false'"
        :disabled="!canPlay" :title="DEX[g.species].name"
        @click="openSpecies(g.species)"
      >
        <Sparkle v-if="g.shiny" class="specimen-shiny" :size="12" fill="currentColor" aria-label="shiny" />
        <img :src="spriteUrl(g.species, g.shiny)" alt="">
        <span class="specimen-date">
          {{ DEX[g.species].name }}<i v-if="g.count > 1" class="specimen-mult">×{{ g.count }}</i>
        </span>
        <span class="specimen-ref mono">niv. {{ g.maxLevel }}</span>
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
      <!--
        La forme du jour entre dans le calcul au même titre que le niveau : l'afficher sur la
        vignette, c'est la seule façon d'engager en connaissance de cause plutôt que de perdre
        sans comprendre pourquoi.
      -->
      <div class="specimens exemplaires">
        <button
          v-for="e in specimens" :key="e.key" type="button" class="specimen"
          :class="{ on: chosen === e.key, shiny: e.shiny }" :data-key="e.key"
          :aria-pressed="chosen === e.key ? 'true' : 'false'"
          :title="e.label ?? DEX[e.species].name"
          @click="chosen = e.key"
        >
          <Sparkle v-if="e.shiny" class="specimen-shiny" :size="12" fill="currentColor" aria-label="shiny" />
          <img :src="spriteUrl(e.species, e.shiny)" alt="">
          <span class="specimen-date">niv. {{ levelOf(e.key) }}</span>
          <span
            class="specimen-ref" :class="{ 'form-up': formOfKey(e.key).factor > 1,
                                           'form-down': formOfKey(e.key).factor < 1 }"
          >{{ formOfKey(e.key).name }}</span>
        </button>
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
    <div v-if="target" class="arena-bar-actions">
      <button class="btn-solid" :disabled="busy" @click="take(target.id)">
        Relever le défi de {{ target.login ?? 'ce collègue' }}
      </button>
      <button class="btn-ghost" :disabled="busy" @click="target = null">Annuler</button>
    </div>
    <div v-else class="arena-bar-actions">
      <button class="btn-solid" :disabled="busy" @click="play(false)">Poster un défi</button>
      <button class="btn-ghost" :disabled="busy" @click="play(true)">Affronter l’ordinateur</button>
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
      Le classement, le badge en jeu et ce qui reste à jouer sont sur la page
      <a :href="routePath({ name: 'classements' })" @click.prevent="emit('navigate', 'classements')">Scores</a>.
    </p>
  </div>

  </section>
</template>
