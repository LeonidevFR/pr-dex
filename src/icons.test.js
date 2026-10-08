// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('./components/', import.meta.url)
const templates = [new URL('./App.vue', import.meta.url), ...readdirSync(dir).filter((f) => f.endsWith('.vue')).map((f) => new URL(f, dir))]
  .map((u) => [u.pathname.split('/').pop(), (readFileSync(u, 'utf8').match(/<template>[\s\S]*<\/template>/) ?? [''])[0].replace(/<!--[\s\S]*?-->/g, '')])

/**
 * Toutes les icônes de l'interface viennent de Lucide : un seul trait, une seule grille. Un
 * SVG dessiné à la main ou un glyphe (✕, ✦, ★, →, ↑) dans un gabarit, c'est une icône qui ne
 * ressemble pas aux autres.
 */
/**
 * `SeasonBadge` échappe à la règle du SVG : ce n'est pas une icône mais une ILLUSTRATION — les
 * badges de Kanto, découpés du jeu Vecteezy cité dans les réglages. La règle vise l'uniformité
 * du trait entre icônes ; une médaille dessinée n'a pas à ressembler à un chevron.
 */
const ILLUSTRATIONS = ['SeasonBadge.vue']

describe('icônes', () => {
  it('ne dessine aucun SVG à la main dans les gabarits', () => {
    const dessins = templates.filter(([f, t]) => /<svg/.test(t) && !ILLUSTRATIONS.includes(f))
    expect(dessins.map(([f]) => f)).toEqual([])
  })

  it('n’utilise aucun glyphe en guise d’icône', () => {
    expect(templates.filter(([, t]) => /[✕✦→⚙↑★]/.test(t)).map(([f]) => f)).toEqual([])
  })
})
