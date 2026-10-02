import { ref, onMounted } from 'vue'

/**
 * Les lignes du classement, rechargées à chaque montage — la vue est démontée quand on la
 * quitte, donc y revenir relit la base, comme rouvrir l'ancien panneau. Pas de cache : les
 * données tiennent en quelques Ko et un classement périmé se voit tout de suite.
 */
export function useLeaderboardRows(client) {
  const rows = ref(null)
  // À `true` dès le premier rendu : `onMounted` n'a pas encore tourné à cet instant, et un
  // tableau vide affiché un tick se lirait « personne n'a rien ouvert ».
  const loading = ref(true)
  const error = ref(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      rows.value = await client.readLeaderboard()
    } catch (e) {
      error.value = e.message ?? 'Le chargement a échoué.'
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
  return { rows, loading, error, load }
}
