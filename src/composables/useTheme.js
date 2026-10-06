import { ref } from 'vue'

const KEY = 'prdex.theme'

// Le stockage peut manquer ou jeter (navigation privée, données bloquées) : le thème marche
// alors pour la session, sans s'en souvenir.
const read = (storage) => { try { return storage?.getItem(KEY) } catch { return null } }
const write = (storage, v) => { try { storage?.setItem(KEY, v) } catch { /* rien à faire */ } }

/**
 * Le thème suit le système tant que la personne n'a rien choisi ; dès qu'elle bascule, son
 * choix l'emporte et le système n'a plus la main. `index.html` pose déjà le bon thème avant le
 * premier rendu ; ce composable reprend la main ensuite.
 */
export function useTheme({
  storage = globalThis.localStorage,
  media = globalThis.matchMedia?.('(prefers-color-scheme: light)'),
  root = globalThis.document?.documentElement,
} = {}) {
  const saved = read(storage)
  let chosen = saved === 'light' || saved === 'dark'
  const theme = ref(chosen ? saved : (media?.matches ? 'light' : 'dark'))
  const apply = () => { if (root) root.dataset.theme = theme.value }
  apply()

  media?.addEventListener?.('change', (e) => {
    if (chosen) return
    theme.value = e.matches ? 'light' : 'dark'
    apply()
  })

  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    chosen = true
    write(storage, theme.value)
    apply()
  }

  return { theme, toggle }
}
