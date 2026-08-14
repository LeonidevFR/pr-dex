<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import TheRail from './components/TheRail.vue'
import TheTray from './components/TheTray.vue'
import SpeciesSheet from './components/SpeciesSheet.vue'
import RitualOverlay from './components/RitualOverlay.vue'
import EvolutionOverlay from './components/EvolutionOverlay.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ArenaPanel from './components/ArenaPanel.vue'
import ShopPanel from './components/ShopPanel.vue'
import ProfilePanel from './components/ProfilePanel.vue'
import SeasonPanel from './components/SeasonPanel.vue'
import ArenaTeaser from './components/ArenaTeaser.vue'
import DuelOverlay from './components/DuelOverlay.vue'
import ConnectScreen from './components/ConnectScreen.vue'
import { useCollection } from './composables/useCollection.js'
import { useArena } from './composables/useArena.js'
import { useAuth } from './composables/useAuth.js'
import { useTrayFilters } from './composables/useTrayFilters.js'
import { entryKey } from '../shared/entry.js'
import { createRouter } from './composables/useRoute.js'
import { parisDay } from '../shared/battle.js'
import { arenaIsOpen } from '../shared/arena-economy.js'
import { useKeyboardNav } from './composables/useKeyboardNav.js'
import { createSupabaseClient } from './lib/supabaseData.js'

const collection = useCollection()
const { session, ready, signInWithGithub, signOut } = useAuth()
const connected = ref(false)
const connectError = ref(null)
const connecting = ref(false)
const githubLogin = ref('')

const router = createRouter()
const { route } = router
onUnmounted(router.stop)

/**
 * L'écran courant se LIT dans l'URL, il ne s'écrit pas à côté. Trois refs (`selected`,
 * `arenaOpen`, `shopOpen`) disaient auparavant la même chose que l'adresse : deux sources de
 * vérité pour « où suis-je » finissent toujours par diverger — un retour navigateur laissait
 * une couche ouverte, un lien partagé ne menait nulle part.
 *
 * Les couches qui n'ont pas de lieu (rituel, évolution, résumé de duel, réglages) gardent leur
 * ref : un pli qu'on rouvrirait en collant un lien n'aurait aucun sens.
 */
const selected = computed(() => (route.value.name === 'collection' ? route.value.param : null))
const arenaOpen = computed(() => route.value.name === 'arena')
const shopOpen = computed(() => route.value.name === 'shop')
const profileOpen = computed(() => route.value.name === 'profile')
const seasonOpen = computed(() => route.value.name === 'season')

/**
 * L'arène n'ouvre qu'au premier jour de la saison 1. Avant, ses trois écrans — duels, saison,
 * boutique — annoncent sa venue au lieu de fonctionner à vide : un classement sans points et
 * une boutique sans monnaie ne se comprennent pas, ils inquiètent.
 *
 * La collection et le profil, eux, continuent : ils existaient avant l'arène et n'en dépendent
 * pas.
 *
 * La démonstration fait exception, et c'est sa raison d'être : elle existe pour essayer ce qui
 * n'est pas encore ouvert. Lui appliquer la date de lancement reviendrait à cacher la
 * fonctionnalité à ceux qui viennent précisément la voir.
 */
const demo = ref(false)
const areneOuverte = computed(() => demo.value || arenaIsOpen())
const teaser = computed(() => !areneOuverte.value && ['arena', 'season', 'shop'].includes(route.value.name))

/**
 * Le dossier affiché. Sans pseudo dans l'URL c'est le sien, avec c'est celui d'un collègue —
 * la même vue SQL dans les deux cas, ce qui garantit qu'aucun écran ne peut publier plus que
 * ce qu'elle contient. Ce qui ne se publie jamais est composé à part, et seulement pour soi.
 */
const dossier = ref(null)
const dossierCharge = ref(false)
const detruits = ref([])

/**
 * `connected` fait partie des sources, et la surveillance est immédiate : arriver DIRECTEMENT
 * sur /profile/bob — un lien reçu, un rechargement — ne produit aucun changement de route, donc
 * une surveillance ordinaire ne se déclencherait jamais et l'écran resterait sur son attente.
 * Le client, lui, n'existe qu'une fois la session ouverte : c'est son apparition qui donne le
 * signal quand l'URL, elle, n'a pas bougé.
 */
watch([profileOpen, () => route.value.param, connected], async ([ouvert, pseudo, pret]) => {
  if (!ouvert || !pret || !client) return
  dossierCharge.value = false
  dossier.value = null
  try {
    dossier.value = pseudo ? await client.readPublicProfile(pseudo) : await client.readMyProfile(userId.value)
    detruits.value = pseudo ? [] : await client.readDestroyed()
  } catch (e) {
    connectError.value = e.kind ?? 'server'
  } finally {
    dossierCharge.value = true
  }
}, { immediate: true })

const dossierPrive = computed(() => (route.value.param ? null : {
  copies: collection.catches.value.length,
  pokedollars: arena?.pokedollars.value ?? 0,
  credits: arena?.credits.value ?? 0,
  destroyed: detruits.value.length,
}))
const ritualEntry = ref(null)
const ritualRemaining = ref(0)
const ritualIsNew = ref(false)
const evoAnim = ref(null)
const settingsOpen = ref(false)
const arenaBusy = ref(false)
const arenaPreselect = ref(null)
const gen = ref(1)
const duelShown = ref(null)
const userId = ref('')
let arena = null
let client = null

const filters = useTrayFilters()

// Stock disponible par espèce (une évolution passée a pu en consommer un) — recalculé sur
// les seules espèces déjà rencontrées, pas les 151 : les autres n'ont de toute façon rien à afficher.
const copiesById = computed(() => {
  const map = {}
  for (const id of Object.keys(collection.dex.bySpecies.value)) map[id] = collection.dex.copyCount(Number(id))
  return map
})

const caughtIds = computed(() => new Set(Object.keys(collection.dex.bySpecies.value).map(Number)))

async function connectSession(s) {
  connecting.value = true
  connectError.value = null
  githubLogin.value = s.user.user_metadata?.user_name ?? ''
  client = createSupabaseClient(s.user.id)
  userId.value = s.user.id
  arena = useArena(client, collection.dex.claimed)
  try {
    await client.checkAccess()
  } catch (e) {
    connectError.value = e.kind
    connecting.value = false
    return
  }
  await collection.load(client)
  await arena.load()
  connecting.value = false
  if (collection.error.value) { connectError.value = collection.error.value; return }
  connected.value = true
}

/**
 * Engager et relever passent par le serveur, qui décide seul. On rouvre ensuite la collection
 * en même temps que l'arène : un duel gagné peut avoir détruit un exemplaire, et la planche
 * doit le refléter sans qu'on ait à recharger la page.
 */
async function playArena(fn) {
  arenaBusy.value = true
  try {
    const duel = await fn()
    // Poster un défi ne produit aucun duel : il reste ouvert jusqu'à ce que quelqu'un le
    // relève. Il faut néanmoins que quelque chose se passe à l'écran — une action qui réussit
    // en silence se lit comme un bouton mort. On ouvre donc l'arène, où le défi en attente est
    // rappelé, plutôt qu'un résumé de combat qui n'a pas eu lieu.
    if (duel) {
      duelShown.value = duel
      router.go('collection')
    } else {
      router.go('arena')
    }
    await collection.refresh()
  } catch (e) {
    connectError.value = e.kind ?? 'server'
  } finally {
    arenaBusy.value = false
  }
}

const onEngage = (key, vsComputer) => playArena(() => arena.engage(key, vsComputer))

/**
 * Depuis la fiche, on ne s'engage pas : on choisit. Le bouton ouvre l'arène avec ce Pokémon
 * déjà retenu, et c'est là qu'on décide de poster un défi, d'affronter l'ordinateur ou de
 * relever celui d'un autre.
 *
 * Il postait un défi directement, et c'était une faute : le geste engageait un Pokémon pour de
 * bon avant que le joueur ait vu ses options, et l'écran qui s'ouvrait n'avait plus aucun
 * bouton à offrir puisque tout était déjà joué.
 */
function onEngageFromSheet(key) {
  arenaPreselect.value = key
  router.go('arena')
}

function quitterArene() {
  arenaPreselect.value = null
  router.go('collection')
}
const onAccept = (duelId, key) => playArena(() => arena.accept(duelId, key))

/**
 * Acheter ne produit pas de duel : on ouvre le pli, pas un résumé de combat.
 *
 * Et on ouvre CELUI-LÀ, pas le premier de la file : la file est triée par date, donc un pli
 * acheté arrive derrière tous ceux qu'on avait laissés fermés. Il tombait bien dans la file,
 * mais invisible — on avait payé et rien ne se passait à l'écran.
 *
 * `refresh` déclenche la collecte et attend qu'elle rapporte quelque chose : c'est elle qui
 * matérialise le pli dû. Si elle rentre les mains vides (run lent, hors ligne), on ne force
 * rien — le pli reste dû et s'ouvrira au prochain passage.
 */
async function onBuy(slug) {
  arenaBusy.value = true
  try {
    const id = await arena.buy(slug)
    await collection.refresh()
    const achete = collection.dex.pending.value.find((e) => e.key === entryKey('boutique', id))
    if (achete) { router.go('collection'); showPacket(achete) }
  } catch (e) {
    connectError.value = e.kind ?? 'server'
  } finally {
    arenaBusy.value = false
  }
}

function disconnect() {
  signOut()
  settingsOpen.value = false
  connected.value = false
  connectError.value = null
}

onMounted(async () => {
  if (new URLSearchParams(location.search).has('demo')) {
    const { loadDemoClient } = await import('./fixtures/demo.js')
    githubLogin.value = 'démo'
    client = loadDemoClient()
    demo.value = true
    userId.value = 'demo-moi'
    arena = useArena(client, collection.dex.claimed)
    await collection.load(client)
    await arena.load()
    connected.value = true
  }
})

// OAuth GitHub redirige la page entière puis revient : pas d'appel ponctuel possible au montage,
// il faut réagir à l'arrivée tardive de la session (retour de redirection ou session déjà active).
watch(
  () => [ready.value, session.value],
  ([isReady, s]) => {
    if (!isReady || connected.value) return
    if (s) connectSession(s)
  },
  { immediate: true },
)

// Figé à l'ouverture du pli : `claim` retire aussitôt l'entrée de `pending`, donc une
// liaison directe sur `pending.length` décrémenterait sous le composant pendant qu'il
// est affiché. Le composant attend un `remaining` qui inclut le pli courant.
//
// Même raison pour `isNew`, plus impérieuse encore : `claim` inscrit l'espèce au dex avant
// même la révélation, donc une liaison directe la dirait déjà rencontrée — le marqueur ne
// s'allumerait jamais. Il se lit sur l'état d'avant l'ouverture, seul état où la question
// « jamais rencontrée ? » a un sens.
function showPacket(entry) {
  const queue = collection.dex.pending.value
  ritualEntry.value = entry ?? null
  ritualRemaining.value = queue.length
  ritualIsNew.value = ritualEntry.value ? collection.dex.isNewSpecies(ritualEntry.value.species) : false
}
const showNextPacket = () => showPacket(collection.dex.pending.value[0])
const openRitual = showNextPacket
const nextRitual = showNextPacket

async function skipAll() {
  const rest = [...collection.dex.pending.value]
  ritualEntry.value = null
  for (const e of rest) await collection.claim(e.key)
}

async function onEvolve({ from, to, key }) {
  const shiny = collection.dex.availableEntries(from).find((e) => e.key === key)?.shiny ?? false
  // Figé avant l'écriture, pour la même raison que `ritualIsNew` plus haut : `evolve`
  // inscrit l'espèce cible au dex dès l'appel, donc une lecture après coup la dirait
  // toujours déjà rencontrée. Les bonbons suivent la règle inverse et se lisent au rendu,
  // après la dépense — d'où leur absence de cet instantané.
  const isNew = collection.dex.isNewSpecies(to)
  router.go('collection')
  // Datée à Paris comme tout le reste : en UTC, une évolution faite à 00 h 30 un soir d'été
  // s'inscrivait à la veille, et la fiche affichait une date que le joueur ne reconnaissait pas.
  const written = await collection.evolve(from, to, key, parisDay())
  // L'écriture a échoué, ou n'a rien eu à faire (exemplaire déjà consommé ailleurs,
  // bonbons insuffisants sur l'état frais) : pas de cérémonie pour une évolution qui n'a pas eu lieu.
  if (!written || collection.error.value) return
  evoAnim.value = { from, to, shiny, isNew }
}

function finishEvo() {
  // La cérémonie finie, on rouvre la fiche de la forme OBTENUE : c'est elle qu'on veut lire,
  // et l'URL doit la désigner pour que le retour navigateur ramène à la planche.
  router.go('collection', evoAnim.value.to)
  evoAnim.value = null
}

const overlayOpen = computed(() =>
  Boolean(ritualEntry.value || evoAnim.value || selected.value || settingsOpen.value),
)

// Priorité calquée sur l'empilement visuel donné par les z-index de styles.css :
// évolution (70), rituel (60), puis réglages et fiche (40). Fermer le rituel conserve
// les plis restants, comme le fait déjà sa croix.
function closeTopOverlay() {
  if (evoAnim.value) finishEvo()
  else if (ritualEntry.value) ritualEntry.value = null
  else if (settingsOpen.value) settingsOpen.value = false
  else if (selected.value) router.go('collection')
  else return

  // La fiche et les réglages n'ont pas de discipline de focus : leur déclencheur (la case de la
  // planche, le bouton ⚙) garde le focus derrière le scrim. Sans ce retour au repos, l'Espace
  // suivant l'active nativement et rouvre ce qu'Échap vient de fermer — Échap/Espace boucle et
  // la chaîne « tout faire à la touche Espace » devient inatteignable sans reprendre la souris.
  // Focaliser la croix de fermeture serait pire : Espace refermerait alors la fiche, alors que
  // la spécification veut qu'il n'y fasse rien.
  document.activeElement?.blur()
}

useKeyboardNav({
  blocked: overlayOpen,
  // Seul état sans bouton principal à focaliser : la home au repos. `openRitual` laisse
  // `ritualEntry` à null quand la file est vide — rien à cas-particulariser ici.
  onSpace: openRitual,
  onEscape: closeTopOverlay,
})
</script>

<template>
  <ConnectScreen
    v-if="!connected"
    :error="connectError" :busy="connecting"
    @connect="signInWithGithub"
  />

  <template v-else>
    <TheRail
      :caught-count="collection.dex.caughtCount.value"
      :pending-count="collection.dex.pending.value.length"
      :syncing="collection.loading.value" :sync-error="collection.error.value"
      :filters-open="filters.open.value" :filters-active="filters.active.value"
      :place="route.name"
      @open="openRitual" @settings="settingsOpen = true" @sync="collection.refresh"
      @go="(lieu) => router.go(lieu)"
      @toggle-filters="filters.open.value = !filters.open.value"
    />
    <TheTray
      v-if="route.name === 'collection'"
      :by-species="collection.dex.bySpecies.value" :copies="copiesById" :evolvable="collection.dex.evolvableIds.value"
      :filters-open="filters.open.value" :active-tiers="filters.activeTiers.value"
      :caught-filter="filters.caughtFilter.value" :gen="gen"
      @select="(id) => router.go('collection', id)"
      @toggle-tier="filters.toggleTier" @set-caught-filter="filters.setCaughtFilter" @reset-filters="filters.reset"
      @set-gen="gen = $event"
    />

    <transition name="fade">
      <SpeciesSheet
        v-if="selected" :id="selected"
        :entries="collection.dex.bySpecies.value[selected] ?? null"
        :available="collection.dex.availableEntries(selected)"
        :copies="collection.dex.copyCount(selected)"
        :candies="collection.dex.candies(selected)"
        :can-evolve="collection.dex.canEvolve(selected)"
        :is-dead-end="collection.dex.isDeadEnd(selected)"
        :caught-ids="caughtIds"
        :arena-credits="arena ? arena.credits.value : 0"
        :arena-level-of="arena ? arena.levelOf : () => 1"
        @close="router.go('collection')" @evolve="onEvolve" @engage="onEngageFromSheet"
      />
    </transition>

    <transition name="fade">
      <RitualOverlay
        v-if="ritualEntry" :key="ritualEntry.key" :entry="ritualEntry"
        :remaining="ritualRemaining" :is-new="ritualIsNew"
        @claim="collection.claim" @next="nextRitual" @skip-all="skipAll"
        @close="ritualEntry = null"
      />
    </transition>

    <transition name="fade">
      <EvolutionOverlay
        v-if="evoAnim" :from="evoAnim.from" :to="evoAnim.to" :shiny="evoAnim.shiny"
        :is-new="evoAnim.isNew" :candies="collection.dex.candies(evoAnim.to)" @done="finishEvo"
      />
    </transition>

    <ArenaTeaser v-if="teaser" />

    <ArenaPanel
      v-if="arenaOpen && arena && areneOuverte"
      :credits="arena.credits.value" :pokedollars="arena.pokedollars.value"
      :challenges="arena.challenges.value" :engageable="arena.engageable.value"
      :my-open="arena.myOpen.value" :level-of="arena.levelOf"
      :form-of-key="arena.formOfKey" :busy="arenaBusy"
      :preselect="arenaPreselect" :leaderboard="arena.leaderboard.value"
      :seasons="arena.seasons.value" :season="arena.season.value" :user-id="userId"
      @engage="onEngage" @accept="onAccept"
    />

    <ShopPanel
      v-if="shopOpen && arena && areneOuverte"
      :pokedollars="arena.pokedollars.value" :shop="arena.shop.value" :busy="arenaBusy"
      @buy="onBuy"
    />

    <SeasonPanel
      v-if="seasonOpen && arena && areneOuverte"
      :season="arena.season.value" :leaderboard="arena.leaderboard.value"
      :seasons="arena.seasons.value" :user-id="userId"
      @profile="(p) => router.go('profile', p)"
    />

    <ProfilePanel
      v-if="profileOpen"
      :dossier="dossier" :pseudo="route.param" :prive="dossierPrive"
      :seasons="arena ? arena.seasons.value : []"
      :points="arena ? (arena.leaderboard.value.find((l) => l.user_id === (dossier?.user_id ?? userId))?.points ?? 0) : 0"
      :season="arena ? arena.season.value : ''"
      :loading="!dossierCharge" :introuvable="dossierCharge && !dossier"
    />

    <transition name="fade">
      <DuelOverlay
        v-if="duelShown" :duel="duelShown" :user-id="userId"
        @close="duelShown = null"
      />
    </transition>

    <transition name="fade">
      <SettingsPanel
        v-if="settingsOpen" :github-login="githubLogin" @close="settingsOpen = false" @disconnect="disconnect"
      />
    </transition>
  </template>
</template>
