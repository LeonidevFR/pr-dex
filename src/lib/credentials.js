const TOKEN_KEY = 'prdex.token'
const REPO_KEY = 'prdex.repo'

// Seules ces deux clés vivent en localStorage. L'état de jeu vit dans state.json, jamais ici.
export const loadCredentials = () => ({
  token: localStorage.getItem(TOKEN_KEY) ?? '',
  repo: localStorage.getItem(REPO_KEY) ?? '',
})

export function saveCredentials({ token, repo }) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(REPO_KEY, repo)
}

export function clearCredentials() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REPO_KEY)
}
