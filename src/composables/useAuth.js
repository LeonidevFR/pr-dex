import { ref } from 'vue'
import { supabase } from '../lib/supabaseClient.js'
import { SLACK, readAuthError, withoutAuthError } from '../lib/account.js'

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
  // Ajoute Slack au compte déjà connecté, au lieu d'en créer un second : un dev qui participe
  // au monkey-testing garde une seule collection. Demande « Manual linking » côté dashboard.
  const linkSlack = () =>
    supabase.auth.linkIdentity({ provider: SLACK, options: { redirectTo: location.href } })
  const signOut = () => supabase.auth.signOut()

  return { session, ready, authError, signIn, linkSlack, signOut }
}
