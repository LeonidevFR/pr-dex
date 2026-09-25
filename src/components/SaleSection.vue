<script setup>
import { computed, ref, watch } from 'vue'
import { saleTotal } from '../lib/revente.js'
import { TIER_VAR } from '../../shared/species.js'
import { spriteUrl } from '../lib/sprites.js'

const props = defineProps({
  /** Le surplus, groupé par espèce — cf. `saleGroups`. */
  groups: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['sell'])

/**
 * Rien n'est coché au départ.
 *
 * Une sélection d'office ferait vendre par inadvertance ce que le joueur n'a pas regardé — et
 * ce qui part ne revient pas. Le raccourci reste à un clic par espèce (« Tous »), et la fiche
 * d'espèce porte le geste en un coup pour le tas qu'on a sous les yeux.
 */
const choisies = ref(new Set())
const ouverts = ref(new Set())
const aConfirmer = ref(false)

/**
 * Ce qui identifie le STOCK, et non l'objet qui le décrit.
 *
 * Le surplus est un `computed` qui reconstruit ses groupes à chaque évaluation : un `watch`
 * profond dessus se déclenchait à n'importe quel recalcul, même équivalent, et réappliquait la
 * sélection par défaut. On décochait deux exemplaires, la moindre relecture les recochait en
 * silence, et la vente emportait ce qu'on voulait garder — sans rien qui signale le retour en
 * arrière.
 */
const signature = computed(
  () => props.groups.flatMap((g) => g.items.map((i) => i.key)).sort().join('|'))

watch(signature, () => {
  const vivantes = new Set(props.groups.flatMap((g) => g.items.map((i) => i.key)))
  // On ne garde que ce qui existe encore, et on ne rajoute jamais rien : ni au premier rendu, où
  // la sélection part vide, ni quand le stock bouge — un exemplaire qui arrive pendant que le
  // joueur choisit n'a pas à se glisser dans sa vente.
  choisies.value = new Set([...choisies.value].filter((k) => vivantes.has(k)))
  aConfirmer.value = false
}, { immediate: true })

const total = computed(() => saleTotal(props.groups, choisies.value))
const nombre = computed(() => choisies.value.size)

const restants = (g) => g.items.filter((i) => !choisies.value.has(i.key)).length

/**
 * On ne vend pas son dernier exemplaire d'une espèce — le serveur le refuse, et il refuse le lot
 * ENTIER. Plutôt que de laisser composer une sélection vouée à l'échec, la dernière case libre
 * d'un groupe se verrouille : la règle s'apprend au doigt, sans message d'erreur.
 */
const bloque = (g, i) => !choisies.value.has(i.key) && restants(g) <= 1

function basculer(g, i) {
  if (bloque(g, i)) return
  const s = new Set(choisies.value)
  s.has(i.key) ? s.delete(i.key) : s.add(i.key)
  choisies.value = s
  aConfirmer.value = false
}

/** Le raccourci du groupe : tout son surplus, ou rien. Jamais le dernier exemplaire. */
function basculerGroupe(g) {
  const s = new Set(choisies.value)
  const cibles = g.items.filter((i) => !i.keeper)
  const toutPris = cibles.every((i) => s.has(i.key))
  for (const i of cibles) toutPris ? s.delete(i.key) : s.add(i.key)
  choisies.value = s
  aConfirmer.value = false
}

const prisDansGroupe = (g) => g.items.filter((i) => choisies.value.has(i.key)).length

function ouvrir(species) {
  const s = new Set(ouverts.value)
  s.has(species) ? s.delete(species) : s.add(species)
  ouverts.value = s
}

function vendre() {
  if (!nombre.value) return
  if (!aConfirmer.value) { aConfirmer.value = true; return }
  aConfirmer.value = false
  emit('sell', [...choisies.value])
}
</script>

<template>
  <section class="page">
    <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
      <div>
        <span class="panel-plate mono">REVENTE</span>
        <h2 class="panel-name" style="font-size:23px;margin-bottom:0">Exemplaires en trop</h2>
      </div>
    </div>

    <div v-if="!groups.length" class="sect">
      <p class="muted" style="margin:0">
        Rien en double pour l’instant. Un exemplaire seul ne se vend pas : c’est lui qui te permet
        encore de jouer l’espèce.
      </p>
    </div>

    <template v-else>
      <div class="sect">
        <div class="arena-head">
          <div>
            <div class="arena-big">{{ total }} ₽</div>
            <div class="arena-unit">
              pour {{ nombre }} exemplaire{{ nombre > 1 ? 's' : '' }}
            </div>
          </div>
          <button
            class="evo-btn vendre-btn" :class="{ confirming: aConfirmer }"
            :disabled="busy || !nombre" @click="vendre"
          >{{ aConfirmer ? `Confirmer — ${total} ₽` : 'Vendre la sélection' }}</button>
        </div>
        <p v-if="aConfirmer" class="muted" style="margin-top:10px">
          {{ nombre }} exemplaire{{ nombre > 1 ? 's quittent' : ' quitte' }} ta collection pour de
          bon. L’espèce et les bonbons restent acquis.
        </p>
        <p v-else class="muted" style="margin-top:10px">
          Rien n’est coché : c’est à toi de désigner ce qui part. <b>Tous</b> prend le surplus
          d’une espèce d’un coup, le chevron déplie le détail exemplaire par exemplaire. Il en
          reste toujours un, quoi qu’il arrive.
        </p>
      </div>

      <div class="sect">
        <div class="eyebrow sect-h"><span>Ce qui s’entasse</span></div>
        <div v-for="g in groups" :key="g.species" class="vendre-groupe">
          <div class="log-row vendre-tete">
            <img
              class="vendre-mini" :src="spriteUrl(g.species, false)" :alt="g.name"
              :style="{ '--tier': TIER_VAR[g.tier] }" loading="lazy"
            >
            <span class="log-title">
              {{ g.name }}
              <i class="mono vendre-compte">×{{ g.items.length }}</i>
            </span>
            <span class="log-sha mono">{{ prisDansGroupe(g) }} / {{ g.items.length - 1 }}</span>
            <button class="evo-btn" :disabled="busy" @click="basculerGroupe(g)">
              {{ g.items.filter((i) => !i.keeper).every((i) => choisies.has(i.key))
                ? 'Aucun' : 'Tous' }}
            </button>
            <button class="vendre-plier mono" :disabled="busy" @click="ouvrir(g.species)">
              {{ ouverts.has(g.species) ? '▾' : '▸' }}
            </button>
          </div>

          <div v-if="ouverts.has(g.species)" class="vendre-detail">
            <button
              v-for="i in g.items" :key="i.key" class="vendre-ligne"
              :class="{ pris: choisies.has(i.key), bloque: bloque(g, i) }"
              :disabled="busy || bloque(g, i)" @click="basculer(g, i)"
            >
              <span class="vendre-case mono">{{ choisies.has(i.key) ? '×' : '' }}</span>
              <span class="vendre-niv mono">niv. {{ i.level }}</span>
              <span v-if="i.shiny" class="vendre-tag mono">shiny</span>
              <span v-if="i.notable" class="vendre-tag mono">le meilleur</span>
              <span class="vendre-prix mono">{{ i.price }} ₽</span>
            </button>
            <p v-if="restants(g) <= 1" class="muted vendre-note">
              Il faut en garder un : sans exemplaire, l’espèce n’est plus jouable — ni arène, ni
              évolution. Son entrée au Pokédex, elle, reste acquise.
            </p>
          </div>
        </div>
      </div>

      <div class="sect">
        <p class="muted" style="margin:0">
          Le prix suit le palier et le <b>niveau</b> : un exemplaire qui a gagné des duels se
          revend plus cher. Vendre rapporte toujours bien moins que jouer — au mieux le quart
          d’une victoire du même palier.
        </p>
      </div>
    </template>
  </section>
</template>
