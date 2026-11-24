<script setup>
import { computed, ref, watch } from 'vue'
import { Check, X } from '@lucide/vue'
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
const apercu = ref(false)

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
  if (!choisies.value.size) apercu.value = false
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
}

/** Le raccourci du groupe : tout son surplus, ou rien. Jamais le dernier exemplaire. */
function basculerGroupe(g) {
  const s = new Set(choisies.value)
  const cibles = g.items.filter((i) => !i.keeper)
  const toutPris = cibles.every((i) => s.has(i.key))
  for (const i of cibles) toutPris ? s.delete(i.key) : s.add(i.key)
  choisies.value = s
}

const prisDansGroupe = (g) => g.items.filter((i) => choisies.value.has(i.key)).length
const toutPris = (g) => g.items.filter((i) => !i.keeper).every((i) => choisies.value.has(i.key))

/** Ce qui part, groupé par espèce : le récapitulatif montré avant de confirmer. */
const lot = computed(() => props.groups
  .map((g) => {
    const items = g.items.filter((i) => choisies.value.has(i.key))
    return { ...g, items, sousTotal: items.reduce((n, i) => n + i.price, 0) }
  })
  .filter((g) => g.items.length))
const shiniesVendus = computed(() => lot.value.reduce((n, g) => n + g.items.filter((i) => i.shiny).length, 0))

function vider() {
  choisies.value = new Set()
  apercu.value = false
}

function vendre() {
  if (!nombre.value) return
  apercu.value = false
  emit('sell', [...choisies.value])
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`
</script>

<template>
  <section class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow">Revente</div>
        <h1 class="view-title">Revendre tes doublons</h1>
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
        <div class="eyebrow sect-h"><span>Tes doublons</span></div>
        <p class="muted">
          Clique sur les exemplaires à vendre. Tu en gardes toujours au moins un par espèce.
        </p>

        <div v-for="g in groups" :key="g.species" class="vendre-groupe">
          <div class="vendre-tete">
            <img
              class="vendre-mini" :src="spriteUrl(g.species, false)" :alt="g.name"
              :style="{ '--tier': TIER_VAR[g.tier] }" loading="lazy"
            >
            <span class="vendre-nom">
              <b>{{ g.name }}</b>
              <span class="muted">
                {{ pluriel(g.items.length, 'exemplaire') }}<template v-if="prisDansGroupe(g)">
                  · {{ prisDansGroupe(g) }} à vendre</template>
              </span>
            </span>
            <button class="btn-ghost vendre-tous" :disabled="busy" @click="basculerGroupe(g)">
              {{ toutPris(g) ? 'Tout retirer' : 'Tout le surplus' }}
            </button>
          </div>

          <div class="vendre-grille">
            <button
              v-for="i in g.items" :key="i.key" class="vendre-ex"
              :class="{ pris: choisies.has(i.key), bloque: bloque(g, i) }"
              :aria-pressed="choisies.has(i.key)"
              :disabled="busy || bloque(g, i)" @click="basculer(g, i)"
            >
              <span class="vendre-case" aria-hidden="true">
                <Check v-if="choisies.has(i.key)" :size="12" :stroke-width="3" />
              </span>
              <span class="vendre-niv">Niv. {{ i.level }}</span>
              <span v-if="i.shiny" class="vendre-tag mono">shiny</span>
              <span v-if="i.notable" class="vendre-tag mono">le meilleur</span>
              <span class="vendre-prix mono">{{ bloque(g, i) ? 'gardé' : `${i.price} ₽` }}</span>
            </button>
          </div>
          <p v-if="restants(g) <= 1" class="muted vendre-note">
            Il faut en garder un : sans exemplaire, l’espèce ne peut plus aller en arène ni
            évoluer. Son entrée au Pokédex, elle, reste acquise.
          </p>
        </div>
      </div>

      <div class="sect">
        <p class="muted" style="margin:0">
          Le prix suit le palier, le <b>niveau</b> et le <b>chromatique</b> : un exemplaire qui a
          gagné des duels se revend plus cher, un shiny quatre fois plus. Un commun ordinaire part
          pour le dixième d’une victoire de son palier ; un shiny au niveau maximum vaut la
          victoire entière. Mais une victoire se rejoue et garde le Pokémon, alors qu’une vente
          ne se fait qu’une fois.
        </p>
      </div>

      <div class="vendre-bar">
        <span class="vendre-bar-txt">
          <template v-if="nombre">
            <b>{{ pluriel(nombre, 'exemplaire') }}</b> · <span class="gold">{{ total }} ₽</span>
          </template>
          <span v-else class="muted">Aucun exemplaire choisi</span>
        </span>
        <button v-if="nombre" class="btn-ghost" :disabled="busy" @click="vider">Vider</button>
        <button class="btn-solid vendre-btn" :disabled="busy || !nombre" @click="apercu = true">
          Vérifier la vente
        </button>
      </div>
    </template>

    <div v-if="apercu" class="scrim" @click.self="apercu = false">
      <div class="panel vendre-apercu" role="dialog" aria-labelledby="vendre-apercu-titre">
        <button class="x" aria-label="Fermer" @click="apercu = false">
          <X :size="14" aria-hidden="true" />
        </button>
        <div class="eyebrow">Revente</div>
        <h2 id="vendre-apercu-titre" class="vendre-apercu-titre">
          Vendre {{ pluriel(nombre, 'exemplaire') }}&nbsp;?
        </h2>

        <ul class="vendre-recap">
          <li v-for="g in lot" :key="g.species">
            <img
              class="vendre-mini" :src="spriteUrl(g.species, false)" :alt="g.name"
              :style="{ '--tier': TIER_VAR[g.tier] }" loading="lazy"
            >
            <span class="vendre-recap-nom">
              <b>{{ g.name }} ×{{ g.items.length }}</b>
              <span class="vendre-recap-ex">
                <span v-for="i in g.items" :key="i.key" class="vendre-puce mono" :class="{ shiny: i.shiny }">
                  niv. {{ i.level }}{{ i.shiny ? ' · shiny' : '' }}
                </span>
              </span>
            </span>
            <span class="mono vendre-recap-prix">{{ g.sousTotal }} ₽</span>
          </li>
        </ul>

        <div class="vendre-recap-total">
          <span>Total</span><b class="gold">{{ total }} ₽</b>
        </div>
        <p class="muted">
          Ces exemplaires quittent ta collection pour de bon<template v-if="shiniesVendus">, dont
          <b>{{ pluriel(shiniesVendus, 'shiny') }}</b></template>. Les espèces restent au Pokédex et
          les bonbons restent acquis.
        </p>
        <div class="vendre-apercu-actions">
          <button class="btn-ghost" @click="apercu = false">Annuler</button>
          <button class="btn-solid vendre-confirmer" :disabled="busy" @click="vendre">
            Vendre pour {{ total }} ₽
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
