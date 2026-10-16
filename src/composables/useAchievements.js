import { ref, computed } from 'vue'
import { evaluate, BY_CODE } from '../lib/achievements.js'

/**
 * Les succès du joueur : ce que la table `achievements` a déjà, ce que ses données remplissent,
 * et la différence à écrire. Les règles vivent dans `lib/achievements.js` ; ici, seulement
 * quand on les applique et ce qu'on en montre.
 *
 * Rien ici ne bloque le jeu. Une lecture qui échoue laisse l'erreur à l'onglet ; une écriture
 * qui échoue est rattrapée au chargement suivant, sans toast, par le récap.
 */
export function useAchievements() {
  const owned = ref({})
  const counts = ref({})
  const progress = ref({})
  const toasts = ref([])
  const ready = ref(false)
  const error = ref(null)
  let client = null
  let read = null
  let others = []
  let toastSeq = 0
  // Les codes remplis à l'évaluation précédente. Seul ce qui manquait la fois d'avant vient
  // d'être débloqué par le geste : le reste est un arriéré (écriture ratée, autre onglet), qui
  // s'inscrit en silence, à sa date, et passe par le récap.
  let lastUnlocked = new Set()
  // Lu au chargement : aucun succès n'avait encore été montré. Un retournement annoncé avant
  // la visite de l'onglet ne fait pas du récap de lancement un « retour après absence ».
  const firstVisit = ref(false)

  // Deux cartes retournées coup sur coup lancent deux vérifications. Sans file, la seconde
  // évalue avant que la première ait inscrit son succès, et l'annonce partirait deux fois.
  let queue = Promise.resolve()
  const enqueue = (job) => (queue = queue.then(job, job))

  /** `today` à null : rattrapage silencieux, daté de l'événement. Sinon : déblocage annoncé. */
  async function record(today) {
    const { catches, state } = read()
    const result = evaluate({ catches, claimed: state.claimed, evolutions: state.evolutions, others })
    progress.value = result.progress
    const before = lastUnlocked
    lastUnlocked = new Set(Object.keys(result.unlocked))
    const fresh = Object.entries(result.unlocked)
      .filter(([code]) => !owned.value[code])
      .map(([code, u]) => {
        const now = today !== null && !before.has(code)
        return { code, unlocked_at: now ? today : u.date, trigger_key: u.triggerKey, announced: now }
      })
    if (!fresh.length) return
    let inserted
    try {
      inserted = new Set((await client.insertAchievements(fresh)).map((r) => r.code))
    } catch {
      return
    }
    const nextOwned = { ...owned.value }
    const nextCounts = { ...counts.value }
    for (const r of fresh) {
      // Déjà en base sans que cet onglet le sache : un autre l'a inscrit, et montré.
      nextOwned[r.code] = inserted.has(r.code) ? r : { ...r, announced: true }
      if (inserted.has(r.code)) nextCounts[r.code] = (nextCounts[r.code] ?? 0) + 1
    }
    owned.value = nextOwned
    counts.value = nextCounts
    const shown = fresh.filter((r) => r.announced && inserted.has(r.code))
    toasts.value = [...toasts.value, ...shown.map((r) => ({ id: ++toastSeq, code: r.code }))]
  }

  /**
   * `readData` relit les captures et l'état à chaque appel : ce sont ceux de `useCollection`,
   * qui changent sous nos pieds à chaque retournement.
   */
  async function load(dataClient, readData) {
    client = dataClient
    read = readData
    error.value = null
    try {
      const [rows, cnt, board] = await Promise.all([
        client.readAchievements(), client.readAchievementCounts(), client.readLeaderboard(),
      ])
      // Un code inconnu vient d'un succès retiré du catalogue : il ne s'affiche plus.
      owned.value = Object.fromEntries(rows.filter((r) => BY_CODE[r.code]).map((r) => [r.code, r]))
      firstVisit.value = !rows.some((r) => r.announced)
      counts.value = Object.fromEntries(cnt.map((c) => [c.code, c.players]))
      others = board.filter((r) => !r.is_me).flatMap((r) => r.catches ?? [])
    } catch (e) {
      error.value = e.message ?? 'Les succès n’ont pas pu se charger.'
      return
    }
    ready.value = true
    await enqueue(() => record(null))
  }

  /** Après un retournement ou une évolution. Sans chargement réussi, rien à comparer. */
  function check(today) {
    if (!ready.value) return Promise.resolve()
    return enqueue(() => record(today))
  }

  const unannounced = computed(() => Object.values(owned.value).filter((r) => !r.announced))
  const isFirstRecap = computed(() => firstVisit.value)

  /**
   * Le récap a été vu. Marqué tout de suite en mémoire : si l'écriture échoue, il reviendra au
   * prochain chargement, mais pas en boucle dans la session.
   */
  async function acknowledge() {
    const codes = unannounced.value.map((r) => r.code)
    if (!codes.length) return
    firstVisit.value = false
    owned.value = Object.fromEntries(
      Object.entries(owned.value).map(([code, r]) => [code, codes.includes(code) ? { ...r, announced: true } : r]),
    )
    try {
      await client.markAnnounced(codes)
    } catch {
      // Rattrapé au prochain chargement.
    }
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { owned, counts, progress, toasts, ready, error, unannounced, isFirstRecap, load, check, acknowledge, dismissToast }
}
