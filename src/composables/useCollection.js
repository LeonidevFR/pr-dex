import { ref } from 'vue'
import { useDex } from './useDex.js'
import { DEX } from '../../shared/species.js'
import { entryKey } from '../../shared/entry.js'

const clone = (o) => JSON.parse(JSON.stringify(o))

/**
 * Porte les effets de bord : chargement, réclamation d'une capture, évolution.
 * Chaque mutation est appliquée en mémoire, écrite, et défaite si l'écriture échoue.
 */
export function useCollection() {
  const catches = ref([])
  const state = ref({ claimed: [], spent: {}, evolutions: [], seenDuels: [] })
  const blobSha = ref(null)
  const error = ref(null)
  const loading = ref(false)
  let client = null

  /**
   * Les exemplaires perdus à l'arène. La collection ne les connaît pas d'elle-même — ils vivent
   * dans `arena_exemplars`, que seul `useArena` lit — donc c'est l'application qui les verse
   * ici. Vide tant que l'arène n'est pas chargée : mieux vaut afficher un exemplaire de trop
   * pendant une seconde que d'en cacher un qui existe.
   */
  const destroyed = ref(new Set())

  /**
   * Les évolutions, telles que le serveur les tient. Elles vivaient dans `state.evolutions`,
   * que ce composable réécrivait en entier à chaque évolution : le serveur ne les inspectait
   * pas et ne pouvait donc rien valider. Il les écrit désormais, et le front les lit.
   */
  const evolutions = ref([])

  const dex = useDex(catches, state, destroyed, evolutions)

  async function load(githubClient) {
    client = githubClient ?? client
    loading.value = true
    error.value = null
    try {
      const [c, s, evos] = await Promise.all([
        client.readCatches(), client.readState(),
        client.readEvolutions ? client.readEvolutions() : [],
      ])
      catches.value = c
      state.value = s.state
      evolutions.value = evos ?? []
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
        try {
          const fresh = await client.readState()
          blobSha.value = fresh.blobSha
          const replayed = mutate(clone(fresh.state))
          if (!replayed) { state.value = fresh.state; return false }
          state.value = replayed
          const r = await client.writeState(replayed, blobSha.value, message)
          blobSha.value = r.blobSha
          error.value = null
          return true
        } catch (e2) {
          state.value = before
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
   * Retient qu'un duel a déjà été montré. Sans cette mémoire, la cérémonie d'un duel résolu par
   * la maison se rejouerait à chaque visite — la première fois on apprend quelque chose, la
   * dixième on ferme l'application.
   *
   * `seenDuels` peut manquer sur un état écrit avant son existence : on le recrée plutôt que de
   * planter sur un ancien blob.
   */
  async function markDuelSeen(id) {
    await persist((s) => {
      const vus = s.seenDuels ?? []
      return vus.includes(id) ? null : { ...s, seenDuels: [...vus, id] }
    }, `duel vu ${id}`)
  }

  /**
   * Fait évoluer un exemplaire précis. Toute la validation appartient au serveur — propriété,
   * disponibilité, lignée, bonbons — et il n'y a plus rien à revalider ici : la course entre
   * deux appareils qui obligeait à rejouer le calcul sur l'état frais n'existe plus, l'unicité
   * `(user_id, from_key)` et le verrou de ligne s'en chargent en base.
   *
   * Rend l'identifiant de l'évolution, ou `false` si elle a été refusée.
   */
  async function evolve(fromId, toId, specimenKey, date) {
    error.value = null
    const source = DEX[fromId]
    if (!source?.to) return false
    const targets = Array.isArray(source.to) ? source.to : [source.to]
    if (!targets.includes(toId)) return false

    try {
      const id = await client.evolve(specimenKey, toId, date)
      // Relire plutôt que déduire : le serveur vient d'écrire, c'est lui qui sait ce qu'il a
      // écrit — et notamment l'identifiant qui devient la clé du Pokémon obtenu.
      evolutions.value = await client.readEvolutions()
      return id
    } catch (e) {
      // Un refus du serveur n'est pas une panne : bonbons manquants ou exemplaire déjà
      // consommé se lisent comme « rien à faire », exactement comme l'ancien mutateur sans objet.
      if (e?.message && /bonbons|déjà évolué|détruit|engagé|inconnu/.test(e.message)) return false
      error.value = e.kind ?? 'server'
      return false
    }
  }

  return {
    catches, state, error, loading, dex, destroyed, evolutions,
    load, refresh, claim, evolve, markDuelSeen,
  }
}
