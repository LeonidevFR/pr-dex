import { ref } from 'vue'
import { useDex } from './useDex.js'
import { DEX, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'

const clone = (o) => JSON.parse(JSON.stringify(o))

/**
 * Porte les effets de bord : chargement, réclamation d'une capture, évolution.
 * Chaque mutation est appliquée en mémoire, écrite, et défaite si l'écriture échoue.
 */
export function useCollection() {
  const catches = ref([])
  const state = ref({ claimed: [], spent: {}, evolutions: [] })
  const blobSha = ref(null)
  const error = ref(null)
  const loading = ref(false)
  let client = null

  const dex = useDex(catches, state)

  async function load(githubClient) {
    client = githubClient ?? client
    loading.value = true
    error.value = null
    try {
      const [c, s] = await Promise.all([client.readCatches(), client.readState()])
      catches.value = c
      state.value = s.state
      blobSha.value = s.blobSha
    } catch (e) {
      error.value = e.kind ?? 'server'
    } finally {
      loading.value = false
    }
  }

  /**
   * Écrit `next`, en rejouant `mutate` une fois sur l'état frais si GitHub signale un conflit.
   * Le conflit ne survient qu'entre deux appareils du même utilisateur : rejeu silencieux,
   * jamais un message d'erreur — sauf si le second essai échoue lui aussi.
   *
   * `mutate` renvoie `null` quand l'opération est devenue sans objet sur l'état frais
   * (l'autre appareil l'a déjà faite) : on adopte alors l'état distant sans réécrire.
   */
  async function persist(mutate, message) {
    const before = clone(state.value)
    const next = mutate(clone(state.value))
    if (!next) return
    state.value = next
    try {
      const r = await client.writeState(next, blobSha.value, message)
      blobSha.value = r.blobSha
      error.value = null
    } catch (e) {
      if (e.kind === 'conflict') {
        try {
          const fresh = await client.readState()
          blobSha.value = fresh.blobSha
          const replayed = mutate(clone(fresh.state))
          if (!replayed) { state.value = fresh.state; return }
          state.value = replayed
          const r = await client.writeState(replayed, blobSha.value, message)
          blobSha.value = r.blobSha
          error.value = null
          return
        } catch (e2) {
          state.value = before
          error.value = e2.kind ?? 'server'
          return
        }
      }
      state.value = before
      error.value = e.kind ?? 'server'
    }
  }

  /**
   * Recharge captures et état sur le client déjà connu — le workflow tourne à l'heure (cron
   * 8h-19h) et l'utilisateur peut vouloir vérifier tout de suite après avoir mergé une PR,
   * sans attendre. Simple relecture : aucune écriture, ne déclenche jamais l'Action elle-même.
   */
  function refresh() {
    return load()
  }

  /** Marque une capture comme ouverte. Idempotent : rejouer un claim ne duplique rien. */
  async function claim(sha) {
    error.value = null
    if (state.value.claimed.includes(sha)) return
    await persist(
      (s) => (s.claimed.includes(sha) ? null : { ...s, claimed: [...s.claimed, sha] }),
      `claim ${sha.slice(0, 7)}`,
    )
  }

  async function evolve(fromId, toId, date) {
    error.value = null
    const source = DEX[fromId]
    if (!source?.to) return
    const targets = Array.isArray(source.to) ? source.to : [source.to]
    if (!targets.includes(toId)) return
    if (!dex.canEvolve(fromId)) return

    // On enregistre QUELLE capture évolue, pas seulement son espèce : sans ça, deux captures
    // de la même espèce dont une chromatique rendent l'héritage du shiny indécidable.
    // À défaut de choix explicite, une capture chromatique est privilégiée — perdre un shiny
    // à l'évolution se lirait comme un bug.
    const candidates = dex.bySpecies.value[fromId] ?? []
    const picked = candidates.find((c) => c.shiny) ?? candidates[0]

    const fam = familyOf(fromId)
    await persist(
      (s) => {
        // Revalidation sur l'état reçu, et non sur l'état d'avant l'appel : `persist` rejoue
        // ce mutateur sur l'état frais après un conflit. Sans ce recalcul, deux appareils
        // dépensent les mêmes bonbons et le solde passe sous zéro.
        const claimedSha = new Set(s.claimed)
        const earned = catches.value.filter(
          (c) => claimedSha.has(c.sha) && familyOf(c.species) === fam,
        ).length * CANDY_PER_CATCH
        if (earned - (s.spent[fam] ?? 0) < source.cost) return null

        return {
          ...s,
          spent: { ...s.spent, [fam]: (s.spent[fam] ?? 0) + source.cost },
          evolutions: [...s.evolutions, { species: toId, from: fromId, fromSha: picked?.sha ?? null, date }],
        }
      },
      `evolve ${source.name} → ${DEX[toId].name}`,
    )
  }

  return { catches, state, error, loading, dex, load, refresh, claim, evolve }
}
