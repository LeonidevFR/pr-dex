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

  const signInWithGithub = () => supabase.auth.signInWithOAuth({ provider: 'github' })
  const signOut = () => supabase.auth.signOut()

  return { session, ready, signInWithGithub, signOut }
}
