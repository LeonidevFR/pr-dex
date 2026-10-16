import { ref } from 'vue'
import { useDex } from './useDex.js'
import { DEX, familyOf, CANDY_PER_CATCH } from '../../shared/species.js'
import { entryKey } from '../../shared/entry.js'
import { rememberSync, forgetSync } from '../lib/syncMemory.js'

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
  // Message du bouton ⟳ : `{ phase: 'waiting' | 'running' }` pendant la capture, puis
  // `{ phase: 'found', count }` ou `{ phase: 'failed' }`, ou null quand il n'y a rien à dire.
  const sync = ref(null)
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
   *
   * Renvoie `true` si une écriture a effectivement eu lieu (premier essai ou rejeu après
   * conflit), `false` sinon (mutateur sans objet, ou état distant adopté sans réécrire) —
   * pour permettre à l'appelant de distinguer "rien à faire" de "erreur", cas tous deux
   * silencieux du point de vue de `error.value`.
   */
  async function persist(mutate, message) {
    const before = clone(state.value)
    const next = mutate(clone(state.value))
    if (!next) return false
    state.value = next
    try {
      const r = await client.writeState(next, blobSha.value, message)
      blobSha.value = r.blobSha
      error.value = null
      return true
    } catch (e) {
      if (e.kind === 'conflict') {
        // État de repli si le rejeu échoue. Tant que la relecture n'a pas abouti, c'est l'état
        // d'avant l'appel ; ensuite c'est l'état frais, parce que `blobSha` est déjà le sien.
        // Revenir à `before` sous ce jeton ferait passer l'écriture suivante, qui effacerait
        // ce que l'autre appareil a écrit.
        let fallback = before
        try {
          const fresh = await client.readState()
          blobSha.value = fresh.blobSha
          fallback = fresh.state
          const replayed = mutate(clone(fresh.state))
          if (!replayed) { state.value = fresh.state; return false }
          state.value = replayed
          const r = await client.writeState(replayed, blobSha.value, message)
          blobSha.value = r.blobSha
          error.value = null
          return true
        } catch (e2) {
          state.value = fallback
          error.value = e2.kind ?? 'server'
          return false
        }
      }
      state.value = before
      error.value = e.kind ?? 'server'
      return false
    }
  }

  const REFRESH_POLL_MS = 5000
  // ~2 min. Un run de l'Action dure de 40 s à 80 s une fois déclenché (mesuré sur pr-dex-data
  // en octobre 2026) : la fenêtre de 30 s d'avant abandonnait avant que la capture n'arrive, et
  // le compteur restait figé jusqu'au rechargement de la page.
  const REFRESH_ATTEMPTS = 24
  // Suivi de la capture côté GitHub : toutes les 4 s, pendant 3 min au plus.
  const STATUS_POLL_MS = 4000
  const STATUS_ATTEMPTS = 45
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  async function reread() {
    const [c, s] = await Promise.all([client.readCatches(), client.readState()])
    catches.value = c
    state.value = s.state
    blobSha.value = s.blobSha
  }

  /**
   * Suit la capture lancée depuis `since` par la fonction `catch-status` : rend `success`,
   * `failure`, ou `timeout` au bout de 3 min. Elle seule sait qu'une capture est finie quand
   * elle n'a rien trouvé ; sans elle, le front attendait deux minutes pour rien.
   */
  async function followRun(since) {
    for (let attempt = 0; attempt < STATUS_ATTEMPTS; attempt++) {
      if (attempt > 0) await wait(STATUS_POLL_MS)
      const status = await client.catchStatus(since)
      if (status === 'success' || status === 'failure') return status
      sync.value = { phase: status === 'running' ? 'running' : 'waiting' }
    }
    return 'timeout'
  }

  /**
   * Repli quand le suivi est indisponible (fonction pas encore déployée) : relire les cartes à
   * intervalles jusqu'à en voir une nouvelle, ou abandonner au bout de ~2 min.
   */
  async function pollCards(before) {
    for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
      if (attempt > 0) await wait(REFRESH_POLL_MS)
      await reread()
      if (catches.value.length !== before) return
    }
  }

  /**
   * Déclenche l'Action de capture, puis suit son avancement jusqu'aux nouvelles cartes. Le
   * déclenchement passe par une fonction Edge Supabase : le front n'a jamais de jeton GitHub
   * capable d'écrire quoi que ce soit, seulement sa session Supabase habituelle.
   *
   * Le déclenchement ne confirme que la réception de la demande par GitHub, pas la fin du run.
   * `sync` dit donc au joueur que ça arrive tout seul : sans ça, il rechargeait la page en
   * boucle, ce qui coupait justement l'attente. L'heure du clic est gardée (`rememberSync`) :
   * après un rechargement, `refresh({ resumeSince })` reprend le suivi sans relancer de capture.
   */
  async function refresh({ resumeSince = null } = {}) {
    loading.value = true
    error.value = null
    const since = resumeSince ?? new Date().toISOString()
    const before = catches.value.length
    try {
      if (!resumeSince) {
        rememberSync(since)
        await client.triggerCatch()
      }
      sync.value = { phase: 'waiting' }
      let outcome = null
      if (client.catchStatus) {
        try {
          outcome = await followRun(since)
        } catch {
          outcome = null
        }
      }
      if (outcome === null) await pollCards(before)
      else await reread()
      const found = catches.value.length - before
      sync.value = outcome === 'failure' ? { phase: 'failed' } : found > 0 ? { phase: 'found', count: found } : null
    } catch (e) {
      error.value = e.kind ?? 'server'
      sync.value = null
    } finally {
      loading.value = false
      forgetSync()
    }
  }

  const dismissSync = () => { sync.value = null }

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
   * Exemplaires disponibles de `fromId` sur un état `s` donné (pas nécessairement `state.value`
   * — `persist` rejoue ce calcul sur l'état frais après un conflit). Réplique volontairement la
   * logique de `useDex` (clé, exemplaires consommés) sur un objet simple plutôt que sur des refs,
   * `s` n'étant qu'un clone en cours de mutation. Le choix de l'exemplaire précis revient au
   * joueur (`specimenKey` dans `evolve`) : cette fonction énumère, elle ne priorise rien.
   */
  function availableFor(fromId, s) {
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
    return [...claimedEntries, ...evolvedEntries]
      .filter((c) => c.species === fromId && !consumed.has(c.key))
  }

  async function evolve(fromId, toId, specimenKey, date) {
    error.value = null
    const source = DEX[fromId]
    if (!source?.to) return false
    const targets = Array.isArray(source.to) ? source.to : [source.to]
    if (!targets.includes(toId)) return false
    if (!dex.canEvolve(fromId)) return false

    const fam = familyOf(fromId)
    return await persist(
      (s) => {
        // Revalidation sur l'état reçu, et non sur l'état d'avant l'appel : `persist` rejoue
        // ce mutateur sur l'état frais après un conflit. Sans ce recalcul, deux appareils
        // dépensent les mêmes bonbons, ou évoluent le même dernier exemplaire, et l'un des
        // deux devrait échouer plutôt que de passer en double. Si la clé demandée n'est plus
        // disponible sur l'état frais (déjà consommée par l'autre appareil), le mutateur
        // devient sans objet — même traitement que des bonbons insuffisants, sans repli
        // automatique sur un autre exemplaire.
        const claimedKeys = new Set(s.claimed)
        const earned = catches.value.filter(
          (c) => claimedKeys.has(entryKey(c.source, c.external_id)) && familyOf(c.species) === fam,
        ).length * CANDY_PER_CATCH
        if (earned - (s.spent[fam] ?? 0) < source.cost) return null

        const picked = availableFor(fromId, s).find((c) => c.key === specimenKey)
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

  return { catches, state, error, loading, sync, dex, load, refresh, dismissSync, claim, evolve }
}
