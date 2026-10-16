const KEY = 'pr-dex-sync-since'

/** Au-delà, le front abandonne le suivi d'une capture : elle a fini depuis longtemps, ou jamais démarré. */
export const SYNC_WINDOW_MS = 3 * 60 * 1000

/**
 * L'heure du dernier clic sur ⟳, gardée pour qu'un rechargement de page reprenne le suivi au
 * lieu de le couper. Le stockage peut manquer ou jeter (navigation privée) : le suivi marche
 * alors pour la page en cours, sans survivre au rechargement.
 */
export function rememberSync(since, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, since) } catch { /* rien à faire */ }
}

export function forgetSync(storage = globalThis.localStorage) {
  try { storage?.removeItem(KEY) } catch { /* rien à faire */ }
}

/** L'heure du clic d'une recherche encore à suivre, ou null. */
export function pendingSync(now = Date.now(), storage = globalThis.localStorage) {
  let since = null
  try { since = storage?.getItem(KEY) ?? null } catch { return null }
  if (!since || now - Date.parse(since) > SYNC_WINDOW_MS) return null
  return since
}
