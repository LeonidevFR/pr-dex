import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['shared/**/*.test.js', 'src/**/*.test.js', 'scripts/**/*.test.js'],
    // supabaseClient.js construit le client au chargement du module : toute chaîne
    // d'imports qui y remonte plante sans ces deux valeurs, même si le test ne s'en sert
    // jamais (cas de useCollection.test.js, qui ne veut que SupabaseDataError). Aucune
    // requête réseau réelle n'est faite dans les tests : une URL syntaxiquement valide suffit.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
