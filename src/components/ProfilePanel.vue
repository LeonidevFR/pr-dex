<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import SeasonBadge from './SeasonBadge.vue'
import { seasonLabel } from '../../shared/arena-economy.js'

const props = defineProps({
  /** Le dossier public tel que la base le rend : espèces, victoires, défaites. */
  dossier: { type: Object, default: null },
  /** Le pseudo regardé. Absent : c'est le sien. */
  pseudo: { type: String, default: null },
  /** Son propre pseudonyme, pour titrer son dossier autrement que « toi ». */
  monPseudo: { type: String, default: null },
  /**
   * Ce qui ne se publie jamais, et n'est donc fourni que pour son propre dossier :
   * `{ copies, pokedollars, credits, destroyed }`.
   */
  prive: { type: Object, default: null },
  /** Les saisons closes, avec leur podium, pour dresser l'étagère. */
  seasons: { type: Array, default: () => [] },
  points: { type: Number, default: 0 },
  season: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  introuvable: { type: Boolean, default: false },
})

const cestMoi = computed(() => !props.pseudo)

/**
 * Le caviardage ne concerne QUE le dossier d'un collègue. On avait offert de relire le sien
 * avec les yeux des autres, sous un bouton : chez soi, on veut voir ses affaires, pas les
 * trous qu'un tiers verrait à leur place. La règle de visibilité se lit en une phrase sous le
 * tableau ; elle n'a pas besoin d'abîmer l'écran de son propriétaire pour se faire comprendre.
 */
const public_ = computed(() => !cestMoi.value)

/**
 * Le dossier, dans l'ordre où on le lit. `secret` marque ce qui ne sort jamais de chez soi —
 * la case reste alors en place, hachurée : la retirer ferait une page plus courte dont on ne
 * saurait pas ce qu'elle a perdu. Une case barrée montre où passe la règle.
 */
const cases = computed(() => {
  const d = props.dossier ?? {}
  const p = props.prive ?? {}
  return [
    { v: String(d.species ?? 0).padStart(3, '0'), l: 'Espèces' },
    { v: p.copies ?? '—', l: 'Exemplaires', secret: true },
    { v: p.pokedollars != null ? `${p.pokedollars} ₽` : '—', l: 'Pokédollars', secret: true },
    // « Crédits » tout court se lisait comme des plis à ouvrir. Ce sont des engagements
    // d'arène : un par jour ouvré, cinq au plus, perdus le dimanche soir.
    { v: p.credits ?? '—', l: 'Crédits d’arène', secret: true },
    { v: d.wins ?? 0, l: 'Duels gagnés' },
    { v: d.losses ?? 0, l: 'Perdus' },
    { v: props.points, l: `Points · ${seasonLabel(props.season)}` },
    { v: p.destroyed ?? '—', l: 'Exemplaires perdus', secret: true },
  ]
})

/** Les trois marches, et rien d'autre : une saison sans podium n'a pas de badge à montrer. */
const RANGS = ['first_id', 'second_id', 'third_id']
const palmares = computed(() => {
  const id = props.dossier?.user_id
  if (!id) return []
  return props.seasons
    .map((s) => ({ season: s.season, rank: RANGS.findIndex((r) => s[r] === id) + 1 }))
    .filter((s) => s.rank > 0)
})
</script>

<template>
  <section class="page">
  <div class="panel-top" style="align-items:flex-start;padding-bottom:16px">
    <div>
      <span class="panel-plate mono">PROFIL</span>
      <!--
        Son propre dossier porte son nom d'arène : c'est sous celui-là qu'on apparaît partout
        ailleurs, et le voir ici confirme qu'il est bien posé. « toi » ne subsiste que tant
        qu'aucun nom n'a été choisi.
      -->
      <h2 class="panel-name" style="font-size:26px;margin-bottom:0">
        {{ pseudo ?? monPseudo ?? 'toi' }}
      </h2>
      <p v-if="cestMoi && !monPseudo" class="muted" style="margin-top:6px">
        Tu n’as pas encore de nom d’arène — les autres ne peuvent pas ouvrir ton profil.
      </p>
    </div>
  </div>

  <div v-if="loading" class="sect">
    <div class="arena-wait"><span></span><span></span><span></span></div>
  </div>

  <div v-else-if="introuvable" class="sect">
    <p class="muted">
      Personne ne joue sous ce nom. Un pseudonyme se change — le lien que tu as suivi
      désigne peut-être quelqu’un qui s’est renommé depuis.
    </p>
  </div>

  <template v-else>
    <div class="prof-cases">
      <div
        v-for="c in cases" :key="c.l"
        class="prof-case" :class="{ secret: c.secret && public_ }"
      >
        <b>{{ c.secret && public_ ? '—' : c.v }}</b>
        <span>{{ c.l }}</span>
      </div>
    </div>

    <div class="sect">
      <p v-if="cestMoi" class="muted">
        <b>Ce tableau n’est visible que par toi.</b> Les collègues voient tes espèces, tes
        victoires et tes défaites — jamais tes exemplaires, ta caisse ni tes crédits. Le
        nombre d’exemplaires est un compteur brut de PR mergées, et l’afficher reviendrait à
        publier un classement de productivité. La règle est tenue en base : l’agrégat public
        est une vue qui ne contient pas ces colonnes.
      </p>
      <p v-else class="muted">
        <b>Les cases barrées ne se publient pas</b>, et personne ne les voit — pas plus toi
        chez les autres qu’eux chez toi. Les espèces, elles, plafonnent à 151 et saturent
        vite : elles ne disent rien du volume de travail de personne.
      </p>
    </div>

    <div class="sect">
      <div class="eyebrow sect-h">
        <span>Palmarès</span>
        <span class="mono" style="font-size:11px;color:var(--ink-3)">
          {{ palmares.length }} podium{{ palmares.length > 1 ? 's' : '' }}
        </span>
      </div>
      <div v-if="palmares.length" class="prof-badges">
        <div v-for="p in palmares" :key="p.season" class="prof-badge">
          <SeasonBadge :season="p.season" :rank="p.rank" :size="46" />
          <span class="mono">{{ seasonLabel(p.season) }}</span>
        </div>
      </div>
      <p v-else class="muted">
        Aucune saison sur le podium pour l’instant. Les trois premiers d’une saison gardent
        son badge — une saison ne se rejoue pas.
      </p>
    </div>
  </template>
  </section>
</template>
