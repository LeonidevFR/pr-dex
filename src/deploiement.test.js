// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import config from '../vite.config.js'

/**
 * Deux réglages de déploiement qu'aucun test d'interface ne peut voir échouer, et dont la
 * panne ne se manifesterait qu'en production, sur une URL partagée.
 */
describe('déploiement sur GitHub Pages', () => {
  // Avec un `base` relatif, `404.html` servi sur /pr-dex/arena chercherait ses ressources
  // dans /pr-dex/arena/assets/ — qui n'existe pas. Le chemin doit être absolu.
  it('construit avec le préfixe du dépôt, et sert la racine en développement', () => {
    expect(config({ command: 'build' }).base).toBe('/pr-dex/')
    expect(config({ command: 'serve' }).base).toBe('/')
  })

  // Pages sert des fichiers : /arena n'en est pas un. Sans ce doublon, un rechargement ou un
  // lien partagé tombe sur la page d'erreur de GitHub.
  it('produit un 404.html identique à l’index', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
    expect(pkg.scripts.build).toContain('dist/404.html')
  })
})
