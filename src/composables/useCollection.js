import { ref } from 'vue'
import { useDex } from './useDex.js'
import { DEX, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import { entryKey } from '../../shared/entry.js'

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

  const REFRESH_POLL_MS = 5000
  const REFRESH_ATTEMPTS = 6 // ~30s : le temps qu'un run de l'Action se termine côté GitHub
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  /**
   * Déclenche l'Action de capture puis relit — pour vérifier tout de suite après avoir mergé
   * une PR, sans attendre le prochain passage du cron (8h-19h). Le déclenchement passe par une
   * fonction Edge Supabase : le front n'a jamais de jeton GitHub capable d'écrire quoi que ce
   * soit, seulement sa session Supabase habituelle.
   *
   * Le déclenchement ne confirme que la réception de la demande par GitHub, pas la fin du run.
   * Relire une seule fois juste après revoyait donc l'état d'avant — invisible pour
   * l'utilisateur, qui devait recharger la page à la main pour voir sa capture. On relit
   * plutôt à intervalles jusqu'à voir du nouveau ou abandonner ; `loading` reste vrai tout du
   * long pour que le bouton continue de signaler que ça travaille encore.
   */
  async function refresh() {
    loading.value = true
    error.value = null
    try {
      await client.triggerCatch()
      const before = catches.value.length
      for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
        if (attempt > 0) await wait(REFRESH_POLL_MS)
        const [c, s] = await Promise.all([client.readCatches(), client.readState()])
        catches.value = c
        state.value = s.state
        blobSha.value = s.blobSha
        if (c.length !== before) break
      }
    } catch (e) {
      error.value = e.kind ?? 'server'
    } finally {
      loading.value = false
    }
  }

  /** Marque une capture comme ouverte, par sa clé d'exemplaire. Idempotent : rejouer un claim ne duplique rien. */
  async function claim(key) {
    error.value = null
    if (state.value.claimed.includes(key)) return
    await persist(
      (s) => (s.claimed.includes(key) ? null : { ...s, claimed: [...s.claimed, key] }),
      `claim ${key}`,
    )
  }

  /**
   * Exemplaire disponible de `fromId` sur un état `s` donné (pas nécessairement `state.value`
   * — `persist` rejoue ce calcul sur l'état frais après un conflit). Un exemplaire chromatique
   * est privilégié : perdre un shiny à l'évolution se lirait comme un bug. Réplique volontairement
   * la logique de `useDex` (clé, exemplaires consommés) sur un objet simple plutôt que sur des
   * refs, `s` n'étant qu'un clone en cours de mutation.
   */
  function pickAvailable(fromId, s) {
    const claimedSet = new Set(s.claimed)
    const claimedEntries = catches.value
      .map((c) => ({ ...c, key: entryKey(c.source, c.external_id) }))
      .filter((c) => claimedSet.has(c.key))
    const evolvedEntries = []
    s.evolutions.forEach((e, i) => {
      const pool = [...claimedEntries, ...evolvedEntries]
      const fromKey = e.fromKey ?? e.fromSha
      const src = fromKey ? pool.find((c) => c.key === fromKey) : pool.find((c) => c.species === e.from)
      evolvedEntries.push({ species: e.species, shiny: src?.shiny ?? false, key: `evo:${i}` })
    })
    const consumed = new Set(s.evolutions.map((e) => e.fromKey ?? e.fromSha).filter(Boolean))
    const available = [...claimedEntries, ...evolvedEntries]
      .filter((c) => c.species === fromId && !consumed.has(c.key))
    return available.find((c) => c.shiny) ?? available[0]
  }

  async function evolve(fromId, toId, date) {
    error.value = null
    const source = DEX[fromId]
    if (!source?.to) return
    const targets = Array.isArray(source.to) ? source.to : [source.to]
    if (!targets.includes(toId)) return
    if (!dex.canEvolve(fromId)) return

    const fam = familyOf(fromId)
    await persist(
      (s) => {
        // Revalidation sur l'état reçu, et non sur l'état d'avant l'appel : `persist` rejoue
        // ce mutateur sur l'état frais après un conflit. Sans ce recalcul, deux appareils
        // dépensent les mêmes bonbons, ou évoluent le même dernier exemplaire, et l'un des
        // deux devrait échouer plutôt que de passer en double.
        const claimedKeys = new Set(s.claimed)
        const earned = catches.value.filter(
          (c) => claimedKeys.has(entryKey(c.source, c.external_id)) && familyOf(c.species) === fam,
        ).length * CANDY_PER_CATCH
        if (earned - (s.spent[fam] ?? 0) < source.cost) return null

        const picked = pickAvailable(fromId, s)
        if (!picked) return null

        return {
          ...s,
          spent: { ...s.spent, [fam]: (s.spent[fam] ?? 0) + source.cost },
          evolutions: [...s.evolutions, { species: toId, from: fromId, fromKey: picked.key, date }],
        }
      },
      `evolve ${source.name} → ${DEX[toId].name}`,
    )
  }

  return { catches, state, error, loading, dex, load, refresh, claim, evolve }
}
