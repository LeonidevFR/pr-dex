<script setup>
import { ChevronsUp, Gem, Search, Sparkle } from '@lucide/vue'
import { computed } from 'vue'
import { DEX, SPECIES, SPECIES_GEN2, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'
import { matchesQuery } from '../composables/useTrayFilters.js'

const props = defineProps({
  bySpecies: { type: Object, required: true },
  // Exemplaires DISPONIBLES par espèce : ni consommés par une évolution, ni détruits à l'arène.
  // À défaut, on retombe sur le total brut de `bySpecies`.
  available: { type: Object, default: () => ({}) },
  evolvable: { type: Set, default: () => new Set() },
  activeTiers: { type: Set, default: () => new Set(['c', 'u', 'r', 'l']) },
  statusFilter: { type: String, default: 'all' }, // 'all' | 'caught' | 'uncaught' | 'evolvable'
  gen: { type: Number, default: 1 },
  query: { type: String, default: '' },
})
const emit = defineEmits([
  'select', 'toggle-tier', 'set-status-filter', 'set-query', 'reset-filters', 'set-gen',
])

// Les mêmes mots que les filtres : une pastille qui abrège ce que le filtre écrit en entier
// obligeait à faire le lien. Le commun n'en a pas — c'est la case par défaut.
const PILL = { u: TIER_LABEL.u, r: TIER_LABEL.r, l: TIER_LABEL.l }

/**
 * Deux étagères, jamais une seule grille.
 *
 * La planche des 151 est ce que le travail remplit — c'est elle que compte le rail et elle qui
 * définit ce qu'« avoir fini » veut dire. La Gen 2 ne s'obtient qu'en boutique : la verser dans
 * la même grille ferait passer le compteur à 251 et afficherait cent cases vides pour toujours,
 * là où elle est une collection à part, qu'on entame quand on a de quoi.
 */
const TABLES = { 1: SPECIES, 2: SPECIES_GEN2 }
const ids = computed(() => TABLES[props.gen].map(([id]) => id))
/**
 * Ce que la case doit montrer : le stock qu'on a EN MAIN.
 *
 * La case lisait `bySpecies`, qui garde tout ce qui a été vu — un shiny perdu à l'arène laissait
 * donc une case dorée qu'on ouvrait sur une fiche sans le moindre shiny, et le bandeau d'origine
 * nommait la provenance d'un exemplaire qui n'existait plus.
 *
 * Quand il ne reste rien, on retombe sur le brut : le Pokédex garde ce qu'il a rencontré, et une
 * case grise à la place d'une espèce acquise serait un mensonge dans l'autre sens.
 */
const shown = (id) => {
  const dispo = props.available[id]
  return dispo?.length ? dispo : props.bySpecies[id] ?? []
}
const isShiny = (entries) => entries?.some((e) => e.shiny) ?? false
const copyCount = (id) => props.available[id]?.length ?? props.bySpecies[id]?.length ?? 0

const TIERS = Object.keys(TIER_LABEL)
const hasActiveFilters = computed(
  () => props.activeTiers.size < TIERS.length || props.statusFilter !== 'all' || props.query.trim() !== '',
)

/**
 * Le compte de chaque étagère, et non seulement de celle qu'on regarde.
 *
 * `caughtInGen` ne savait compter que la génération courante : l'autre onglet affichait donc un
 * tiret, qui devenait un zéro dès qu'on y passait. Deux écritures pour le même chiffre, dont
 * une fausse — il n'y a aucune raison d'ignorer un compte qu'on sait faire.
 */
const comptePar = computed(() => Object.fromEntries(
  Object.entries(TABLES).map(([gen, table]) =>
    [gen, table.filter(([id]) => props.bySpecies[id]).length]),
))

// « Évoluables » se lit sur le même jeu que le badge ▲ de la case : le filtre ne peut pas
// montrer autre chose que ce que la grille annonçait déjà. Ce jeu ne retient que les espèces
// dont l'évolution manque encore au Pokédex — évoluer vers une forme déjà vue n'apporte rien.
const visibleIds = computed(() =>
  ids.value.filter((id) => {
    if (!matchesQuery(id, props.query)) return false
    if (!props.activeTiers.has(DEX[id].tier)) return false
    const caught = !!props.bySpecies[id]
    if (props.statusFilter === 'caught' && !caught) return false
    if (props.statusFilter === 'uncaught' && caught) return false
    if (props.statusFilter === 'evolvable' && !props.evolvable.has(id)) return false
    return true
  }),
)

// Une grille vide est un état normal ici — on n'a pas toujours de quoi faire évoluer
// quelqu'un — mais elle ne doit pas rester muette : sans un mot, elle se lit comme un bug.
// La raison n'est nommée que si « Évoluables » est bien seul en cause : un palier décoché
// en même temps rendrait l'explication fausse.
const emptyLabel = computed(() => {
  if (visibleIds.value.length > 0) return null
  if (props.query.trim()) return 'Aucun Pokémon ne correspond'
  const seulementEvolvable = props.statusFilter === 'evolvable'
    && props.activeTiers.size === TIERS.length
  return seulementEvolvable
    ? 'Rien à faire évoluer pour l’instant. Il faut une carte libre, assez de bonbons, et une évolution que tu n’as pas encore.'
    : 'Aucune espèce ne répond à ces filtres.'
})

const evolvableCount = computed(() => props.evolvable.size)
const tierOf = (id) => DEX[id].tier
</script>

<template>
  <!--
    Deux étagères et non deux filtres : la planche se compte sur 151 et la Gen 2 sur 100, et
    mêler les deux ferait mentir la seule mesure qui dise « j'ai fini ».

    Elle vient AVANT la barre d'outils : l'étagère dit de quelle grille on parle, la barre
    cherche à l'intérieur. L'inverse se lirait comme un filtre parmi les autres.
  -->
  <div class="gen-tabs">
    <button
      class="filter-chip" :class="{ active: gen === 1 }" @click="emit('set-gen', 1)"
    >Génération 1 · {{ comptePar[1] }}/151</button>
    <button
      class="filter-chip" :class="{ active: gen === 2 }" @click="emit('set-gen', 2)"
    >Génération 2 · {{ comptePar[2] }}/100</button>
    <span v-if="gen === 2" class="muted" style="font-size:11.5px">
      Ne se tire jamais au travail : elle s’achète en arène, avec des pokédollars.
    </span>
  </div>

  <div class="toolbar">
    <label class="tray-search-wrap">
      <Search :size="14" aria-hidden="true" />
      <span class="sr-only">Chercher un Pokémon</span>
      <input
        class="tray-search" type="search" placeholder="Chercher un Pokémon" :value="query"
        @input="emit('set-query', $event.target.value)"
      >
    </label>
    <div class="filter-group">
      <button class="filter-chip" :class="{ active: statusFilter === 'all' }" @click="emit('set-status-filter', 'all')">Tous</button>
      <button class="filter-chip" :class="{ active: statusFilter === 'caught' }" @click="emit('set-status-filter', 'caught')">Capturés</button>
      <button class="filter-chip" :class="{ active: statusFilter === 'uncaught' }" @click="emit('set-status-filter', 'uncaught')">Manquants</button>
    </div>
    <span class="toolbar-sep" aria-hidden="true"></span>
    <div class="filter-group">
      <button
        v-for="t in TIERS" :key="t" class="filter-chip tier-chip"
        :class="{ active: activeTiers.has(t) }" :style="{ '--tier': TIER_VAR[t] }"
        :aria-pressed="activeTiers.has(t)" @click="emit('toggle-tier', t)"
      >{{ TIER_LABEL[t] }}</button>
    </div>
    <span class="toolbar-grow"></span>
    <button v-if="hasActiveFilters" class="filter-reset" @click="emit('reset-filters')">Réinitialiser</button>
    <button
      class="filter-chip chip-evo" :class="{ active: statusFilter === 'evolvable' }"
      title="Espèces qui ont de quoi évoluer maintenant vers une forme qui manque encore"
      @click="emit('set-status-filter', 'evolvable')"
    >Évoluables · {{ evolvableCount }}</button>
  </div>

  <div class="tray">
    <button
      v-for="id in visibleIds" :key="id" class="cell"
      :class="{
        has: bySpecies[id], ghost: !bySpecies[id], shiny: isShiny(shown(id)),
        legendary: bySpecies[id] && tierOf(id) === 'l',
        rare: bySpecies[id] && tierOf(id) === 'r',
      }"
      :style="{ '--tier': TIER_VAR[tierOf(id)] }"
      :disabled="!bySpecies[id]"
      @click="$emit('select', id)"
    >
      <span class="cell-no mono">{{ String(id).padStart(3, '0') }}</span>
      <span v-if="bySpecies[id]" class="cell-origin mono">
        {{ shown(id)[0].via === 'catch' ? shown(id)[0].source : 'évolué' }}
      </span>
      <span v-if="bySpecies[id] && PILL[tierOf(id)]" class="cell-pill" :class="tierOf(id)">{{ PILL[tierOf(id)] }}</span>
      <img
        :src="spriteUrl(id, isShiny(shown(id)))" :alt="DEX[id].name" loading="lazy"
        @error="$event.target.dataset.broken = '1'"
      >
      <span v-if="copyCount(id) > 1" class="cell-dupes mono">×{{ copyCount(id) }}</span>
      <!-- Des pictos plutôt que des halos : on repère le précieux en parcourant la grille, sans
           que la grille entière se mette à briller. -->
      <span class="cell-signs">
        <span v-if="evolvable.has(id)" class="cell-evo" title="Peut évoluer vers une forme manquante">
          <ChevronsUp :size="11" :stroke-width="2.5" aria-hidden="true" />
        </span>
        <span v-if="isShiny(shown(id))" class="cell-shiny" role="img" aria-label="shiny">
          <Sparkle :size="12" fill="currentColor" aria-hidden="true" />
        </span>
        <span v-if="bySpecies[id] && tierOf(id) === 'l'" class="cell-legend" role="img" aria-label="légendaire">
          <Gem :size="13" aria-hidden="true" />
        </span>
      </span>
    </button>
  </div>

  <p v-if="emptyLabel" class="tray-empty">
    {{ emptyLabel }}
    <button v-if="query.trim()" class="filter-reset" @click="emit('reset-filters')">Effacer les filtres</button>
  </p>
</template>
