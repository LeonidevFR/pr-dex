<script setup>
import { MoveRight, Sparkle, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { DEX, PARENT, TIER_LABEL, TIER_VAR, familyOf, familyLine, CANDY_PER_CATCH } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'
import { formatDate, formatShortDate } from '../lib/dates.js'
import PokeCard from './PokeCard.vue'
import SPECIES_INFO from '../../shared/species-info.json'
import { salePrice } from '../../shared/arena-economy.js'
import { saleGroups, saleTotal } from '../lib/revente.js'

const props = defineProps({
  id: { type: Number, required: true },
  entries: { type: Array, default: null },
  // Exemplaires disponibles maintenant (une évolution passée a pu en consommer) — distinct
  // de `entries.length`, qui reste le journal complet, y compris les exemplaires déjà évolués.
  copies: { type: Number, default: null },
  candies: { type: Number, required: true },
  canEvolve: { type: Boolean, required: true },
  isDeadEnd: { type: Boolean, required: true },
  // Ensemble des espèces déjà à la planche : la lignée doit savoir lesquelles de ses étapes
  // ont été vues, information qu'`entries` (limité à l'espèce courante) ne porte pas.
  caughtIds: { type: Set, default: () => new Set() },
  // Exemplaires consommables par une évolution, chacun avec sa `key` et son statut `shiny` —
  // sert au sélecteur, distinct de `entries` qui garde tout le journal (y compris consommé).
  available: { type: Array, default: () => [] },
  arenaCredits: { type: Number, default: 0 },
  arenaLevelOf: { type: Function, default: () => 1 },
  /**
   * La forme du jour d'un exemplaire, ou `null` tant que l'arène n'a pas ouvert. Elle entre dans
   * le calcul de puissance au même titre que le niveau : la lire ici, là où l'on regarde ses
   * Pokémon, évite d'avoir à ouvrir l'arène pour savoir si le moment est bon.
   */
  arenaFormOf: { type: Function, default: null },
})
const emit = defineEmits(['close', 'evolve', 'engage', 'sell'])

/**
 * Vendre un exemplaire précis, depuis la fiche où on est justement en train de le regarder. Le
 * lot se fait en boutique ; ici on largue celui-là.
 *
 * Deux clics, comme un achat : le second dit le prix, pour qu'on confirme ce qu'on encaisse et
 * pas seulement qu'on a cliqué. Et jamais le dernier exemplaire — le serveur le refuserait, et
 * proposer ce qui sera repris est une promesse en trop.
 */
const aVendre = ref(null)

const prixDe = (e) => salePrice(props.id, props.arenaLevelOf(e.key), e.shiny)

/**
 * Le lot, ici aussi.
 *
 * Il vivait en boutique, et c'était une erreur de découpage : quand on a dix Nidoran sous les
 * yeux, c'est de LÀ qu'on veut les larguer, pas après avoir changé d'écran. La règle est la même
 * des deux côtés — `saleGroups` la porte une seule fois — donc le défaut épargne le meilleur
 * exemplaire, les chromatiques et ceux qui ont gagné des niveaux.
 */
const lot = computed(() => saleGroups(props.available, props.arenaLevelOf)[0] ?? null)

const lotPrix = computed(() => lot.value
  ? saleTotal([lot.value], new Set(lot.value.preselected))
  : 0)

function vendre(e) {
  if (aVendre.value !== e.key) { aVendre.value = e.key; return }
  aVendre.value = null
  emit('sell', [e.key])
}

function vendreLeLot() {
  if (!lot.value?.preselected.length) return
  if (aVendre.value !== 'lot') { aVendre.value = 'lot'; return }
  aVendre.value = null
  emit('sell', [...lot.value.preselected])
}

// Cible d'évolution en cours de sélection (id de l'espèce), ou `null` hors sélection.
const pickingTarget = ref(null)
const selectedKey = ref(null)

function startPicking(target) {
  pickingTarget.value = target
  // Le chromatique reste protégé par défaut : pré-coché s'il y en a un, modifiable ensuite.
  selectedKey.value = props.available.find((e) => e.shiny)?.key ?? props.available[0]?.key ?? null
}

function cancelPicking() {
  pickingTarget.value = null
  selectedKey.value = null
}

// Le picker peut rester ouvert pendant qu'un `refresh()` change `available` (ex. l'autre
// appareil a consommé l'exemplaire sélectionné). Sans ça, `selectedKey` pointerait vers un
// exemplaire disparu : aucun radio coché, mais le bouton Confirmer resterait actif.
watch(
  () => props.available,
  (list) => {
    if (!pickingTarget.value) return
    if (list.some((e) => e.key === selectedKey.value)) return
    selectedKey.value = list.find((e) => e.shiny)?.key ?? list[0]?.key ?? null
  },
)

function confirmEvolve() {
  if (!selectedKey.value) return
  const to = pickingTarget.value
  const key = selectedKey.value
  cancelPicking()
  emit('evolve', { from: props.id, to, key })
}

const species = computed(() => DEX[props.id])
const caught = computed(() => (props.entries?.length ?? 0) > 0)
const shiny = computed(() => props.entries?.some((e) => e.shiny) ?? false)
// Rien à voir en grand sur une silhouette non capturée.
const zoomed = ref(false)
const zoomFlipped = ref(false)

/**
 * Le dos de la carte en grand porte la capture la plus récente. Une espèce peut avoir
 * plusieurs exemplaires ; en montrer un seul est un choix assumé — le journal, juste en
 * dessous, les liste tous. Une évolution n'a pas de PR d'origine, d'où le repli sur la
 * capture la plus récente qui en soit une — et, à défaut de toute capture (Léviator, ou
 * n'importe quelle forme jamais tirée au paquet), sur l'évolution elle-même : elle a bien
 * une origine à raconter, la même que celle du journal. Sans ça la carte se retournait
 * sur une face vide alors que l'écran proposait d'en voir le dos.
 */
const lastProvenance = computed(() => {
  const entries = props.entries ?? []
  const captures = entries.filter((e) => e.label)
  const derniere = captures[captures.length - 1]
  if (derniere) return { ref: derniere.ref ?? null, label: derniere.label, date: derniere.date }

  const evolution = entries.filter((e) => e.via === 'evo').at(-1)
  if (!evolution) return null
  return { ref: null, label: `Évolué depuis ${DEX[evolution.from].name}`, date: evolution.date }
})
const targets = computed(() => {
  const to = species.value.to
  return to === null ? [] : Array.isArray(to) ? to : [to]
})
const pad = (n) => String(n).padStart(3, '0')
const shortDate = formatShortDate
// La référence sans son hash de commit (« moi/atlas#142 · a3f8c21 » → « moi/atlas#142 ») ;
// sans référence, le nom de la source reste le seul repère.
const journalRef = (e) => (e.ref ? e.ref.split(' · ')[0] : e.source)
// Le numéro de PR quand il y en a un ; sinon la source, et « évolution » pour une carte fabriquée.
const shortRef = (e) => (e.via === 'catch' ? (e.ref?.match(/#\d+/)?.[0] ?? e.source) : 'évolution')
// La date de la toute première capture : le journal est dans l'ordre d'arrivée, mais une
// évolution peut y précéder une capture plus ancienne, d'où le minimum plutôt que le premier.
const firstDate = computed(() => (props.entries ?? []).map((e) => e.date).sort()[0] ?? null)
const typeNames = computed(() => (info.value?.types ?? []).map((t) => t.name).join(' · '))
const availableCopies = computed(() => props.copies ?? props.entries?.length ?? 0)
const line = computed(() => familyLine(props.id))
const seen = (id) => props.caughtIds.has(id)
const info = computed(() => SPECIES_INFO[props.id] ?? null)
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" :style="{ '--tier': TIER_VAR[species.tier] }">
      <button class="x" aria-label="Fermer" @click="$emit('close')"><X :size="18" aria-hidden="true" /></button>
      <div class="sheet-grid">
        <div class="sheet-side">
          <!-- Capturée, l'espèce se montre sous la forme où on l'a gagnée : sa carte, sous la
               même lumière que le rituel puisque la fiche est elle aussi posée sur le velours.
               Non capturée, elle reste une silhouette — pas d'exemplaire, donc pas de carte. -->
          <div v-if="caught" class="pkc-stage panel-card">
            <PokeCard
              :species-id="id" :tier="species.tier" :shiny="shiny" scene="night"
              @activate="zoomed = true"
            />
          </div>
          <div v-else class="panel-art ghost" :tabindex="-1">
            <img :src="spriteUrl(id, shiny)" :alt="species.name" @error="$event.target.dataset.broken = '1'">
          </div>
        </div>
        <div class="sheet-main">
          <div class="panel-top">
            <span class="panel-plate">Nº {{ pad(id) }}</span>
            <h2 class="panel-name">{{ caught ? species.name : '—————' }}</h2>
            <div class="panel-chips">
              <span class="chip">{{ TIER_LABEL[species.tier] }}</span>
              <span v-if="shiny" class="chip shiny-chip"><Sparkle :size="11" fill="currentColor" aria-hidden="true" />Shiny</span>
              <span
                v-for="t in (caught ? info?.types ?? [] : [])" :key="t.slug"
                class="type-chip" :style="{ '--type': `var(--type-${t.slug})` }"
              >{{ t.name }}</span>
            </div>
            <!-- La notice d'abord : c'est la phrase qu'on lit avant les chiffres. -->
            <blockquote v-if="caught && info" class="dexnote">{{ info.text }}</blockquote>
          </div>

          <!-- Trois chiffres d'un coup d'œil, avant le détail des sections. -->
          <dl v-if="caught" class="sheet-facts">
            <div><dt class="eyebrow">Type</dt><dd>{{ typeNames || '—' }}</dd></div>
            <div><dt class="eyebrow">Cartes</dt><dd>{{ availableCopies }}</dd></div>
            <div><dt class="eyebrow">Première capture</dt><dd>{{ firstDate ? formatDate(firstDate) : '—' }}</dd></div>
          </dl>

      <div v-if="!caught" class="sect">
        <p class="muted">
          Pas encore dans ton Pokédex. Sortira d'une carte<template v-if="PARENT[id]">, ou d'une évolution de
          <b>{{ DEX[PARENT[id]].name }}</b></template>.
        </p>
      </div>

      <div v-if="caught && line.length > 1" class="sect">
        <div class="eyebrow sect-h"><span>Lignée</span></div>
        <div class="line">
          <template v-for="(step, i) in line" :key="i">
            <!-- Le coût se lit avec la flèche : « 8 bonbons » pour passer à l'étage suivant. -->
            <div v-if="i" class="line-arrow" aria-hidden="true">
              <MoveRight :size="26" :stroke-width="1.5" />
              <span class="line-cost">{{ DEX[line[i - 1][0]].cost }} bonbons</span>
            </div>
            <div class="line-step">
              <div
                v-for="s in step" :key="s" class="line-cell"
                :class="{ here: s === id, unseen: !seen(s) }" :aria-current="s === id ? 'true' : null"
                :style="{ '--tier': TIER_VAR[DEX[s].tier] }"
              >
                <img :src="spriteUrl(s)" :alt="seen(s) ? DEX[s].name : DEX[s].name + ', jamais rencontré'">
                <span class="line-name">{{ DEX[s].name }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!--
        Engager depuis la fiche : c'est le geste naturel — on regarde son Dracaufeu, on décide
        de l'envoyer. Le passage par l'écran d'arène restait possible, mais il obligeait à
        retrouver dans une grille le Pokémon qu'on avait justement sous les yeux.
      -->
      <div v-if="caught && available.length" class="sect">
        <!--
          Pas de niveau en tête de section. Il y en avait un, celui du PREMIER exemplaire de la
          liste — ni le plus fort ni le plus faible, seulement le plus ancien — présenté comme
          s'il était celui de l'espèce. Une espèce n'a pas de niveau ; ses exemplaires en ont un
          chacun, et c'est la liste qui les porte.
        -->
        <div class="eyebrow sect-h">
          <span>Arène</span>
          <span class="mono muted">
            {{ available.length }} exemplaire{{ available.length > 1 ? 's' : '' }}
          </span>
        </div>

        <!--
          Un exemplaire par ligne avec sa forme : à plusieurs exemplaires, elles diffèrent — la
          forme se tire de la clé, pas de l'espèce — et c'est précisément ce qui décide lequel
          engager aujourd'hui.

          Le NOM de la forme, jamais son coefficient. Afficher « ×1,05 » transforme une intuition
          en calcul : chacun lit la table une fois, la retient, et le choix cesse d'être un pari
          pour devenir une addition. La couleur suffit à dire si la forme aide ou handicape, et
          l'ampleur se découvre à l'usage — c'est aux joueurs de se faire leur idée du poids que
          ça pèse.
        -->
        <!--
          Le choix se fait À LA LIGNE, et non par un bouton unique qui envoyait `available[0]` —
          le plus ancien exemplaire, choisi par personne. Dès qu'une espèce en compte deux de
          niveaux différents, ce bouton engageait au hasard ce qu'on n'avait pas décidé.
        -->
        <div v-if="lot && lot.preselected.length" class="vendre-lot">
          <button
            class="evo-btn vendre-tout" :class="{ confirming: aVendre === 'lot' }"
            @click="vendreLeLot"
          >{{ aVendre === 'lot'
            ? `Confirmer — ${lotPrix} ₽`
            : `Vendre les ${lot.preselected.length} en trop · ${lotPrix} ₽` }}</button>
          <span class="muted vendre-lot-note">
            Garde ton meilleur exemplaire, les chromatiques et ceux qui ont gagné des niveaux.
          </span>
        </div>

        <div class="formes">
          <div v-for="(e, i) in available" :key="e.key" class="forme-ligne">
            <span class="mono no">{{ i + 1 }}</span>
            <span class="quoi">niv. {{ arenaLevelOf(e.key) }}</span>
            <!-- Sans cette étoile, la ligne du chromatique n'était qu'un prix quatre fois plus
                 élevé que ses voisines, sans rien pour le dire — et c'est justement celle qu'on
                 ne doit pas vendre par distraction. -->
            <span v-if="e.shiny" class="chip shiny-chip forme-shiny" role="img" aria-label="shiny">
              <Sparkle :size="10" fill="currentColor" aria-hidden="true" />
            </span>
            <span
              v-if="arenaFormOf" class="forme-nom"
              :class="{ up: arenaFormOf(e.key).factor > 1, down: arenaFormOf(e.key).factor < 1 }"
            >{{ arenaFormOf(e.key).name }}</span>
            <span v-else class="forme-nom"></span>
            <button
              class="evo-btn arena-send" style="padding:6px 12px"
              :disabled="!arenaCredits" @click="$emit('engage', e.key)"
            >Choisir</button>
            <button
              v-if="available.length > 1" class="evo-btn vendre-un"
              :class="{ confirming: aVendre === e.key }" @click="vendre(e)"
            >{{ aVendre === e.key ? `Confirmer — ${prixDe(e)} ₽` : `Vendre · ${prixDe(e)} ₽` }}</button>
          </div>
        </div>
        <!--
          L'explication n'a lieu d'être QUE là où le bouton vient de disparaître : on en avait
          plusieurs, on a vendu, il n'en reste qu'un — et l'absence se lit comme une panne. Sur
          une espèce qu'on n'a jamais eue qu'en un exemplaire, il n'y a rien à expliquer, et la
          phrase ne serait que du bruit sur les trois quarts des fiches.
        -->
        <p
          v-if="available.length < 2 && (entries?.length ?? 0) > available.length"
          class="muted" style="margin-bottom:10px"
        >
          Il ne t’en reste qu’un, et il ne se vend pas : sans lui, plus moyen d’engager l’espèce à
          l’arène ni de la faire évoluer. Son entrée au Pokédex, elle, est acquise pour toujours.
        </p>
        <p class="muted">
          <template v-if="arenaCredits">
            L’arène s’ouvre avec l’exemplaire retenu : tu choisiras ensuite de poster un défi,
            d’affronter l’ordinateur ou de relever celui d’un autre.
          </template>
          <template v-else>
            Aucun engagement disponible — il en revient un par jour ouvré.
          </template>
        </p>
      </div>

      <div v-if="caught" class="sect">
        <div class="eyebrow sect-h">
          <span>Journal des captures</span>
          <span class="mono copies-count">
            {{ availableCopies }} carte{{ availableCopies > 1 ? 's' : '' }}
          </span>
        </div>
        <div class="log">
          <component
            v-for="(e, i) in entries" :key="e.key ?? e.date + '-' + i"
            :is="e.via === 'catch' && e.url ? 'a' : 'div'" class="log-row"
            :href="e.via === 'catch' ? e.url : null"
            target="_blank" rel="noopener"
          >
            <span v-if="e.via !== 'catch'" class="log-evo">Évolution</span>
            <span class="log-title">
              {{ e.via === 'catch' ? e.label : 'Évolué depuis ' + DEX[e.from].name }}
              <span v-if="e.via === 'catch'" class="log-repo"> · {{ journalRef(e) }}</span>
            </span>
            <span class="log-date">{{ formatDate(e.date) }}</span>
          </component>
        </div>
      </div>

      <div v-if="caught && targets.length" class="sect">
        <div class="eyebrow sect-h"><span>Bonbons {{ DEX[familyOf(id)].name }}</span></div>

        <template v-if="!pickingTarget">
          <div class="candy">
            <div class="candy-meter">
              <div class="candy-nums"><b>{{ candies }}</b><i> / {{ species.cost }}</i></div>
              <div class="cbar">
                <div class="cbar-fill" :style="{ width: Math.min(100, candies / species.cost * 100) + '%' }"></div>
              </div>
            </div>
            <button
              v-if="targets.length === 1" class="evo-btn evolve-btn" :disabled="!canEvolve"
              @click="startPicking(targets[0])"
            >
              Choisir la carte à faire évoluer en {{ DEX[targets[0]].name }}
            </button>
          </div>
          <div v-if="targets.length > 1" class="evo-choices">
            <button
              v-for="t in targets" :key="t" class="evo-choice" :disabled="!canEvolve"
              @click="startPicking(t)"
            >
              <img :src="spriteUrl(t)" :alt="DEX[t].name">{{ DEX[t].name }}
            </button>
          </div>
          <p class="muted" style="margin-top:12px">
            Chaque carte de la famille {{ DEX[familyOf(id)].name }} rapporte {{ CANDY_PER_CATCH }} bonbons. Il en faut {{ species.cost }} pour faire évoluer {{ species.name }}.
          </p>
        </template>

        <template v-else>
          <p class="picker-q">Quelle carte fait évoluer en {{ DEX[pickingTarget].name }} ?</p>
          <!-- Des vignettes plutôt qu'une liste à cocher : on choisit une carte, pas une ligne de
               formulaire. Le titre de la PR reste en infobulle, la vignette dit l'essentiel. -->
          <div class="specimens">
            <button
              v-for="e in available" :key="e.key" type="button" class="specimen"
              :class="{ on: selectedKey === e.key, shiny: e.shiny }" :data-key="e.key"
              :aria-pressed="selectedKey === e.key ? 'true' : 'false'"
              :title="e.via === 'catch' ? e.label : 'Évolué depuis ' + DEX[e.from].name"
              @click="selectedKey = e.key"
            >
              <Sparkle v-if="e.shiny" class="specimen-shiny" :size="12" fill="currentColor" aria-label="shiny" />
              <img :src="spriteUrl(id, e.shiny)" alt="">
              <span class="specimen-date">{{ shortDate(e.date) }}</span>
              <span class="specimen-ref mono">{{ shortRef(e) }}</span>
            </button>
          </div>
          <div class="picker-actions">
            <button
              class="evo-btn evolve-btn" :disabled="!selectedKey" @click="confirmEvolve"
            >Faire évoluer · {{ species.cost }} bonbons</button>
            <button class="cancel-btn" @click="cancelPicking">Annuler</button>
          </div>
        </template>
      </div>

      <div v-else-if="caught && !isDeadEnd" class="sect">
        <div class="eyebrow sect-h"><span>Bonbons {{ DEX[familyOf(id)].name }}</span></div>
        <div class="candy">
          <div class="candy-meter">
            <div class="candy-nums"><b>{{ candies }}</b></div>
          </div>
        </div>
        <p class="muted" style="margin-top:12px">
          {{ species.name }} n'évolue plus. Chaque nouvelle carte rapporte quand même {{ CANDY_PER_CATCH }} bonbons
          à la famille <b>{{ DEX[familyOf(id)].name }}</b>, pour faire évoluer ses autres membres.
        </p>
      </div>

      <div v-else-if="caught && entries.length > 1 && isDeadEnd" class="sect">
        <div class="eyebrow sect-h"><span>Cartes en double</span></div>
        <div class="reserve">
          <div class="reserve-count mono">{{ entries.length }}</div>
          <div class="reserve-txt">
            <p class="muted">
              <b>{{ species.name }}</b> n'a pas d'évolution. Ses cartes en double ne rapportent pas de
              bonbons : elles sont gardées ici.
            </p>
            <div class="press"><span v-for="n in Math.min(entries.length, 12)" :key="n">{{ pad(id) }}</span></div>
          </div>
        </div>
      </div>

        </div>
      </div>
    </div>

    <!-- En grand, c'est la carte — pas le sprite seul. On y retrouve l'exemplaire tel qu'on
         l'a gagné, dos compris : la provenance vient de la capture la plus récente. -->
    <div v-if="zoomed" class="zoom-scrim" @click="zoomed = false; zoomFlipped = false">
      <div class="pkc-stage zoom-card" @click.stop>
        <PokeCard
          :species-id="id" :tier="species.tier" :shiny="shiny" scene="night"
          :provenance="lastProvenance" :flipped="zoomFlipped"
          @activate="zoomFlipped = !zoomFlipped"
        />
        <span class="zoom-hint">{{ zoomFlipped ? 'Cliquer pour revenir à la face' : 'Cliquer pour voir le dos' }}</span>
      </div>
    </div>
  </div>
</template>
