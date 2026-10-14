<script setup>
import { computed } from 'vue'
import SeasonBadge from './SeasonBadge.vue'
import { seasonLabel } from '../../shared/arena-economy.js'

const props = defineProps({
  /** La fiche publique telle que la base la rend : nom, espèces, victoires, défaites. */
  fiche: { type: Object, default: null },
  /** Le login cherché dans l'URL. Absent : c'est la sienne. */
  cherche: { type: String, default: null },
  /** Son propre nom de compte, pour titrer sa fiche autrement que « toi ». */
  moi: { type: String, default: null },
  /**
   * Ce qui ne se publie jamais, et n'est donc fourni que pour sa propre fiche :
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

const cestMoi = computed(() => !props.cherche)

/**
 * Le caviardage ne concerne QUE la fiche d'un collègue. On avait offert de relire le sien
 * avec les yeux des autres, sous un bouton : chez soi, on veut voir ses affaires, pas les
 * trous qu'un tiers verrait à leur place. La règle de visibilité se lit en une phrase sous le
 * tableau ; elle n'a pas besoin d'abîmer l'écran de son propriétaire pour se faire comprendre.
 */
const public_ = computed(() => !cestMoi.value)

/**
 * La fiche, dans l'ordre où on la lit. `secret` marque ce qui ne sort jamais de chez soi —
 * la case reste alors en place, hachurée : la retirer ferait une page plus courte dont on ne
 * saurait pas ce qu'elle a perdu. Une case barrée montre où passe la règle.
 */
const cases = computed(() => {
  const d = props.fiche ?? {}
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
    // Vendu n'est pas perdu : l'un est une défaite, l'autre une décision — et celle-ci a
    // rapporté quelque chose, qu'on affiche avec elle.
    {
      v: p.sold != null ? `${p.sold}` : '—',
      l: p.soldTotal ? `Revendus · ${p.soldTotal} ₽` : 'Revendus',
      secret: true,
    },
  ]
})

/** Les trois marches, et rien d'autre : une saison sans podium n'a pas de badge à montrer. */
const RANGS = ['first_id', 'second_id', 'third_id']
const palmares = computed(() => {
  const id = props.fiche?.user_id
  if (!id) return []
  return props.seasons
    .map((s) => ({ season: s.season, rank: RANGS.findIndex((r) => s[r] === id) + 1 }))
    .filter((s) => s.rank > 0)
})
</script>

<template>
  <section class="view">
  <div class="view-head">
    <div>
      <div class="eyebrow">Fiche</div>
      <!--
        La fiche porte le nom du compte : celui que les deux classements affichent et sous
        lequel l'équipe se connaît. Le nom rendu par la base d'abord — c'est celui que les
        autres lisent — le sien ensuite, quand on regarde chez soi.
      -->
      <h1 class="view-title">
        La fiche de <i>{{ fiche?.login ?? cherche ?? moi ?? 'toi' }}</i>
      </h1>
    </div>
  </div>

  <div v-if="loading" class="sect">
    <div class="arena-wait"><span></span><span></span><span></span></div>
  </div>

  <div v-else-if="introuvable" class="sect">
    <p class="muted">
      Personne ne joue sous ce nom. Le lien que tu as suivi désigne peut-être un collègue qui
      a changé de login GitHub depuis, ou qui n’a pas encore ouvert sa première carte.
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
        nombre d’exemplaires compte les PR mergées et les monkey-testings un par un, et
        l’afficher reviendrait à publier un classement de productivité. La règle est tenue en base : l’agrégat public
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
        <span class="mono" style="font-size:11px;color:var(--fg-3)">
          {{ palmares.length }} podium{{ palmares.length > 1 ? 's' : '' }}
        </span>
      </div>
      <div v-if="palmares.length" class="prof-badges">
        <div v-for="p in palmares" :key="p.season" class="prof-badge">
          <SeasonBadge :season="p.season" :rank="p.rank" :size="58" />
          <span class="mono">{{ seasonLabel(p.season) }}</span>
          <span class="prof-rang">{{ p.rank === 1 ? '1er' : `${p.rank}e` }}</span>
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
