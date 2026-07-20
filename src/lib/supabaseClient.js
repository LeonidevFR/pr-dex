import { createClient } from '@supabase/supabase-js'

// URL + clé anon : publiques par construction (Vite les inline dans le build). Rien à
// protéger ici — c'est RLS, côté base, qui isole les données de chaque dev, pas le secret
// de ces deux valeurs.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
