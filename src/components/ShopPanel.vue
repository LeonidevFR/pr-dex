<script setup>
import { ref } from 'vue'

defineProps({
  pokedollars: { type: Number, required: true },
  shop: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  /** L'onglet ouvert : `acheter`, ou `revente` dont le contenu arrive par le slot. */
  tab: { type: String, default: 'acheter' },
  /** Le nombre d'exemplaires en trop, affiché sur l'onglet Revendre. */
  saleCount: { type: Number, default: 0 },
})
const emit = defineEmits(['buy', 'tab'])
const ONGLETS = [['acheter', 'Acheter'], ['revente', 'Revendre']]

const ARTICLE = { c: 'commune', u: 'peu commune', r: 'rare', l: 'légendaire' }

/** Le nom dit ce qu'on obtient, pas la référence du catalogue : personne n'achète un `gen2-r-inedit`. */
const nomArticle = (a) =>
  `Carte ${ARTICLE[a.tier]}${a.gen === 2 ? ' · Gen 2' : ''}${a.fresh ? ' · inédite garantie' : ''}`

/**
 * Un achat se confirme. Un pli légendaire coûte plusieurs semaines de duels et la dépense est
 * définitive : un clic de travers ne doit pas la déclencher. Le second clic dit le prix, pour
 * qu'on confirme ce qu'on paie et pas seulement qu'on a cliqué.
 */
const aConfirmer = ref(null)

function cliquer(a) {
  if (aConfirmer.value !== a.slug) { aConfirmer.value = a.slug; return }
  aConfirmer.value = null
  emit('buy', a.slug)
}
</script>

<template>
  <section class="view" @click="aConfirmer = null">
    <div class="view-head">
      <div>
        <h1 class="view-title">Boutique</h1>
      </div>
      <div class="view-totals">
        <div>
          <div class="eyebrow">En caisse</div>
          <div class="view-num gold">{{ pokedollars }} ₽</div>
        </div>
      </div>
    </div>

  <!-- On gagne et on dépense les pokédollars au même endroit : la caisse reste en tête, les
       deux usages se partagent la page en onglets. -->
  <div class="onglets" role="tablist">
    <button
      v-for="[cle, label] in ONGLETS" :key="cle" class="onglet" role="tab"
      :class="{ active: tab === cle }" :aria-selected="tab === cle" @click="emit('tab', cle)"
    >
      {{ label }}<span v-if="cle === 'revente' && saleCount" class="onglet-compte mono">{{ saleCount }}</span>
    </button>
  </div>

  <slot v-if="tab === 'revente'" />
  <div v-else class="sect">
    <div class="eyebrow sect-h"><span>Articles</span></div>
    <p class="muted" style="margin-bottom:12px">
      Une carte achetée se découvre comme les autres, aux mêmes cotes. Seul l’ensemble dans lequel
      elle est tirée est fixé d’avance. L’<b>inédit garanti</b> ne tire que parmi les espèces qui te manquent encore.
    </p>
    <div class="board-stats shop-list">
      <div v-for="a in shop" :key="a.slug">
        <dt>{{ nomArticle(a) }}</dt>
        <dd class="stat-value">
          <span class="shop-prix">{{ a.price }} ₽</span>
          <button
            class="evo-btn" :class="{ confirming: aConfirmer === a.slug }"
            :disabled="busy || pokedollars < a.price" @click.stop="cliquer(a)"
          >{{
            pokedollars < a.price ? `il manque ${a.price - pokedollars} ₽`
            : aConfirmer === a.slug ? `Confirmer · ${a.price} ₽` : 'Acheter'
          }}</button>
        </dd>
      </div>
    </div>
    <p v-if="aConfirmer" class="muted" style="margin-top:10px">
      La dépense est définitive. Clique ailleurs pour renoncer.
    </p>
    <p class="muted" style="margin-top:10px">
      La carte s’ouvre dès que la collecte la rapporte, en général dans la minute. Si elle
      tarde, elle t’est due : elle rejoindra ta file d’ouverture au prochain passage.
    </p>
  </div>
  </section>
</template>
