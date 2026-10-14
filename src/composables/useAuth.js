import { ref } from 'vue'
import { supabase } from '../lib/supabaseClient.js'
import { readAuthError, withoutAuthError } from '../lib/account.js'

/** Session portée par Supabase Auth (cookies/localStorage internes à supabase-js) — plus de jeton à saisir. */
export function useAuth() {
  const session = ref(null)
  const ready = ref(false)
  // Lue une seule fois, puis retirée de l'URL : un rechargement ne doit pas la réafficher.
  const authError = ref(readAuthError(location.href))
  if (authError.value) history.replaceState(history.state, '', withoutAuthError(location.href))

  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
    ready.value = true
  })

  supabase.auth.onAuthStateChange((_event, s) => {
    session.value = s
  })

  // Sans `redirectTo` explicite, Supabase retombe sur le "Site URL" configuré côté
  // dashboard — un réglage unique et statique, incompatible avec dev local + prod sur le
  // même projet. `location.href` (pas `.origin`, qui perdrait le sous-chemin /pr-dex/ de
  // GitHub Pages) fonctionne pour les deux, à condition que l'URL exacte soit dans la
  // liste blanche "Redirect URLs" du dashboard.
  const signIn = (provider) =>
    supabase.auth.signInWithOAuth({ provider, options: { redirectTo: location.href } })
  const fail = (error, fallback) => {
    authError.value = { code: error.code ?? fallback, description: error.message ?? '' }
  }
  // Ajoute un compte (Slack, ou GitHub) au compte déjà connecté, au lieu d'en créer un second :
  // une seule collection. Demande « Manual linking » côté dashboard. Un refus peut arriver
  // avant toute redirection : il s'affiche alors dans les Réglages.
  async function link(provider) {
    const { error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo: location.href } })
    if (error) fail(error, 'link_failed')
  }
  // Supabase refuse de retirer le dernier compte. La session est rafraîchie pour que la suite
  // ne lise pas l'ancienne liste.
  async function unlink(provider) {
    const { data, error } = await supabase.auth.getUserIdentities()
    if (error) { fail(error, 'unlink_failed'); return false }
    const identity = data.identities.find((i) => i.provider === provider)
    if (!identity) return false
    const { error: refused } = await supabase.auth.unlinkIdentity(identity)
    if (refused) { fail(refused, 'unlink_failed'); return false }
    await supabase.auth.refreshSession()
    return true
  }
  // La session gardée par supabase-js peut dater d'avant une liaison faite ailleurs : seule une
  // lecture auprès de Supabase dit quels comptes sont réellement liés.
  async function freshUser() {
    const { data, error } = await supabase.auth.getUser()
    return error ? null : data.user
  }
  const signOut = () => supabase.auth.signOut()

  return { session, ready, authError, signIn, link, unlink, freshUser, signOut }
}
