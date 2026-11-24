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
import SaleSection from './components/SaleSection.vue'
import ProfilePanel from './components/ProfilePanel.vue'
import ArenaTeaser from './components/ArenaTeaser.vue'
import DuelOverlay from './components/DuelOverlay.vue'
import BoardsView from './components/BoardsView.vue'
import SeasonRecap from './components/SeasonRecap.vue'
import MeView from './components/MeView.vue'
import ConnectScreen from './components/ConnectScreen.vue'
import SlackInvite from './components/SlackInvite.vue'
import SyncToast from './components/SyncToast.vue'
import NoticeToast from './components/NoticeToast.vue'
import DuelHistory from './components/DuelHistory.vue'
import { useCollection } from './composables/useCollection.js'
import { useArena } from './composables/useArena.js'
import { useAuth } from './composables/useAuth.js'
import { useTrayFilters } from './composables/useTrayFilters.js'
import { entryKey } from '../shared/entry.js'
import { saleGroups } from './lib/revente.js'
import { createRouter } from './composables/useRoute.js'
import { messageDErreur } from './lib/erreurs.js'
import { parisDay } from '../shared/battle.js'
import { arenaIsOpen, FIRST_SEASON } from '../shared/arena-economy.js'
import { useKeyboardNav } from './composables/useKeyboardNav.js'
import { useTheme } from './composables/useTheme.js'
import { useSlackInvite } from './composables/useSlackInvite.js'
import { createSupabaseClient } from './lib/supabaseData.js'
import { pendingSync } from './lib/syncMemory.js'
import { accountName as nameOf, identitiesOf, shouldInviteSlack, SLACK } from './lib/account.js'
import AchievementsView from './components/AchievementsView.vue'
import AchievementToasts from './components/AchievementToasts.vue'
import AchievementRecap from './components/AchievementRecap.vue'
import { useAchievements } from './composables/useAchievements.js'

const collection = useCollection()
const achievements = useAchievements()
const { session, ready, authError, signIn, link, unlink, freshUser, signOut } = useAuth()
const connected = ref(false)
const connectError = ref(null)

/**
 * Ce qui a échoué pendant qu'on jouait.
 *
 * `connectError` n'est rendu que par l'écran de connexion : une fois connecté, un engagement
 * refusé, un achat impossible ou une panne réseau ne produisaient RIEN à l'écran. Le bouton
 * semblait mort, ce qui est exactement le défaut qu'on a déjà corrigé deux fois ailleurs.
 *
 * On garde le message du serveur plutôt qu'un « une erreur est survenue » : c'est lui qui est
 * utile — « aucun crédit d'engagement disponible cette semaine » dit quoi faire, pas une
 * formule générique. Les refus du serveur sont écrits pour être lus.
 */
const avis = ref(null)
/** `true` quand l'avis annonce une bonne nouvelle plutôt qu'un refus. */
const avisBon = ref(false)

const signaler = (e) => { avis.value = messageDErreur(e); avisBon.value = false }
const connecting = ref(false)
const accountName = ref('')
const identities = ref([])
const isDemo = new URLSearchParams(location.search).has('demo')
/**
 * La démo suit la date, comme le reste : l'adresse `?demo` circule, et avant le 1er décembre
 * elle aurait montré l'arène entière à qui la connaissait. `?demo&arene` l'ouvre quand même,
 * pour essayer le jeu avant son lancement.
 *
 * `?demo&teaser` garde l'arène fermée même avec `&arene`. Sans effet une fois l'arène ouverte :
 * la date reste la seule autorité.
 */
const teaserForce = new URLSearchParams(location.search).has('teaser')
const areneForce = new URLSearchParams(location.search).has('arene')
// Tant qu'on ne sait pas s'il faut se connecter, on n'affiche pas l'accueil : la démo ou une
// session déjà ouverte le faisaient clignoter au rechargement, avant la planche.
const restoring = computed(() => !connectError.value && (isDemo || !ready.value || !!session.value))

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
const duelsOpen = computed(() => route.value.name === 'duels')
const shopOpen = computed(() => route.value.name === 'shop')
const profileOpen = computed(() => route.value.name === 'profile')
const boardsOpen = computed(() => route.value.name === 'classements')
/**
 * Ses points et son rang dans la saison en cours. Lus au classement plutôt que comptés à part :
 * un second calcul finirait par ne plus dire la même chose que le tableau d'à côté.
 *
 * `connected` est lu en premier, et ce n'est pas décoratif : `arena` est un `let` ordinaire, non
 * réactif. Sans dépendance qui bascule APRÈS son affectation, ce calcul tournerait une fois sur
 * une arène encore nulle, mettrait zéro en cache et n'en sortirait jamais. `userId` ne suffit
 * pas — il est posé juste avant l'arène, pas après.
 */
const monRang = computed(() => {
  if (!connected.value || !arena) return { points: 0, rang: 0 }
  const moi = arena.leaderboard.value.find((l) => l.user_id === userId.value)
  return { points: moi?.points ?? 0, rang: moi?.rank ?? 0 }
})
const meOpen = computed(() => route.value.name === 'moi')

/**
 * L'arène n'ouvre qu'au premier jour de la saison 1. Avant, ses deux écrans — les duels et la
 * boutique — annoncent sa venue au lieu de fonctionner à vide : des duels sans crédits et une
 * boutique sans monnaie ne se comprennent pas, ils inquiètent.
 *
 * Les trois autres continuent, et se réduisent d'eux-mêmes : la collection n'a jamais dépendu
 * de l'arène, les classements gardent celui de la collection, et « Moi » garde ses
 * statistiques. Aucun n'annonce une caisse vide.
 *
 * La démonstration fait exception, et c'est sa raison d'être : elle existe pour essayer ce qui
 * n'est pas encore ouvert. Lui appliquer la date de lancement reviendrait à cacher la
 * fonctionnalité à ceux qui viennent précisément la voir.
 */
const demo = ref(false)
const areneOuverte = computed(() => arenaIsOpen() || (demo.value && areneForce && !teaserForce))
const teaser = computed(() => !areneOuverte.value && ['duels', 'shop'].includes(route.value.name))

/**
 * La fiche lue. Celle d'un collègue sur `/profile/<login>`, la sienne sur « Moi » — la même vue
 * SQL dans les deux cas, ce qui garantit qu'aucun écran ne peut publier plus qu'elle ne
 * contient. Ce qui ne se publie jamais est composé à part, et seulement pour soi.
 */
const fiche = ref(null)
const ficheChargee = ref(false)
const detruits = ref([])

/**
 * `connected` fait partie des sources, et la surveillance est immédiate : arriver DIRECTEMENT
 * sur /profile/bob — un lien reçu, un rechargement — ne produit aucun changement de route, donc
 * une surveillance ordinaire ne se déclencherait jamais et l'écran resterait sur son attente.
 * Le client, lui, n'existe qu'une fois la session ouverte : c'est son apparition qui donne le
 * signal quand l'URL, elle, n'a pas bougé.
 */
watch([() => profileOpen.value || meOpen.value, () => route.value.param, connected], async ([ouvert, login, pret]) => {
  if (!ouvert || !pret || !client) return
  ficheChargee.value = false
  fiche.value = null
  try {
    fiche.value = login ? await client.readPublicProfile(login) : await client.readMyProfile(userId.value)
    // Un lien vers sa PROPRE fiche publique — reçu, ou copié depuis un classement d'avant ce
    // correctif — montrerait ses chiffres tels qu'un tiers les voit. On bascule sur la sienne.
    if (login && fiche.value?.user_id === userId.value) return router.go('moi')
    detruits.value = login ? [] : await client.readDestroyed()
  } catch (e) {
    connectError.value = e.kind ?? 'server'
  } finally {
    ficheChargee.value = true
  }
}, { immediate: true })

/**
 * Ce qui ne sort jamais de chez soi. Composé ici et servi au seul écran « Moi » : la fiche d'un
 * collègue ne le reçoit pas, et ne peut donc pas le laisser échapper par distraction.
 */
const fichePrivee = computed(() => ({
  // Les exemplaires qu'on a ENCORE : à côté de « Perdus à l'arène », un total qui compterait
  // les disparus se lirait comme un stock, et se contredirait tout seul.
  copies: Object.values(availableById.value).reduce((n, l) => n + l.length, 0),
  pokedollars: arena?.pokedollars.value ?? 0,
  credits: arena?.credits.value ?? 0,
  destroyed: detruits.value.length,
  // Deux compteurs distincts, jamais un seul : perdre un exemplaire est une défaite, le vendre
  // est une décision. Les confondre effacerait la différence.
  sold: arena?.sold.value.length ?? 0,
  soldTotal: arena?.soldTotal.value ?? 0,
}))
const ritualEntry = ref(null)
const ritualRemaining = ref(0)
const ritualIsNew = ref(false)
const evoAnim = ref(null)
// Une liaison Slack refusée revient sur la page avec l'erreur : on rouvre les Réglages, où
// elle s'explique.
const settingsOpen = ref(Boolean(authError.value))
const invite = useSlackInvite()
const showSlackInvite = computed(() =>
  shouldInviteSlack({ demo: isDemo, providers: identities.value.map((i) => i.provider), dismissed: invite.dismissed.value }))
// Une vue est une page, pas un overlay : elle ne bloque pas le clavier et Échap ne la ferme
// pas. Rien n'est mémorisé d'un chargement à l'autre, on revient toujours à la planche.
/**
 * L'onglet du rail, déduit du lieu — et non tenu à part : un `ref` doublant l'URL diverge au
 * premier retour navigateur.
 *
 * Chaque lieu est un onglet, sauf la fiche d'un collègue, qui n'en a pas : on n'y va jamais de
 * soi-même, on y arrive en cliquant un nom dans un classement. Le rail garde donc l'onglet d'où
 * l'on vient allumé, plutôt que de n'en allumer aucun.
 */
const view = computed(() => (route.value.name === 'profile' ? 'classements' : route.value.name))
// Le client de données reste dans `useCollection`, qui ne l'expose pas ; le panneau du
// classement en a besoin pour sa propre lecture. On garde donc la référence ici, au seul
// endroit qui la crée.
const dataClient = ref(null)
// Date du jour figée au chargement, au format des dates de capture : le calcul des
// « 30 jours » est une fonction pure, elle ne lit jamais l'horloge elle-même.
const today = new Date().toISOString().slice(0, 10)

const arenaBusy = ref(false)
const arenaPreselect = ref(null)
/**
 * L'étagère regardée. Une seule en saison 1 : la Gen 2 arrive d'un bloc en saison 2, en
 * boutique et au tirage des PR, et son étagère avec elle.
 *
 * Avant cela, elle ne s'achetait qu'en boutique, donc n'existait pas avant que l'arène ouvre. Annoncer une étagère vide en désignant un magasin
 * fermé pour six semaines, c'est promettre ce qu'on ne sert pas.
 *
 * Le repli n'est pas décoratif : un joueur resté sur la seconde étagère au moment de la
 * fermeture s'y retrouverait enfermé, devant cent cases grises et sans onglet pour en sortir.
 */
const gen = ref(1)
watch(areneOuverte, (ouverte) => { if (!ouverte) gen.value = 1 }, { immediate: true })
const duelShown = ref(null)

/**
 * Les duels qui se sont joués sans nous.
 *
 * Un défi que personne ne relève est résolu par la maison au bout de vingt-quatre heures : on
 * peut donc perdre un Pokémon pendant la nuit. Rien ne le disait — on le découvrait en
 * constatant une absence, ce qui se lit comme une panne plutôt que comme une défaite. La
 * cérémonie se rejoue donc à la connexion, pour ceux qu'on n'a pas vus.
 *
 * Les identifiants vus sont consignés dans l'état du joueur : sans cette mémoire, le même duel
 * se rejouerait à chaque visite.
 */
const aVoir = ref([])

function duelsNonVus() {
  if (!arena) return []
  const vus = new Set(collection.state.value.seenDuels ?? [])
  return arena.recentDuels.value.filter((d) => !vus.has(d.id))
}

async function marquerVu(id) {
  await collection.markDuelSeen(id)
}

/** Enchaîne les duels non vus, un par un : chacun mérite sa cérémonie. */
async function montrerSuivant() {
  const suivant = aVoir.value.shift()
  duelShown.value = suivant ?? null
  if (suivant) await marquerVu(suivant.id)
}

/**
 * Au retour, on rejoue les duels manqués. Les plus anciens d'abord : on les a vécus dans cet
 * ordre-là, même sans les avoir regardés.
 */
/**
 * La dernière saison close, avec son classement : le récap l'annonce une fois, et Scores la
 * rappelle quelques jours. Le classement est celui de la saison close, lu à part : celui du
 * moment repart de zéro et ne porte plus les noms du podium.
 */
const lastSeason = ref(null)
const seasonRecap = ref(null)
async function annoncerLaSaison() {
  if (!arena) return
  const closes = [...arena.seasons.value].sort((a, b) => (a.season < b.season ? 1 : -1))
  if (!closes.length) return
  let board = []
  try { board = (await client.readSeasonLeaderboard(closes[0].season)) ?? [] } catch { /* noms par défaut */ }
  lastSeason.value = { ...closes[0], board }
  // Pas de récap en démo : il s'ouvrait à chaque chargement, avant même qu'on ait vu le jeu.
  // Le bandeau de Scores suffit à montrer qu'une saison vient de se clore.
  if (isDemo) return
  if (!(collection.state.value.seenSeasons ?? []).includes(closes[0].season)) seasonRecap.value = lastSeason.value
}
function closeSeasonRecap() {
  collection.markSeasonsSeen(arena.seasons.value.map((s) => s.season))
  seasonRecap.value = null
}

async function rattraperLesDuels() {
  const manques = duelsNonVus()
  if (!manques.length) return
  aVoir.value = [...manques].reverse()
  await montrerSuivant()
}
const userId = ref('')
let arena = null
let client = null

// La date d'un déblocage en direct se lit au moment du geste, pas au chargement : une session
// ouverte la veille ne doit pas antidater un succès.
const nowDay = () => new Date().toISOString().slice(0, 10)
// Un duel se découvre par sa cérémonie : les succès qu'il débloque attendent qu'on l'ait
// refermée, sinon le toast annoncerait la victoire avant l'issue du combat.
watch(duelShown, (shown, before) => { if (!shown && before) achievements.check(nowDay()) })
/**
 * Ce que lisent les succès. Les évolutions sont celles du serveur, nommées `evo:<id>` comme les
 * exemplaires qu'elles produisent : `state.evolutions` n'est plus écrit depuis la bascule.
 */
const collectionData = () => ({
  catches: collection.catches.value,
  state: {
    ...collection.state.value,
    evolutions: collection.evolutions.value.map((e) => ({
      species: e.to_species, from: e.from_species, fromKey: e.from_key, date: e.day, key: `evo:${e.id}`,
    })),
  },
  arena: arena
    ? { userId: userId.value, duels: arena.recentDuels.value, exemplars: arena.exemplars.value, seasons: arena.seasons.value }
    : null,
})

// Le récap se fige à l'ouverture : `acknowledge` vide la liste dès la fermeture, et la feuille
// qui s'efface afficherait sinon « Tu avais déjà 0 succès ».
const recap = ref(null)
watch(
  // Une fenêtre à la fois : le récap attend que le duel et la fin de saison soient refermés.
  () => [view.value, achievements.unannounced.value.length, seasonRecap.value, duelShown.value],
  ([v, n, saison, duel]) => {
    if (v !== 'succes' || !n || recap.value || saison || duel) return
    recap.value = { items: [...achievements.unannounced.value], first: achievements.isFirstRecap.value }
  },
)
// Un clic sur un toast mène au succès. Le rituel se ferme comme à la croix : les plis restants
// attendent dans la file.
const achievementFocus = ref(null)
let focusSeq = 0
function openAchievement(code) {
  ritualEntry.value = null
  router.go('succes')
  achievementFocus.value = { code, seq: ++focusSeq }
}

function closeRecap() {
  recap.value = null
  achievements.acknowledge()
}

const filters = useTrayFilters()
const { theme, toggle: toggleTheme } = useTheme()

/**
 * La collection ignore l'arène : les destructions vivent dans `arena_exemplars`, que seul
 * `useArena` lit. On les lui verse donc après chaque chargement de l'arène, sinon un exemplaire
 * perdu continuerait de compter à la planche — et pourrait même servir à une évolution, qui lui
 * donnerait une clé neuve et annulerait la perte.
 *
 * Recopié plutôt que surveillé : `arena` n'est pas une référence réactive mais une simple
 * variable, assignée à la connexion. Un `watch` posé avant elle ne s'abonnerait à rien.
 */
function reporterLesPertes() {
  if (arena) collection.partis.value = arena.gone.value
}

// Stock disponible par espèce (une évolution passée a pu en consommer un) — recalculé sur
// les seules espèces déjà rencontrées, pas les 151 : les autres n'ont de toute façon rien à afficher.
// Les exemplaires encore en main, par espèce. La planche en tire son compteur ×N, mais aussi
// le shiny et l'origine qu'elle affiche : ce qui a été perdu ne doit plus rien y raconter.
const availableById = computed(() => {
  const map = {}
  for (const id of Object.keys(collection.dex.bySpecies.value)) {
    map[id] = collection.dex.availableEntries(Number(id))
  }
  return map
})

/**
 * Le surplus vendable. Il se déduit du stock DISPONIBLE — donc sans ce qu'une évolution a
 * consommé ni ce qui est déjà parti — et des niveaux que l'arène tient : le prix suit le niveau,
 * et un exemplaire aguerri ne doit pas s'afficher au tarif d'un neuf.
 */
const surplus = computed(() => saleGroups(
  Object.values(availableById.value).flat(),
  arena ? arena.levelOf : undefined,
))

const caughtIds = computed(() => new Set(Object.keys(collection.dex.bySpecies.value).map(Number)))

async function connectSession(s) {
  connecting.value = true
  connectError.value = null
  accountName.value = nameOf(s.user)
  identities.value = identitiesOf(s.user)
  // La session en mémoire peut dater d'avant une liaison Slack : on relit le compte auprès de
  // Supabase, sans bloquer le chargement de la collection.
  refreshIdentities()
  client = createSupabaseClient(s.user.id)
  dataClient.value = client
  userId.value = s.user.id
  arena = useArena(client, collection.dex.engageables, collection.dex.consumedKeys)
  try {
    await client.checkAccess()
  } catch (e) {
    connectError.value = e.kind
    connecting.value = false
    return
  }
  await collection.load(client)
  await arena.load()
  reporterLesPertes()
  connecting.value = false
  if (collection.error.value) { connectError.value = collection.error.value; return }
  connected.value = true
  // Les duels résolus pendant l'absence, puis la saison close s'il y en a une : sans attendre,
  // pour ne pas retarder l'arrivée sur la planche.
  rattraperLesDuels().then(annoncerLaSaison)
  // Un rechargement pendant une recherche ne la coupe plus : on reprend son suivi.
  const since = pendingSync()
  if (since) collection.refresh({ resumeSince: since })
  // Sans `await` : les succès ne retardent jamais l'arrivée sur la planche.
  achievements.load(client, collectionData)
}

/**
 * Engager et relever passent par le serveur, qui décide seul. On rouvre ensuite la collection
 * en même temps que l'arène : un duel gagné peut avoir détruit un exemplaire, et la planche
 * doit le refléter sans qu'on ait à recharger la page.
 */
async function playArena(fn) {
  avis.value = null
  avisBon.value = false
  arenaBusy.value = true
  try {
    const duel = await fn()
    // Le duel vient peut-être de détruire un exemplaire : la planche doit cesser de le compter
    // avant même que la collection ne se relise.
    reporterLesPertes()
    // Poster un défi ne produit aucun duel : il reste ouvert jusqu'à ce que quelqu'un le
    // relève. Il faut néanmoins que quelque chose se passe à l'écran — une action qui réussit
    // en silence se lit comme un bouton mort. On ouvre donc l'arène, où le défi en attente est
    // rappelé, plutôt qu'un résumé de combat qui n'a pas eu lieu.
    if (duel) {
      duelShown.value = duel
      // Vu à l'instant : sans ça, le duel qu'on vient de jouer se rejouerait à la connexion
      // suivante, au milieu de ceux qu'on a réellement manqués.
      await marquerVu(duel.id)
      router.go('collection')
    } else {
      router.go('duels')
    }
  } catch (e) {
    signaler(e)
  } finally {
    arenaBusy.value = false
  }

  /**
   * La collecte est lancée APRÈS avoir rendu la main, et sans être attendue.
   *
   * Elle déclenche un vrai run de l'Action et sonde jusqu'à trente secondes — c'est ce qu'il
   * faut pour qu'un pli gagné se matérialise. Attendue à l'intérieur du verrou, elle laissait
   * l'arène gelée tout ce temps : on postait un défi, et pendant une demi-minute plus aucun
   * bouton ne répondait, sans que rien ne l'explique. On croyait l'application cassée.
   *
   * Le pli n'arrive de toute façon pas plus vite parce qu'on attend. Le compteur de plis et la
   * planche se mettront à jour quand la collecte aura répondu, et le bouton de synchronisation
   * signale déjà qu'elle travaille.
   */
  /**
   * Et l'on signale le pli quand il arrive, s'il arrive.
   *
   * Le duel promet un pli au vainqueur, mais la collecte met du temps à le matérialiser : sans
   * ce mot, on referme le résumé de combat et il ne se passe plus rien — la promesse se tient
   * en silence, une demi-minute plus tard, alors qu'on regarde ailleurs.
   */
  const avantPlis = collection.dex.pending.value.length
  collection.refresh()
    .then(() => {
      const arrives = collection.dex.pending.value.length - avantPlis
      if (arrives > 0) {
        avisBon.value = true
        avis.value = arrives > 1
          ? `${arrives} cartes t’attendent dans ta collection.`
          : 'Ta carte t’attend dans ta collection.'
      }
    })
    .catch(() => { /* signalée par l'indicateur de synchronisation */ })
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
  router.go('duels')
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
  avis.value = null
  avisBon.value = false
  arenaBusy.value = true
  try {
    const id = await arena.buy(slug)
    await collection.refresh()
    const achete = collection.dex.pending.value.find((e) => e.key === entryKey('boutique', id))
    achievements.check(nowDay())
    if (achete) { router.go('collection'); showPacket(achete) }
  } catch (e) {
    signaler(e)
  } finally {
    arenaBusy.value = false
  }
}

/**
 * Vendre le surplus choisi. Le total vient du SERVEUR, jamais du total affiché : c'est lui qui a
 * débité, et c'est son chiffre qu'on annonce.
 */
async function onSell(keys) {
  avis.value = null
  avisBon.value = false
  arenaBusy.value = true
  try {
    const out = await arena.sell(keys)
    // Pas de `collection.refresh()` ici : une vente ne touche à aucune capture — la ligne reste,
    // avec ses bonbons et son espèce. Seul change ce qui a QUITTÉ le stock, que l'arène vient de
    // relire. Rappeler la collecte ferait attendre trente secondes pour rien, exactement comme
    // au premier engagement.
    collection.partis.value = arena.gone.value
    achievements.check(nowDay())
    const n = out?.sold ?? keys.length
    avis.value = `${n} exemplaire${n > 1 ? 's vendus' : ' vendu'}, ${out?.total ?? 0} ₽ en caisse.`
    avisBon.value = true
  } catch (e) {
    signaler(e)
  } finally {
    arenaBusy.value = false
  }
}

async function refreshIdentities() {
  const u = await freshUser()
  if (u) identities.value = identitiesOf(u)
}

async function onUnlink(provider) {
  if (await unlink(provider)) await refreshIdentities()
}

function disconnect() {
  signOut()
  settingsOpen.value = false
  connected.value = false
  connectError.value = null
}

onMounted(async () => {
  if (isDemo) {
    const { loadDemoClient } = await import('./fixtures/demo.js')
    accountName.value = 'démo'
    client = loadDemoClient()
    dataClient.value = client
    demo.value = true
    userId.value = 'demo-moi'
    arena = useArena(client, collection.dex.engageables, collection.dex.consumedKeys, FIRST_SEASON)
    await collection.load(client)
    await arena.load()
    reporterLesPertes()
    connected.value = true
    achievements.load(client, collectionData)
    await rattraperLesDuels()
    await annoncerLaSaison()
  }
})

// OAuth GitHub redirige la page entière puis revient : pas d'appel ponctuel possible au montage,
// il faut réagir à l'arrivée tardive de la session (retour de redirection ou session déjà active).
watch(
  () => [ready.value, session.value],
  ([isReady, s]) => {
    // `connecting` : Supabase émet plusieurs événements d'auth au démarrage (session initiale,
    // jeton rafraîchi), chacun remplace `session` — sans ce garde, chacun relançait un
    // chargement complet en parallèle du premier.
    if (!isReady || connected.value || connecting.value) return
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

// Le rituel émet `claim` à la révélation. On attend l'écriture : un succès ne tombe que sur
// une carte vraiment ouverte.
async function onClaim(key) {
  await collection.claim(key)
  if (!collection.error.value) achievements.check(nowDay())
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
  // Après la cérémonie, pas pendant : le toast ne doit pas la couvrir.
  achievements.check(nowDay())
}

const overlayOpen = computed(() =>
  Boolean(ritualEntry.value || evoAnim.value || selected.value || settingsOpen.value || recap.value || seasonRecap.value),
)

// Priorité calquée sur l'empilement visuel donné par les z-index de styles.css :
// évolution (70), rituel (60), puis réglages et fiche (40). Fermer le rituel conserve
// les plis restants, comme le fait déjà sa croix.
function closeTopOverlay() {
  if (evoAnim.value) finishEvo()
  else if (ritualEntry.value) ritualEntry.value = null
  else if (settingsOpen.value) settingsOpen.value = false
  else if (recap.value) closeRecap()
  else if (seasonRecap.value) closeSeasonRecap()
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
  // Seul état sans bouton principal à focaliser : la planche au repos. `openRitual` laisse
  // `ritualEntry` à null quand la file est vide — rien à cas-particulariser ici. Depuis Équipe
  // ou Mes stats, on regarde les autres ou ses chiffres : un rituel qui surgit y serait un accident.
  onSpace: () => { if (view.value === 'collection') openRitual() },
  onEscape: closeTopOverlay,
})
</script>

<template>
  <div v-if="!connected && restoring" class="booting" aria-busy="true"></div>
  <ConnectScreen
    v-else-if="!connected"
    :error="connectError" :busy="connecting"
    @connect="signIn"
  />

  <template v-else>

    <TheRail
      :caught-count="collection.dex.caughtCount.value"
      :pending-count="collection.dex.pending.value.length"
      :syncing="collection.loading.value" :sync-error="collection.error.value"
      :view="view" :theme="theme"
      @open="openRitual" @settings="settingsOpen = true" @sync="collection.refresh"
      @navigate="(v) => router.go(v)" @toggle-theme="toggleTheme"
      :achievements-badge="achievements.unannounced.value.length"
    />
    <SlackInvite v-if="view === 'collection' && showSlackInvite" @link="link(SLACK)" @dismiss="invite.dismiss" />
    <TheTray
      v-if="route.name === 'collection'"
      :by-species="collection.dex.bySpecies.value" :available="availableById" :evolvable="collection.dex.evolvableIds.value"
      :active-tiers="filters.activeTiers.value" :status-filter="filters.statusFilter.value"
      :query="filters.query.value" :gen="gen" :gen2="false"
      @select="(id) => router.go('collection', id)"
      @toggle-tier="filters.toggleTier" @set-status-filter="filters.setStatusFilter"
      @set-query="filters.setQuery" @reset-filters="filters.reset"
      @set-gen="gen = $event"
    />
    <!-- Sans client, rien à lire : la démo se charge d'un `import()` dynamique, et un clic sur
         un onglet pendant ce temps ne doit pas monter une vue qui planterait sur `null`. -->
    <BoardsView
      v-if="boardsOpen && dataClient"
      :client="dataClient" :today="today" :user-id="userId"
      :leaderboard="arena ? arena.leaderboard.value : []"
      :season="arena ? arena.season.value : ''" :arena-open="areneOuverte && !!arena"
      :last-season="lastSeason"
      @profile="(p) => router.go('profile', p)" @me="router.go('moi')"
    />

    <MeView
      v-if="meOpen && dataClient"
      :client="dataClient" :today="today" :user-id="userId"
      :prive="fichePrivee" :fiche="fiche" :seasons="arena ? arena.seasons.value : []"
      :points="monRang.points" :rank="monRang.rang"
      :season="arena ? arena.season.value : ''" :arena-open="areneOuverte && !!arena"
    />

    <AchievementsView
      v-if="view === 'succes'"
      :owned="achievements.owned.value" :counts="achievements.counts.value" :progress="achievements.progress.value"
      :ready="achievements.ready.value" :error="achievements.error.value"
      :focus="achievementFocus" :arena-open="areneOuverte"
      @retry="achievements.load(dataClient, collectionData)"
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
        :arena-form-of="arena && areneOuverte ? arena.formOfKey : null"
        :arena-open="areneOuverte && !!arena"
        @close="router.go('collection')" @evolve="onEvolve" @engage="onEngageFromSheet"
        @sell="onSell"
      />
    </transition>

    <transition name="fade">
      <RitualOverlay
        v-if="ritualEntry" :key="ritualEntry.key" :entry="ritualEntry"
        :remaining="ritualRemaining" :is-new="ritualIsNew"
        @claim="onClaim" @next="nextRitual"
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
      v-if="duelsOpen && arena && areneOuverte"
      :credits="arena.credits.value" :pokedollars="arena.pokedollars.value"
      :challenges="arena.challenges.value" :engageable="arena.engageable.value"
      :my-open="arena.myOpen.value" :level-of="arena.levelOf"
      :form-of-key="arena.formOfKey" :busy="arenaBusy"
      :preselect="arenaPreselect"
      @engage="onEngage" @accept="onAccept" @navigate="(v) => router.go(v)"
    >
      <DuelHistory
        v-if="client?.readDuelHistory" :load="client.readDuelHistory" :user-id="userId"
        :version="arena.recentDuels.value"
      />
    </ArenaPanel>

    <ShopPanel
      v-if="shopOpen && arena && areneOuverte"
      :pokedollars="arena.pokedollars.value" :shop="arena.shop.value" :busy="arenaBusy"
      :tab="route.param === 'revente' ? 'revente' : 'acheter'"
      :sale-count="surplus.reduce((n, g) => n + g.items.length - 1, 0)"
      @buy="onBuy" @tab="(t) => router.go('shop', t === 'revente' ? 'revente' : null)"
    >
      <SaleSection :groups="surplus" :busy="arenaBusy" @sell="onSell" />
    </ShopPanel>

    <ProfilePanel
      v-if="profileOpen"
      :fiche="fiche" :cherche="route.param"
      :seasons="arena ? arena.seasons.value : []"
      :points="arena ? (arena.leaderboard.value.find((l) => l.user_id === (fiche?.user_id ?? userId))?.points ?? 0) : 0"
      :season="arena ? arena.season.value : ''"
      :loading="!ficheChargee" :introuvable="ficheChargee && !fiche"
    />

    <transition name="fade">
      <DuelOverlay
        v-if="duelShown" :key="duelShown.id" :duel="duelShown" :user-id="userId"
        @close="montrerSuivant"
      />
    </transition>

    <transition name="fade">
      <SettingsPanel
        v-if="settingsOpen" :account-name="accountName" :identities="identities"
        :manageable="!isDemo" :account-error="authError"
        @close="settingsOpen = false" @disconnect="disconnect" @link="link" @unlink="onUnlink"
      />
    </transition>

    <!-- Après les duels manqués : on découvre d'abord ce qu'on a perdu ou gagné, puis la saison. -->
    <transition name="fade">
      <SeasonRecap
        v-if="seasonRecap && !duelShown" :recap="seasonRecap" :user-id="userId"
        :current="arena ? arena.season.value : ''" @close="closeSeasonRecap"
      />
    </transition>
    <!--
      Les messages passagers, en bas de l'écran et au-dessus des fenêtres : le résultat d'un
      geste (vente, refus du serveur, carte arrivée) s'affiche là où l'on regarde, même quand
      on a fait défiler la page ou qu'un duel est ouvert. Ils s'empilent au lieu de se couvrir,
      et remontent au-dessus de la barre de vente quand elle est à l'écran.
    -->
    <div class="toast-pile" :class="{ 'sur-vente': shopOpen && route.param === 'revente' }">
      <NoticeToast :message="avis" :good="avisBon" @dismiss="avis = null" />
      <SyncToast :sync="collection.sync.value" @open="collection.dismissSync(); openRitual()" @dismiss="collection.dismissSync" />
    </div>

    <transition name="fade">
      <AchievementRecap v-if="recap" :items="recap.items" :first="recap.first" @close="closeRecap" />
    </transition>

    <AchievementToasts :toasts="achievements.toasts.value" :counts="achievements.counts.value" @dismiss="achievements.dismissToast" @open="openAchievement" />
  </template>
</template>
