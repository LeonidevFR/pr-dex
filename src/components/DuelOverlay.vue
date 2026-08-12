<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PokeCard from './PokeCard.vue'
import { DEX, TIER_LABEL, TIER_VAR } from '../../shared/species.js'
import { FORMS, TIER_POWER, levelFactor } from '../../shared/battle.js'
import { REWARD, COMPUTER_REWARD } from '../../shared/arena-economy.js'
import { STATS } from '../../shared/species-stats.js'

const props = defineProps({
  duel: { type: Object, required: true },
  userId: { type: String, required: true },
})
defineEmits(['close'])

/**
 * La cérémonie, en quatre temps dans les mêmes 2,2 s qu'occupaient trois points clignotants.
 *
 * Ce n'est pas une décoration ajoutée : c'est le seul endroit de l'application où un exemplaire
 * cesse d'exister, et il avait moins d'égards qu'un pli commun qu'on ouvre. Le rituel a sa
 * carte, ses rayons et son blanchiment ; le duel n'avait qu'un verdict qui grossissait de 18 %.
 *
 *   scellé  → les deux mises sont des cartes face cachée, dont le cachet respire
 *   révélé  → elles se retournent EN MÊME TEMPS : c'est la règle du jeu, elle se voit
 *   mesuré  → la balance s'ouvre, chacun voit ce qu'il pesait
 *   verdict → éclat, le perdant s'éteint, le vainqueur s'auréole
 *
 * Le temps de mesure est le plus long des quatre, et ce n'est pas un réglage de confort : la
 * balance met 0,9 s à se remplir, et un verdict qui tombe pendant qu'elle bouge encore arrive
 * sur quelqu'un qui n'a rien lu. Il faut d'abord SAVOIR ce qu'on pesait pour que l'issue veuille
 * dire quelque chose — 1,65 s laissent les barres finir leur course, puis un temps d'arrêt.
 *
 * Les durées de mouvement sont celles du rituel — retournement 0,62 s, éclat 0,62 s — pour que
 * deux cérémonies de la même application battent au même rythme.
 */
const ETAPES = [['revele', 900], ['mesure', 1750], ['verdict', 3400]]
const stage = ref('scelle')
const minuteries = []
onMounted(() => {
  for (const [etat, quand] of ETAPES) minuteries.push(setTimeout(() => { stage.value = etat }, quand))
})
onUnmounted(() => minuteries.forEach(clearTimeout))

/** Vrai dès que les cartes sont retournées : tout ce qui suit s'empile sans jamais revenir en arrière. */
const apres = (etat) => ['scelle', 'revele', 'mesure', 'verdict'].indexOf(stage.value)
  >= ['scelle', 'revele', 'mesure', 'verdict'].indexOf(etat)

/** Je suis le challengeur ou le preneur : tout l'affichage se lit depuis ce côté-là. */
const iAmChallenger = computed(() => props.duel.challenger_id === props.userId)

const side = (mine) => {
  const c = iAmChallenger.value === mine
  return {
    species: c ? props.duel.challenger_species : props.duel.opponent_species,
    level: c ? props.duel.challenger_level : props.duel.opponent_level,
    form: c ? props.duel.challenger_form : props.duel.opponent_form,
    power: Number(c ? props.duel.challenger_power : props.duel.opponent_power),
  }
}

const mine = computed(() => side(true))
const theirs = computed(() => side(false))

const versusComputer = computed(() => props.duel.status === 'computer')

const iWon = computed(() => props.duel.winner_id === props.userId)

/** La probabilité est stockée pour le camp challengeur : vue de l'autre côté, elle se retourne. */
const myOdds = computed(() => {
  const p = Number(props.duel.probability)
  return Math.round((iAmChallenger.value ? p : 1 - p) * 100)
})

/**
 * Ce que le duel rapporte, au palier de l'enjeu. Affiché en toutes lettres plutôt que laissé à
 * deviner : un gain qu'on ne voit pas est un gain qui n'existe pas pour le joueur.
 */
const reward = computed(() => {
  const t = props.duel.stake_tier
  if (versusComputer.value) return { dollars: Math.round(COMPUTER_REWARD[t]), points: 0, pack: false }
  return { dollars: REWARD[t].dollars, points: REWARD[t].points, pack: true }
})

const tierOf = (species) => DEX[species]?.tier ?? 'c'
const nameOf = (species) => DEX[species]?.name ?? '—'
const formName = (i) => FORMS[i]?.name ?? '—'

/**
 * Le détail du calcul, pour que le résultat se vérifie au lieu de se croire. Une issue
 * probabiliste sans explication passe pour arbitraire — surtout quand elle vient de détruire un
 * Pokémon qu'on a mis des semaines à obtenir.
 */
const breakdown = (s) => [
  ['stats de base', STATS[s.species]],
  [TIER_LABEL[tierOf(s.species)].toLowerCase(), `×${TIER_POWER[tierOf(s.species)].toFixed(2)}`],
  [`niveau ${s.level}`, `×${levelFactor(s.level).toFixed(2)}`],
  [formName(s.form).toLowerCase(), `×${FORMS[s.form]?.factor.toFixed(2)}`],
]
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <div class="panel" style="width:min(560px,100%)">
      <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
        <button class="x" @click="$emit('close')">✕</button>
        <div>
          <span class="panel-plate mono">DUEL</span>
          <h2 class="panel-name" style="font-size:23px;margin-bottom:0">
            {{ versusComputer ? 'Contre l’ordinateur' : 'Contre un dresseur' }}
          </h2>
        </div>
      </div>

      <!--
        La scène. Elle occupe la largeur du panneau et bascule dans la nuit : une cérémonie
        éteint la salle, comme celle du rituel. Le reste du panneau reste le carnet.
      -->
      <div class="duel-scene" :data-etat="stage" :style="{ '--t': TIER_VAR[duel.stake_tier] }">
        <div class="duel-eclat" aria-hidden="true"></div>

        <div class="duel-camps">
          <div
            v-for="camp in [
              { cle: 'moi', mon: mine, qui: 'ta mise', gagne: iWon },
              { cle: 'lui', mon: theirs, qui: versusComputer ? 'l’ordinateur' : 'sa mise', gagne: !iWon },
            ]"
            :key="camp.cle" class="duel-camp"
            :class="{
              gagne: stage === 'verdict' && camp.gagne,
              perd: stage === 'verdict' && !camp.gagne,
              rien: stage === 'verdict' && versusComputer && !camp.gagne && camp.cle === 'lui',
            }"
          >
            <div class="duel-slot">
              <div class="duel-flip" :class="{ dos: !apres('revele') }">
                <!-- Le dos : le cachet de cire du palier de la mise, qui respire tant qu'il tient. -->
                <div class="duel-dos"><span class="duel-cire">PR</span></div>
                <div class="duel-front" :aria-hidden="apres('revele') ? null : 'true'">
                  <PokeCard
                    :species-id="camp.mon.species" :tier="tierOf(camp.mon.species)"
                    scene="night" :tiltable="false"
                  />
                </div>
              </div>
              <span v-for="i in 7" :key="'c' + i" class="duel-cendre" :style="`--i:${i}`"></span>
            </div>
            <div class="duel-nom">
              <b>{{ apres('revele') ? nameOf(camp.mon.species) : '—' }}</b>
              <span v-if="apres('revele')" class="mono">niv. {{ camp.mon.level }}</span>
              <span v-else class="mono">{{ camp.qui }} · scellée</span>
            </div>
          </div>
        </div>

        <!--
          La balance porte les CHANCES, pas le rapport des puissances. Elle affichait d'abord le
          second : une barre au quart sous une étiquette disant « 6 % » est une contradiction que
          l'œil voit avant que le texte ne s'explique. Les deux nombres sont vrais mais ne
          coïncident pas — la puissance entre au cube et le résultat est borné à 5 %, si bien
          qu'un écart modeste peut valoir une chance minuscule.

          Un objet, une grandeur : la barre dit ce qui a décidé du duel, et c'est elle que le
          tirage a franchie. Les puissances restent en chiffres à chaque bout, où elles
          expliquent d'où viennent ces chances sans prétendre les mesurer.
        -->
        <div class="duel-balance" :class="{ vu: apres('mesure') }">
          <div class="duel-piste">
            <i class="moi" :style="{ width: myOdds + '%' }"></i>
            <i class="lui" :style="{ width: (100 - myOdds) + '%' }"></i>
          </div>
          <div class="duel-cotes mono">
            <span :title="`ta puissance : ${Math.round(mine.power)}`">{{ Math.round(mine.power) }}</span>
            <span class="duel-chances">{{ myOdds }} % de chances pour toi</span>
            <span :title="`sa puissance : ${Math.round(theirs.power)}`">{{ Math.round(theirs.power) }}</span>
          </div>
        </div>

        <p class="duel-annonce" :class="{ vif: stage === 'verdict' }">
          <template v-if="stage === 'scelle'">Les deux mises sont scellées</template>
          <template v-else-if="stage === 'revele'">Révélation simultanée</template>
          <template v-else-if="stage === 'mesure'">On mesure</template>
          <template v-else>{{ iWon ? 'Tu l’emportes' : 'Tu perds' }}</template>
        </p>
      </div>

      <template v-if="stage === 'verdict'">
        <div class="sect">
          <div
            class="arena-verdict" :class="iWon ? 'won' : 'lost'"
            :style="{ '--t': TIER_VAR[duel.stake_tier] }"
          >{{ iWon ? 'Victoire' : 'Défaite' }}</div>
          <p class="muted" style="margin-top:8px">
            <template v-if="versusComputer">
              L’ordinateur ne possède rien : personne ne perd de Pokémon, et il n’y a pas de pli
              à gagner — seulement des pokédollars, au cinquième du tarif.
            </template>
            <template v-else-if="iWon">
              Son exemplaire est détruit. Tu gardes le tien, il gagne un niveau, et un pli
              {{ TIER_LABEL[duel.stake_tier].toLowerCase() }} t’attend au prochain passage.
            </template>
            <template v-else>
              Ton exemplaire est détruit. L’espèce reste à la planche — c’est l’exemplaire qui
              disparaît, pas ce que tu as vu.
            </template>
          </p>
        </div>

        <div v-if="iWon" class="sect">
          <div class="eyebrow sect-h"><span>Ce que tu remportes</span></div>
          <div class="arena-reward">
            <div>
              <span class="v">{{ reward.dollars }} ₽</span>
              <span class="arena-unit">gagnés</span>
            </div>
            <div v-if="reward.points">
              <span class="v">{{ reward.points }}</span>
              <span class="arena-unit">points de saison</span>
            </div>
            <div v-if="reward.pack">
              <span class="v">1</span>
              <span class="arena-unit">pli {{ TIER_LABEL[duel.stake_tier].toLowerCase() }}</span>
            </div>
          </div>
        </div>

        <div class="sect">
          <div class="eyebrow sect-h">
            <span>Enjeu du duel</span>
            <span class="chip" :style="{ '--t': TIER_VAR[duel.stake_tier] }">
              {{ TIER_LABEL[duel.stake_tier] }}
            </span>
          </div>
          <p class="muted">
            Vous avez engagé un {{ TIER_LABEL[tierOf(mine.species)].toLowerCase() }} et un
            {{ TIER_LABEL[tierOf(theirs.species)].toLowerCase() }} : le duel vaut donc le plus
            modeste des deux. Comme au poker, on ne remporte que la mise que l’autre a couverte.
          </p>
        </div>

        <div class="sect">
          <div class="eyebrow sect-h"><span>Comment ça s’est joué</span></div>

          <!--
            Trois tailles, trois rôles : ce qui a décidé du duel se lit d'un coup d'œil, ce qui
            l'explique se lit si l'on veut, et le détail du calcul ne réclame l'attention de
            personne. Tout au même corps donnait une bouillie de chiffres où le résultat se
            perdait au milieu des multiplicateurs.
          -->
          <div class="arena-duel-nums">
            <div>
              <span class="v">{{ Math.round(mine.power) }}</span>
              <span class="arena-unit">ta puissance</span>
            </div>
            <div>
              <span class="v">{{ Math.round(theirs.power) }}</span>
              <span class="arena-unit">la sienne</span>
            </div>
            <div>
              <span class="v" :class="{ win: iWon }">{{ myOdds }} %</span>
              <span class="arena-unit">tes chances</span>
            </div>
          </div>

          <div class="steps" style="margin-top:12px">
            <div v-for="[quoi, combien] in breakdown(mine)" :key="'m' + quoi" class="line">
              <span class="line-name">{{ quoi }}</span>
              <span class="mono">{{ combien }}</span>
            </div>
            <div class="line">
              <span class="line-name">tirage</span>
              <span class="mono">{{ Number(duel.roll).toFixed(4) }}</span>
            </div>
          </div>
          <p class="muted" style="margin-top:8px">
            Le tirage décide : sous {{ myOdds }} %, tu l’emportais. Aucun duel n’est joué
            d’avance — même face au pire écart possible, le plus faible garde une chance sur vingt.
          </p>
        </div>

        <div class="sect">
          <div class="front-actions">
            <button class="btn-solid" @click="$emit('close')">Fermer</button>
          </div>
        </div>
      </template>
      <div v-else class="sect">
        <div class="arena-wait"><span></span><span></span><span></span></div>
        <p class="muted" style="text-align:center">Le combat se joue…</p>
      </div>
    </div>
  </div>
</template>
