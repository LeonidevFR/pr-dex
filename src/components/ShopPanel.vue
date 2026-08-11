<script setup>
import AppIcon from './AppIcon.vue'

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
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(560px,100%)">
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
            class="evo-btn" :disabled="busy || pokedollars < a.price" @click="emit('buy', a.slug)"
          >{{ pokedollars < a.price ? `il manque ${a.price - pokedollars} ₽` : 'Acheter' }}</button>
        </div>
        <p class="muted" style="margin-top:10px">
          Le pli n’arrive pas à la seconde : il t’est dû, et il rejoint ta file d’ouverture au
          prochain passage de la collecte.
        </p>
      </div>
    </div>
  </div>
</template>
