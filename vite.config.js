import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * `base` n'est plus relatif : le routage lit `location.pathname` et doit savoir quel préfixe
 * en retirer, ce qu'un `./` ne dit pas. En production le site vit sous `/pr-dex/` (dépôt
 * `LeonidevFR/pr-dex` servi par GitHub Pages) ; en développement il vit à la racine.
 *
 * Le jour où un vrai domaine arrive, cette ligne devient `'/'` — et c'est le seul endroit à
 * changer, `BASE_URL` étant lu partout ailleurs.
 */
export default defineConfig(({ command }) => ({
  plugins: [vue()],
  base: command === 'build' ? '/pr-dex/' : '/',
}))
