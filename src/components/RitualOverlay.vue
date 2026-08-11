<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { DEX, TIER_LABEL, TIER_VAR, RAY_PALETTE, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import PokeCard from './PokeCard.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  remaining: { type: Number, required: true },
  // Lu par App.vue avant le `claim` — celui-ci inscrit l'espèce au dex dès le sceau brisé.
  isNew: { type: Boolean, default: false },
})
const emit = defineEmits(['claim', 'next', 'skip-all', 'close'])

/**
 * Quatre crans, durée quasi constante : le rituel se rejoue ~300 fois par an. L'écart
 * entre un commun et un légendaire passe par l'intensité (rayons, halo, flash), pas par
 * une attente plus longue — sinon on cherche à le sauter au bout d'une semaine.
 *
 * La vitesse de rotation ne fait PAS partie de ces leviers. Elle l'a été : un rare tournait
 * en 3,2 s et un légendaire en 1,8 s, ce qui produisait un clignotement franchement pénible
 * sur la seule scène qu'on ne peut pas éviter. Un tour lent lit « ça rayonne » ; un tour
 * rapide lit « ça stroboscope ». L'écart entre paliers se joue donc en dessous.
 */
const INTENSITY = {
  c: { rayop: 0.10, glow: '8px', rayspeed: '26s' },
  u: { rayop: 0.18, glow: '16px', rayspeed: '22s' },
  r: { rayop: 0.42, glow: '38px', rayspeed: '18s' },
  l: { rayop: 0.65, glow: '66px', rayspeed: '14s' },
}

const RAY_LAYER_COUNT = { c: 3, u: 4, r: 5, l: 6 }
const MULTICOLOR_TIERS = new Set(['r', 'l'])
// Vitesses et pas de wedge décorrélés de l'index pour éviter que les couches se superposent
// à l'identique (lisible comme "un seul disque plus épais" plutôt que plusieurs rayons).
const SPEED_MULTIPLIERS = [1, 0.8, 1.3, 0.65, 1.15, 0.9]

const rayLayers = computed(() => {
  const count = RAY_LAYER_COUNT[tier.value]
  const multicolor = MULTICOLOR_TIERS.has(tier.value)
  const baseColor = TIER_VAR[tier.value]
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    color: multicolor ? RAY_PALETTE[i % RAY_PALETTE.length] : baseColor,
    direction: i % 2 === 0 ? 'normal' : 'reverse',
    speedMultiplier: SPEED_MULTIPLIERS[i % SPEED_MULTIPLIERS.length],
    wedgeDeg: Math.max(20 - i * 2.5, 6),
    opacityFactor: Math.max(1 - i * 0.12, 0.4),
    fromDeg: (i * 360) / count,
  }))
})

function rayLayerStyle(layer) {
  return {
    '--ray-color': layer.color,
    '--ray-wedge': layer.wedgeDeg + 'deg',
    '--ray-opacity-factor': layer.opacityFactor,
    '--ray-from': layer.fromDeg + 'deg',
    animationDuration: `calc(var(--rayspeed) * ${layer.speedMultiplier}), .8s`,
    animationDirection: `${layer.direction}, normal`,
  }
}

const stage = ref('sealed') // sealed → cutting → awaiting → revealed
const timers = []

const species = computed(() => DEX[props.entry.species])
const tier = computed(() => species.value.tier)
const intensity = computed(() => INTENSITY[tier.value])

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
  ...(stage.value !== 'sealed'
    ? {
        '--rayop': intensity.value.rayop,
        '--glow': intensity.value.glow,
        // Le flash n'obéit plus à `INTENSITY` mais à la fanfare : c'est elle qui dose la
        // récompense, et elle est nulle en commun là où `INTENSITY` gardait un flash.
        '--flashscale': (fanfare.value.flash * PUNCH).toFixed(2),
        '--shake': (fanfare.value.shake * PUNCH).toFixed(2),
        '--rayspeed': intensity.value.rayspeed,
      }
    : {}),
}))

/**
 * L'entaille court sur la pliure du haut (0,42 s), puis le bandeau se soulève et part
 * (0,34 s) : le pli n'a pas cédé avant. C'est ce qui donne son épaisseur au geste — on
 * ouvre quelque chose, on ne fait pas disparaître un rectangle.
 */
const CUT_MS = 760

/**
 * Le bord laissé par la coupe. Une dentelure parfaitement régulière se lit comme un cranté
 * de machine, pas comme un pli ouvert à la main : les profondeurs et les décalages sont donc
 * inégaux. Mais en suite fixe, jamais tirés au hasard — deux ouvertures doivent produire le
 * même bord, sinon le pli n'est plus un objet, il est une variation.
 */
const TORN = (() => {
  const profondeurs = [8, 5.5, 9, 6.5, 7.5, 5, 8.5, 6]
  const decalages = [0, 0.9, -0.6, 1.2, -0.4, 0.7, -1, 0.5]
  const dents = 26
  const points = []
  for (let i = 0; i <= dents; i++) {
    const brut = (i / dents) * 100 + (i > 0 && i < dents ? decalages[i % decalages.length] : 0)
    const x = Math.min(Math.max(brut, 0), 100).toFixed(2)
    points.push(`${x}% ${i % 2 ? profondeurs[i % profondeurs.length] : 0}px`)
  }
  return `polygon(${points.join(',')},100% 100%,0 100%)`
})()

// Le pli cède, puis la carte entre — dos visible.
const CARD_AT = 1180

/**
 * Le filet, pour qui a posé son téléphone — pas pour qui attend. L'ancienne silhouette tenait
 * 2,2 s (2,8 s en légendaire) sans que le joueur puisse rien y faire ; ici il retourne quand
 * il veut, et l'automatique n'intervient que s'il ne fait rien.
 */
const AUTO_REVEAL_MS = 4000
let autoTimer = null

function tear() {
  stage.value = 'cutting'
  // Émis avant que l'écriture ne soit confirmée : la révélation est une animation, pas une
  // preuve d'écriture. Si `claim` échoue, `state.claimed` n'est jamais mis à jour et le pli
  // reste dans `pending` — il réapparaît à la prochaine ouverture. C'est le comportement
  // voulu : ne pas avaler l'échec en gardant la révélation silencieuse sur son sort réel.
  emit('claim', props.entry.key)
  timers.push(setTimeout(() => {
    stage.value = 'awaiting'
    autoTimer = setTimeout(reveal, AUTO_REVEAL_MS)
  }, CARD_AT))
}

function reveal() {
  // Le clic du joueur et le minuteur mènent tous deux ici : sans ce garde, celui qui reste
  // rejouerait la révélation par-dessus une carte déjà retournée.
  if (stage.value !== 'awaiting') return
  clearTimeout(autoTimer)
  stage.value = 'revealed'
}

onUnmounted(() => {
  timers.forEach(clearTimeout)
  clearTimeout(autoTimer)
})

const packetEl = ref(null)
const nextEl = ref(null)
const cardEl = ref(null)

/**
 * Le focus part sur l'action principale de l'étape courante, et Espace agit alors nativement.
 * Cela corrige au passage un vrai trou d'accessibilité : sans ça, le focus reste sur le bouton
 * « Ouvrir » de TheRail, DERRIÈRE l'overlay.
 *
 * L'étape `awaiting` focalise la carte. C'est un renversement par rapport à l'ancienne
 * silhouette, qui ne focalisait rien parce qu'elle imposait une attente : la carte, elle,
 * porte l'action — la retourner. La laisser hors du focus reviendrait à réserver le geste
 * à la souris.
 *
 * Le focus initial passe par `onMounted` plutôt que par un `watch` en `immediate` : ce dernier
 * s'exécute pendant le `setup`, avant que la référence de template ne soit renseignée.
 */
onMounted(() => packetEl.value?.focus())
watch(stage, async (s) => {
  await nextTick()
  if (s === 'awaiting') cardEl.value?.$el?.focus()
  if (s === 'revealed') nextEl.value?.focus()
})
</script>

<template>
  <div
    class="ritual"
    :class="{ opened: stage !== 'sealed', leg: stage !== 'sealed' && tier === 'l', shaking: loud && fanfare.shake > 0 }"
    :style="style"
  >
    <button
      class="x ritual-close" aria-label="Revenir à la planche, garder les plis restants pour plus tard"
      @click="$emit('close')"
    >✕</button>

    <template v-if="stage === 'sealed' || stage === 'cutting'">
      <div class="stack">
        <div v-if="remaining > 2" class="ghost-pkt g1"></div>
        <div v-if="remaining > 1" class="ghost-pkt g2"></div>
        <button
          ref="packetEl" class="packet" :class="{ cutting: stage === 'cutting' }"
          :disabled="stage === 'cutting'" @click="tear"
        >
          <span class="pkt-flap"><span class="pkt-kicker">Pli scellé · {{ entry.date }}</span></span>
          <span class="pkt-cut"></span>
          <div class="pkt-body" :style="stage === 'cutting' ? { clipPath: TORN } : null">
            <div class="pkt-seal">✳</div>
            <div class="pkt-title">{{ entry.label }}</div>
            <div v-if="entry.ref" class="pkt-pr mono">{{ entry.ref }}</div>
            <div class="pkt-foot">Briser le sceau</div>
          </div>
        </button>
      </div>
      <div v-if="stage === 'sealed'" class="queue-note">{{ remaining > 1 ? remaining + ' plis en attente' : 'dernier pli' }}</div>
    </template>

    <template v-else>
      <div class="reveal" :class="stage">
        <div
          v-for="layer in rayLayers" :key="layer.key" class="ray-layer"
          :style="rayLayerStyle(layer)"
        ></div>
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

      <!-- Le décompte rend l'automatique prévisible : on voit le temps venir, donc on choisit
           de le devancer ou de le laisser filer. Sans lui, le retournement seul surprendrait. -->
      <div v-if="stage === 'awaiting'" class="reveal-hint">
        <span>Cliquer pour retourner</span>
        <span class="hint-bar"><i></i></span>
      </div>

      <div v-if="stage === 'silhouette'" class="dev-note mono">
        {{ entry.shiny ? 'quelque chose scintille…' : 'révélation en cours…' }}
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
    </template>
  </div>
</template>
