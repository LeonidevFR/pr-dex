import { computed, ref } from 'vue'

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
export function useArena(client, claimed) {
  const credits = ref(0)
  const pokedollars = ref(0)
  const exemplars = ref([])
  const challenges = ref([])
  const myOpen = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const levels = computed(() =>
    Object.fromEntries(exemplars.value.map((e) => [e.entry_key, e.level])))

  const destroyed = computed(() =>
    new Set(exemplars.value.filter((e) => e.destroyed_at).map((e) => e.entry_key)))

  /**
   * Ce qu'on peut engager maintenant : tout exemplaire ouvert, sauf ceux qu'un duel a détruits
   * et celui qui est déjà sur la table. Un exemplaire engagé reste visible dans la collection —
   * il n'est pas perdu, il est immobilisé — mais l'arène doit le refuser.
   */
  const engageable = computed(() => claimed.value.filter((c) =>
    !destroyed.value.has(c.key) && c.key !== myOpen.value?.challenger_key))

  const levelOf = (key) => levels.value[key] ?? 1

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [arena, open, mien] = await Promise.all([
        client.readArena(), client.readOpenChallenges(), client.readMyOpen(),
      ])
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

  async function accept(duelId, entryKey) {
    const id = await client.accept(duelId, entryKey)
    const duel = await client.readDuel(id)
    await load()
    return duel
  }

  return {
    credits, pokedollars, exemplars, challenges, myOpen, loading, error,
    levels, destroyed, engageable, levelOf, load, engage, accept,
  }
}
