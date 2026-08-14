<script setup>
import { computed, ref, watch } from 'vue'
import { DEX, PARENT, TIER_LABEL, TIER_VAR, familyOf, familyLine, CANDY_PER_CATCH } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'
import PokeCard from './PokeCard.vue'
import SPECIES_INFO from '../../shared/species-info.json'

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
})
const emit = defineEmits(['close', 'evolve'])

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
const availableCopies = computed(() => props.copies ?? props.entries?.length ?? 0)
const line = computed(() => familyLine(props.id))
const seen = (id) => props.caughtIds.has(id)
const info = computed(() => SPECIES_INFO[props.id] ?? null)
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" :style="{ '--tier': TIER_VAR[species.tier] }">
      <div class="panel-top">
        <button class="x" @click="$emit('close')">✕</button>
        <!-- Capturée, l'espèce se montre sous la forme où on l'a gagnée : sa carte, posée à
             plat. Non capturée, elle reste la planche vide en dessin préparatoire — il n'y a
             pas d'exemplaire, donc pas de carte. -->
        <div v-if="caught" class="pkc-stage panel-card">
          <PokeCard
            :species-id="id" :tier="species.tier" :shiny="shiny" scene="day"
            @activate="zoomed = true"
          />
        </div>
        <div v-else class="panel-art ghost" :tabindex="-1">
          <img :src="spriteUrl(id, shiny)" :alt="species.name" @error="$event.target.dataset.broken = '1'">
        </div>
        <div>
          <span class="panel-plate mono">PLANCHE Nº {{ pad(id) }}</span>
          <h2 class="panel-name">{{ caught ? species.name : '—————' }}</h2>
          <span class="chip">{{ TIER_LABEL[species.tier] }}</span>
          <span v-if="shiny" class="chip shiny-chip" style="margin-left:6px">✦ Chromatique</span>
          <span
            v-for="t in (caught ? info?.types ?? [] : [])" :key="t.slug"
            class="type-chip" :style="{ '--type': `var(--type-${t.slug})` }"
          >{{ t.name }}</span>
        </div>
      </div>

      <div v-if="!caught" class="sect">
        <p class="muted">
          Pas encore à la planche. Sortira d'une capture<template v-if="PARENT[id]">, ou d'une évolution de
          <b>{{ DEX[PARENT[id]].name }}</b></template>.
        </p>
      </div>

      <div v-if="caught && line.length > 1" class="sect">
        <div class="eyebrow sect-h"><span>Lignée</span></div>
        <div class="line">
          <template v-for="(step, i) in line" :key="i">
            <div v-if="i" class="line-arrow mono" aria-hidden="true">
              <span>▶</span><span class="line-cost">{{ DEX[line[i - 1][0]].cost }}</span>
            </div>
            <div class="line-step">
              <div
                v-for="s in step" :key="s" class="line-cell"
                :class="{ here: s === id, unseen: !seen(s) }"
                :style="{ '--tier': TIER_VAR[DEX[s].tier] }"
              >
                <img :src="spriteUrl(s)" :alt="seen(s) ? DEX[s].name : DEX[s].name + ', jamais rencontré'">
                <span class="line-name">{{ DEX[s].name }}</span>
                <span v-if="s === id" class="line-here mono">ici</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div v-if="caught" class="sect">
        <div class="eyebrow sect-h">
          <span>Journal des captures</span>
          <span class="mono copies-count">
            {{ availableCopies }} exemplaire{{ availableCopies > 1 ? 's' : '' }}
          </span>
        </div>
        <div class="log">
          <component
            v-for="(e, i) in entries" :key="e.key ?? e.date + '-' + i"
            :is="e.via === 'catch' && e.url ? 'a' : 'div'" class="log-row"
            :href="e.via === 'catch' ? e.url : null"
            target="_blank" rel="noopener"
          >
            <span v-if="e.via === 'catch'" class="log-sha">{{ e.source }}</span>
            <span v-else class="log-evo">↑ évo</span>
            <span class="log-title">
              {{ e.via === 'catch' ? e.label : 'Évolué depuis ' + DEX[e.from].name }}
              <span v-if="e.via === 'catch' && e.ref" class="log-repo"> · {{ e.ref }}</span>
            </span>
            <span class="log-date">{{ e.date }}</span>
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
              v-if="targets.length === 1" class="evo-btn" :disabled="!canEvolve"
              @click="startPicking(targets[0])"
            >
              Faire évoluer en {{ DEX[targets[0]].name }}
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
            {{ CANDY_PER_CATCH }} bonbons par capture dans la famille. Les doublons servent à ça.
          </p>
        </template>

        <template v-else>
          <p class="muted" style="margin-bottom:12px">
            Choisis l'exemplaire à faire évoluer en <b>{{ DEX[pickingTarget].name }}</b>.
          </p>
          <div class="log">
            <label v-for="e in available" :key="e.key" class="log-row picker-row">
              <input type="radio" name="specimen" :value="e.key" v-model="selectedKey">
              <span v-if="e.via === 'catch'" class="log-sha">{{ e.source }}</span>
              <span v-else class="log-evo">↑ évo</span>
              <span class="log-title">
                {{ e.via === 'catch' ? e.label : 'Évolué depuis ' + DEX[e.from].name }}
                <span v-if="e.shiny" class="chip shiny-chip" style="margin-left:6px">✦</span>
              </span>
              <span class="log-date">{{ e.date }}</span>
            </label>
          </div>
          <div class="picker-actions">
            <button class="evo-btn" :disabled="!selectedKey" @click="confirmEvolve">Confirmer</button>
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
          {{ species.name }} n'évolue pas, mais ses doublons créditent la famille
          <b>{{ DEX[familyOf(id)].name }}</b> — {{ CANDY_PER_CATCH }} bonbons par capture.
        </p>
      </div>

      <div v-else-if="caught && entries.length > 1 && isDeadEnd" class="sect">
        <div class="eyebrow sect-h"><span>La réserve</span></div>
        <div class="reserve">
          <div class="reserve-count mono">{{ entries.length }}</div>
          <div class="reserve-txt">
            <p class="muted">
              <b>{{ species.name }}</b> n'évolue pas — ses doublons ne se convertissent pas, et c'est
              assumé. Ils s'empilent comme une petite collection dans la réserve : « encore un », mais
              dans un tiroir qui se remplit.
            </p>
            <div class="press"><span v-for="n in Math.min(entries.length, 12)" :key="n">{{ pad(id) }}</span></div>
          </div>
        </div>
      </div>

      <div v-if="caught && info" class="sect">
        <div class="eyebrow sect-h"><span>Notice</span></div>
        <blockquote class="dexnote">{{ info.text }}</blockquote>
      </div>
    </div>

    <!-- En grand, c'est la carte — pas le sprite seul. On y retrouve l'exemplaire tel qu'on
         l'a gagné, dos compris : la provenance vient de la capture la plus récente. -->
    <div v-if="zoomed" class="zoom-scrim" @click="zoomed = false; zoomFlipped = false">
      <div class="pkc-stage zoom-card" @click.stop>
        <PokeCard
          :species-id="id" :tier="species.tier" :shiny="shiny" scene="day"
          :provenance="lastProvenance" :flipped="zoomFlipped"
          @activate="zoomFlipped = !zoomFlipped"
        />
        <span class="zoom-hint">{{ zoomFlipped ? 'Cliquer pour revenir à la face' : 'Cliquer pour voir le dos' }}</span>
      </div>
    </div>
  </div>
</template>
