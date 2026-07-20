import { ref } from 'vue'
import { supabase } from '../lib/supabaseClient.js'

/** Session portée par Supabase Auth (cookies/localStorage internes à supabase-js) — plus de jeton à saisir. */
export function useAuth() {
  const session = ref(null)
  const ready = ref(false)

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
  const signInWithGithub = () =>
    supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.href } })
  const signOut = () => supabase.auth.signOut()

  return { session, ready, signInWithGithub, signOut }
}
