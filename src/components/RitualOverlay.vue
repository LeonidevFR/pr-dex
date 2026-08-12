<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import PokeCard from './PokeCard.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  remaining: { type: Number, required: true },
  // Lu par App.vue avant le `claim` — celui-ci inscrit l'espèce au dex dès le sceau brisé.
  isNew: { type: Boolean, default: false },
})
const emit = defineEmits(['claim', 'next', 'skip-all', 'close'])

/**
 * La scène du rituel, portée telle qu'elle a été validée en maquette.
 *
 * Un seul disque de rayons, masqué en anneau, sur un fond noir plein avec vignette. Il y a
 * eu ici un système à trois à six couches coniques colorées, tournant à des vitesses
 * décorrélées : plus riche sur le papier, mais masqué au centre et plafonné à 0,10 d'opacité
 * en commun, donc invisible en pratique. Un disque unique et franc se lit.
 *
 * La vitesse n'est PAS un levier d'intensité. Elle l'a été — 3,2 s en rare, 1,8 s en
 * légendaire — ce qui produisait un clignotement pénible sur la seule scène du jeu qu'on ne
 * peut ni sauter ni désactiver. Un tour lent lit « ça rayonne » ; un tour rapide stroboscope.
 * L'écart entre paliers se joue donc sur l'opacité, la finesse des rayons et le halo.
 */
const SCENE = {
  c: { ray: 'rgba(160,150,135,.5)',  rayop: 0.18, wedge: '10deg', rayspeed: '26s', glow: '8px'  },
  u: { ray: 'rgba(120,160,110,.55)', rayop: 0.30, wedge: '10deg', rayspeed: '22s', glow: '16px' },
  r: { ray: 'rgba(214,120,80,.65)',  rayop: 0.66, wedge: '7deg',  rayspeed: '18s', glow: '38px' },
  l: { ray: 'rgba(255,196,90,.7)',   rayop: 0.90, wedge: '5deg',  rayspeed: '14s', glow: '60px' },
}

const stage = ref('awaiting') // awaiting → revealed : la carte attend, le joueur la retourne

const species = computed(() => DEX[props.entry.species])
const tier = computed(() => species.value.tier)
/**
 * Tant que la carte est retournée, la scène ne doit RIEN dire du palier — sinon on lit la
 * réponse dans les rayons avant de retourner la carte, et le geste ne sert plus à rien.
 * Elle reste donc neutre, et ne prend les couleurs du palier qu'à la révélation. Le flash
 * couvre la bascule.
 */
const NEUTRE = { ray: 'rgba(150,138,118,.45)', rayop: 0.16, wedge: '12deg', rayspeed: '24s', glow: '10px' }
const scene = computed(() => (stage.value === 'revealed' ? SCENE[tier.value] : NEUTRE))

/**
 * La fanfare EST le palier.
 *
 * Un collègue voulait des explosions partout ; il a raison sur les deux pour cent de tirages
 * qui les méritent, et tort sur les autres. Si chaque commun explose, l'explosion du
 * légendaire ne signifie plus rien — on détruit le signal qu'on cherchait à amplifier. Et ces
 * plis s'ouvrent quelques centaines de fois par an, sans possibilité de les sauter : ce qui
 * est jouissif au troisième tirage est une taxe au cinquantième.
 *
 * Donc : on ne monte pas le plancher, on monte le plafond. Un commun ne reçoit rien du tout.
 */
const FANFARE = {
  c: { flash: 0, sparks: 0, rings: 0, shake: 0 },
  u: { flash: 1.6, sparks: 7, rings: 0, shake: 0 },
  r: { flash: 4.2, sparks: 20, rings: 1, shake: 1.6 },
  l: { flash: 6.5, sparks: 34, rings: 3, shake: 3 },
}
// Dosage retenu après essais sur maquette. Il module la courbe, il ne l'aplatit jamais :
// un commun reste muet quel que soit le réglage.
const PUNCH = 1.7

/**
 * Un chromatique sort environ une fois sur cent vingt-huit, quel que soit le palier. Le laisser
 * muet parce qu'il est tombé sur un commun reviendrait à taire la seule chose vraiment rare de
 * la soirée. Il relève donc le plancher de la fanfare au niveau du rare — sans jamais dépasser
 * ce que son palier vaut déjà, si celui-ci est plus haut.
 */
const fanfare = computed(() => {
  const palier = props.entry.shiny && (tier.value === 'c' || tier.value === 'u') ? 'r' : tier.value
  return FANFARE[palier]
})
const loud = computed(() => stage.value === 'revealed' && fanfare.value.flash > 0)

// Positions dérivées de l'index, jamais tirées au hasard : deux tirages du même palier
// produisent la même salve. C'est un décor, il n'a pas à varier.
const fxSparks = computed(() => {
  const n = Math.round(fanfare.value.sparks * PUNCH)
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.21
    const distance = 120 + (i % 5) * 46
    return {
      '--dx': (Math.cos(angle) * distance).toFixed(1) + 'px',
      '--dy': (Math.sin(angle) * distance).toFixed(1) + 'px',
      '--sd': (0.85 + (i % 4) * 0.22).toFixed(2) + 's',
    }
  })
})

const fxRings = computed(() =>
  Array.from({ length: Math.round(fanfare.value.rings * PUNCH) }, (_, i) => ({
    animationDelay: i * 0.17 + 's',
  })),
)

const style = computed(() => ({
  '--tier': TIER_VAR[tier.value],
  '--ray': scene.value.ray,
  '--rayop': scene.value.rayop,
  '--wedge': scene.value.wedge,
  '--glow': scene.value.glow,
  // Le flash n'appartient pas à la scène mais à la fanfare : c'est elle qui dose la
  // récompense, et elle est nulle en commun là où la scène garde des rayons.
  '--flashscale': (fanfare.value.flash * PUNCH).toFixed(2),
  '--shake': (fanfare.value.shake * PUNCH).toFixed(2),
  '--rayspeed': scene.value.rayspeed,
}))

/**
 * La cérémonie tient en un geste : la carte est là, dos visible, et on la retourne.
 *
 * Il y a eu ici une ouverture de pli complète — sceau, entaille, bandeau qui se soulève,
 * corps qui tombe — puis un retournement automatique au bout de quatre secondes. Deux
 * cérémonies pour une seule information, sur une scène qui se rejoue quelques centaines de
 * fois par an : à la troisième ouverture on attend déjà que ça passe. Le pli disait la PR,
 * mais le dos de la carte la dit aussi, et mieux — il reste avec la carte.
 *
 * Il n'y a donc plus d'attente subie du tout : rien ne se déclenche sans le joueur.
 */
function reveal() {
  if (stage.value !== 'awaiting') return
  stage.value = 'revealed'
  // Émis avant que l'écriture ne soit confirmée : la révélation est une animation, pas une
  // preuve d'écriture. Si `claim` échoue, `state.claimed` n'est jamais mis à jour et le pli
  // reste dans `pending` — il réapparaît à la prochaine ouverture. C'est le comportement
  // voulu : ne pas avaler l'échec en gardant la révélation silencieuse sur son sort réel.
  emit('claim', props.entry.key)
}

const nextEl = ref(null)
const cardEl = ref(null)

/**
 * Le focus part sur l'action de l'étape courante, et Espace agit alors dessus. Cela corrige
 * au passage un vrai trou d'accessibilité : sans ça, le focus reste sur le bouton « Ouvrir »
 * de TheRail, DERRIÈRE l'overlay.
 *
 * La carte porte l'action tant qu'elle n'est pas retournée ; le bouton « Suivant » la porte
 * ensuite. Le focus initial passe par `onMounted` plutôt que par un `watch` en `immediate` :
 * ce dernier s'exécute pendant le `setup`, avant que la référence de template ne soit posée.
 */
onMounted(() => cardEl.value?.$el?.focus())
watch(stage, async (s) => {
  await nextTick()
  if (s === 'revealed') nextEl.value?.focus()
})
</script>

<template>
  <div
    class="ritual"
    :class="{ leg: stage === 'revealed' && tier === 'l', shaking: loud && fanfare.shake > 0 }"
    :style="style"
  >
    <button
      class="x ritual-close" aria-label="Revenir à la planche, garder les plis restants pour plus tard"
      @click="$emit('close')"
    >✕</button>

    <div class="vignette"></div>

    <div class="reveal" :class="stage">
      <!-- Les rayons appartiennent à la carte, pas à l'écran : centrés sur la fenêtre, leur
           foyer tombait sous la carte, décalée vers le haut par le nom, les chips et le
           bouton qui vivent en dessous. -->
      <div class="rays"></div>
      <div v-if="loud" class="flash"></div>
      <span v-for="(r, i) in (loud ? fxRings : [])" :key="'r' + i" class="fx-ring" :style="r"></span>
      <div class="pkc-stage">
        <PokeCard
          ref="cardEl"
          :species-id="entry.species" :tier="tier" :shiny="entry.shiny"
          :provenance="{ ref: entry.ref, label: entry.label, date: entry.date }"
          :flipped="stage === 'awaiting'" scene="night"
          @activate="reveal"
        />
      </div>
      <span v-for="(s, i) in (loud ? fxSparks : [])" :key="'s' + i" class="fx-spark" :style="s"></span>
    </div>

    <!-- Plus de décompte : rien ne se déclenche sans le joueur, il n'y a donc plus de
         temps à lui annoncer. Reste l'indice, parce qu'une carte posée là ne dit pas
         d'elle-même qu'on peut la retourner. -->
    <div v-if="stage === 'awaiting'" class="reveal-hint">
      <span>Cliquer pour retourner</span>
    </div>

    <template v-if="stage === 'revealed'">
      <div class="reveal-meta">
        <div v-if="entry.shiny" class="reveal-banner">✦ Chromatique ✦</div>
        <div v-else-if="tier === 'l'" class="reveal-banner">★ Légendaire ★</div>
        <div class="reveal-name">{{ species.name }}</div>
        <div class="reveal-tags">
          <span v-if="isNew" class="chip new-chip">Nouveau</span>
          <span class="chip">{{ TIER_LABEL[tier] }}</span>
          <span v-if="entry.shiny" class="chip shiny-chip">✦ Chromatique</span>
        </div>
        <div class="reveal-note mono">
          {{ isNew ? 'Première entrée à la planche' : 'Déjà à la planche' }} ·
          +{{ CANDY_PER_CATCH }} bonbons <b>{{ DEX[familyOf(entry.species)].name }}</b>
        </div>
      </div>
      <button ref="nextEl" class="next-btn" @click="$emit('next')">
        {{ remaining > 1 ? `Suivant · ${remaining - 1} restant${remaining - 1 > 1 ? 's' : ''}` : 'Retour à la planche' }}
      </button>
      <button
        v-if="remaining > 1" class="queue-note"
        style="background:none;border:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px"
        @click="$emit('skip-all')"
      >
        tout ouvrir sans cérémonie
      </button>
    </template>
  </div>
</template>
