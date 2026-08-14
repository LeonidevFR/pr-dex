import { computed, ref } from 'vue'
import { formOf, parisDay } from '../../shared/battle.js'
import { seasonOf } from '../../shared/arena-economy.js'

/**
 * L'état d'arène du joueur et les effets qui le modifient.
 *
 * Séparé de `useCollection` à dessein : la collection se dérive de données que le joueur écrit
 * lui-même, l'arène de données qu'il ne peut qu'appeler. Mêler les deux ferait croire qu'on
 * peut corriger un niveau ou un portefeuille en mémoire comme on corrige un état local.
 *
 * @param {Object} client — le client Supabase de `createSupabaseClient`
 * @param {import('vue').Ref<Array>} claimed — les exemplaires ouverts, source de ce qu'on peut engager
 */
export function useArena(client, claimed, consumed = computed(() => new Set())) {
  const credits = ref(0)
  const pokedollars = ref(0)
  const exemplars = ref([])
  const challenges = ref([])
  const shop = ref([])
  const leaderboard = ref([])
  const seasons = ref([])
  const season = ref(seasonOf())
  const myOpen = ref(null)
  /** Les duels résolus récents, pour repérer ceux qui se sont joués sans nous. */
  const recentDuels = ref([])
  const loading = ref(false)
  const error = ref(null)

  const levels = computed(() =>
    Object.fromEntries(exemplars.value.map((e) => [e.entry_key, e.level])))

  const destroyed = computed(() =>
    new Set(exemplars.value.filter((e) => e.destroyed_at).map((e) => e.entry_key)))

  /**
   * Ce qu'on peut engager maintenant : tout exemplaire ouvert, sauf ceux qu'un duel a détruits,
   * ceux qu'une évolution a consommés, et celui qui est déjà sur la table. Un exemplaire engagé
   * reste visible dans la collection — il n'est pas perdu, il est immobilisé — mais l'arène
   * doit le refuser.
   *
   * Les consommés manquaient, et le trou était l'exact miroir du précédent : la ligne `catches`
   * d'un exemplaire évolué subsiste, donc le serveur l'accepte encore. On pouvait faire évoluer
   * son Pikachu puis engager le Pikachu disparu — un duel sans rien à perdre, puisque
   * l'exemplaire n'était déjà plus là. Le serveur ne peut pas s'en défendre seul : les
   * évolutions vivent dans l'état du joueur, qu'il n'inspecte pas.
   */
  const engageable = computed(() => claimed.value.filter((c) =>
    !destroyed.value.has(c.key)
    && !consumed.value.has(c.key)
    && c.key !== myOpen.value?.challenger_key))

  const levelOf = (key) => levels.value[key] ?? 1

  /**
   * La forme du jour d'un exemplaire. Elle entre dans le calcul de puissance au même titre que
   * le niveau, et le joueur doit la voir avant de choisir : engager son champion un jour où il
   * est épuisé, sans l'avoir su, c'est perdre sans comprendre.
   *
   * Calculée ici comme côté serveur, à partir de la clé et de la date — jamais stockée. Et sur
   * la date de PARIS, celle que le serveur emploie : prendre celle du navigateur montrerait à
   * qui joue tard une forme que le duel n'appliquerait pas.
   */
  const formOfKey = (key) => formOf(key, parisDay())

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [arena, open, mien, articles, classement, closes, duels] = await Promise.all([
        client.readArena(), client.readOpenChallenges(), client.readMyOpen(), client.readShop(),
        client.readLeaderboard(season.value), client.readSeasons(),
        // Optionnel : un client de démonstration ancien peut ne pas l'avoir, et l'absence de
        // duels récents ne doit pas empêcher l'arène entière de se charger.
        client.readMyDuels ? client.readMyDuels() : [],
      ])
      recentDuels.value = duels ?? []
      shop.value = articles ?? []
      leaderboard.value = classement ?? []
      seasons.value = closes ?? []
      credits.value = arena.credits
      pokedollars.value = arena.pokedollars
      exemplars.value = arena.exemplars
      challenges.value = open
      // L'espèce ne figure pas dans un duel ouvert — elle n'y est écrite qu'à la résolution.
      // On la retrouve dans sa propre collection, la seule qu'on ait le droit de lire.
      myOpen.value = mien
        ? { ...mien, species: claimed.value.find((c) => c.key === mien.challenger_key)?.species }
        : null
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  /**
   * Engager, puis relire — jamais deviner. Le serveur décide du vainqueur, des niveaux et des
   * gains ; réappliquer sa décision en mémoire, c'est se donner deux sources de vérité pour un
   * seul fait, et découvrir un jour qu'elles divergent.
   */
  async function engage(entryKey, vsComputer = false) {
    const id = await client.engage(entryKey, vsComputer)
    const duel = await client.readDuel(id)
    await load()
    return duel
  }

  /**
   * Acheter, puis relire. Le pli n'arrive pas tout de suite : la base enregistre qu'il est dû,
   * et c'est l'Action qui lui donne un visage au passage suivant. Le portefeuille, lui, est
   * débité immédiatement — d'où la relecture, sans laquelle l'écran afficherait encore l'ancien
   * solde et laisserait racheter ce qu'on ne peut plus payer.
   */
  /** Rend l'identifiant du pli acheté : l'appelant en a besoin pour l'ouvrir tout de suite. */
  async function buy(slug) {
    const id = await client.buy(slug)
    await load()
    return id
  }

  async function accept(duelId, entryKey) {
    const id = await client.accept(duelId, entryKey)
    const duel = await client.readDuel(id)
    await load()
    return duel
  }

  return {
    credits, pokedollars, exemplars, challenges, shop, leaderboard, seasons, season, myOpen, loading, error,
    levels, destroyed, engageable, levelOf, formOfKey, recentDuels, load, engage, accept, buy,
  }
}
