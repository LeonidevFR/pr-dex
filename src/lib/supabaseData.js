import { supabase } from './supabaseClient.js'

/** `kind` : 'conflict' | 'offline' | 'server' — mêmes usages que GithubError côté useCollection.js. */
export class SupabaseDataError extends Error {
  constructor(kind, message) {
    super(message)
    this.name = 'SupabaseDataError'
    this.kind = kind
  }
}

async function query(fn) {
  let result
  try {
    result = await fn()
  } catch {
    // supabase-js ne rejette que sur une panne réseau franche — jamais sur une erreur Postgres,
    // qui arrive dans `error` du résultat. Même distinction que fetch côté github.js.
    throw new SupabaseDataError('offline', 'Pas de connexion réseau.')
  }
  if (result.error) throw new SupabaseDataError('server', result.error.message)
  return result.data
}

/**
 * Même contrat que l'ancien createGithubClient (checkAccess/readCatches/readState/writeState) : useCollection.js
 * ne change pas d'une ligne entre les deux backends. `blobSha` porte en réalité l'entier `version`
 * de la table `state` — nom gardé pour ne pas toucher à l'appelant, qui le traite comme un jeton opaque.
 * `triggerCatch` est une addition sans équivalent côté ancien client (pas de bouton de sync à l'époque).
 */
export function createSupabaseClient(userId) {
  async function checkAccess() {
    await query(() => supabase.from('profiles').select('user_id').eq('user_id', userId).single())
    return true
  }

  async function readCatches() {
    return query(() =>
      supabase
        .from('catches')
        .select('sha, repo, pr, title, date, species, shiny')
        .eq('user_id', userId)
        .order('date', { ascending: true }),
    )
  }

  async function readState() {
    const row = await query(() =>
      supabase.from('state').select('claimed, spent, evolutions, version').eq('user_id', userId).single(),
    )
    const { version, ...state } = row
    return { state, blobSha: version }
  }

  /**
   * Déclenche l'Action `catch.yml` sans attendre qu'elle tourne — la fonction Edge répond
   * dès que GitHub a accepté la mise en file, pas quand la capture est faite. `readCatches`
   * juste après n'aura donc rien de neuf tant que le run n'est pas terminé.
   */
  async function triggerCatch() {
    return query(() => supabase.functions.invoke('trigger-catch', { method: 'POST' }))
  }

  async function writeState(state, blobSha) {
    const version = blobSha ?? 0
    const data = await query(() =>
      supabase
        .from('state')
        .update({ ...state, version: version + 1 })
        .eq('user_id', userId)
        .eq('version', version)
        .select('version'),
    )
    // Predicat `version = version` non vérifié : un autre appareil a écrit entre-temps.
    // PostgREST répond 200 avec un tableau vide, jamais une erreur — même rôle que le 409 GitHub.
    if (!data.length) throw new SupabaseDataError('conflict', 'Écriture concurrente détectée.')
    return { blobSha: data[0].version }
  }

  return { checkAccess, readCatches, readState, writeState, triggerCatch }
}
