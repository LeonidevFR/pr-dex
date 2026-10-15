import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    /**
     * Cinq secondes — le défaut — ne suffisent pas ici, et l'échec qu'elles produisent est
     * trompeur : il se lit comme une assertion fausse alors que c'est la machine qui a été
     * lente. Trois familles de cas dépassent régulièrement ce seuil sous charge — les tirages
     * à cent mille échantillons, le montage complet de l'application (jsdom, import dynamique
     * de la démo, transformation Vite au premier passage) et les tests de base qui parlent à
     * Postgres. Ils s'exécutent tous en deux ou trois secondes sur une machine au repos.
     *
     * Un test qui échoue selon la charge n'apprend rien à personne : il apprend seulement à se
     * méfier de la suite, et c'est ainsi qu'on cesse de la lancer.
     */
    testTimeout: 30_000,
    include: ['shared/**/*.test.js', 'src/**/*.test.js', 'scripts/**/*.test.js'],
    /**
     * Les fichiers de `scripts/` parlent tous à la MÊME base locale, et vitest les exécutait en
     * parallèle. Certains ont besoin d'un état global — la reprise des évolutions ne vaut que
     * sur une table vierge, par nature, puisqu'elle est unique — pendant que d'autres y
     * committent de vraies lignes. La suite échouait donc par intermittence, et jamais au même
     * endroit : quatre cas un jour, un autre le lendemain, aucun le surlendemain.
     *
     * Un test qui échoue au hasard n'apprend rien à personne — il apprend seulement à se méfier
     * de la suite, et c'est ainsi qu'on cesse de la lancer.
     *
     * Un seul processus pour toute la suite, donc, et non pour les seuls fichiers de base : le
     * découpage par projets coûterait une configuration à entretenir pour un gain nul. La suite
     * entière y est MOINS longue qu'en parallèle — 12 secondes contre 16 à 22 — parce que le
     * coût d'allumer un processus par fichier dominait son propre bénéfice.
     */
    poolOptions: { forks: { singleFork: true } },
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
