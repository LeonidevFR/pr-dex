<script setup>
import AppIcon from './AppIcon.vue'
import { ref } from 'vue'

defineProps({
  pokedollars: { type: Number, required: true },
  shop: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'buy'])

const ARTICLE = { c: 'commun', u: 'peu commun', r: 'rare', l: 'légendaire' }

/** Le nom dit ce qu'on obtient, pas la référence du catalogue : personne n'achète un `gen2-r-inedit`. */
const nomArticle = (a) =>
  `Pli ${ARTICLE[a.tier]}${a.gen === 2 ? ' · Gen 2' : ''}${a.fresh ? ' · inédit garanti' : ''}`

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
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(560px,100%)" @click="aConfirmer = null">
      <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
        <button class="x" @click="$emit('close')"><AppIcon name="close" :size="13" /></button>
        <div>
          <span class="panel-plate mono">BOUTIQUE</span>
          <h2 class="panel-name" style="font-size:23px;margin-bottom:0">Plis à acheter</h2>
        </div>
      </div>

      <div class="sect">
        <div class="arena-head">
          <div>
            <div class="arena-big">{{ pokedollars }} ₽</div>
            <div class="arena-unit">en caisse</div>
          </div>
        </div>
      </div>

      <div class="sect">
        <div class="eyebrow sect-h"><span>Ce que les pokédollars achètent</span></div>
        <p class="muted" style="margin-bottom:12px">
          Un pli acheté s’ouvre comme les autres, aux mêmes cotes — seul l’ensemble dans lequel
          il pioche est décidé d’avance. La <b>Gen 2</b> ne s’obtient que par ici ; l’<b>inédit
          garanti</b> ne tire que parmi les espèces qui te manquent encore.
        </p>
        <div v-for="a in shop" :key="a.slug" class="log-row">
          <span class="log-title">{{ nomArticle(a) }}</span>
          <span class="log-sha mono">{{ a.price }} ₽</span>
          <button
            class="evo-btn" :class="{ confirming: aConfirmer === a.slug }"
            :disabled="busy || pokedollars < a.price" @click.stop="cliquer(a)"
          >{{
            pokedollars < a.price ? `il manque ${a.price - pokedollars} ₽`
            : aConfirmer === a.slug ? `Confirmer — ${a.price} ₽` : 'Acheter'
          }}</button>
        </div>
        <p v-if="aConfirmer" class="muted" style="margin-top:10px">
          La dépense est définitive. Clique ailleurs pour renoncer.
        </p>
        <p class="muted" style="margin-top:10px">
          Le pli s’ouvre dès que la collecte le rapporte — dans la minute, en général. S’il
          tarde, il t’est dû : il rejoindra ta file d’ouverture au prochain passage.
        </p>
      </div>
    </div>
  </div>
</template>
