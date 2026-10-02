// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

/**
 * Découpage sommaire en règles — la feuille est écrite à la main, un sélecteur par bloc,
 * et l'on ne cherche ici qu'à lire des déclarations, pas à comprendre la cascade. Les
 * commentaires partent d'abord : ils contiennent des accolades.
 */
const regles = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('}')
  .map((bloc) => bloc.split('{'))
  .filter((parts) => parts.length === 2)
  .map(([selecteur, corps]) => ({ selecteur: selecteur.trim(), corps }))

const declare = (propriete) => (r) => new RegExp(`(^|[;\\s])${propriete}\\s*:`).test(r.corps)

describe('feuille de style', () => {
  /**
   * Firefox n'applique `backface-visibility` qu'aux éléments qui portent eux-mêmes un
   * `transform` : sur une face sans transform propre, il ignore la consigne et laisse voir
   * la face avant en miroir quand la carte est retournée — Chromium, lui, se fie au
   * transform accumulé du parent en `preserve-3d` et la masque. Un `rotateY(0deg)`, qui ne
   * déplace rien, suffit à ce que les deux navigateurs racontent la même chose.
   */
  it('donne un transform propre à toute face qui compte sur backface-visibility', () => {
    const faces = regles.filter((r) => /backface-visibility\s*:\s*hidden/.test(r.corps))
    expect(faces.length).toBeGreaterThan(0)

    const selecteurs = faces.flatMap((r) => r.selecteur.split(',').map((s) => s.trim()))
    const sansTransform = selecteurs.filter(
      (s) => !regles.some((r) => r.selecteur.split(',').some((x) => x.trim() === s) && declare('transform')(r)),
    )
    expect(sansTransform).toEqual([])
  })

  /**
   * La carte est un objet qui ne change pas avec le décor : ses matières lisent les tokens
   * parchemin. Le `:root` passe au velours ; si `.pkc` ne redéclarait pas ces tokens, le
   * carton du commun virerait au brun et l'ocre du rare se perdrait.
   */
  it('redéclare sur la carte les tokens parchemin, aux valeurs d’avant la refonte', () => {
    const carte = regles.find((r) => r.selecteur === '.pkc' && /--paper\s*:/.test(r.corps))
    expect(carte).toBeDefined()
    for (const [token, valeur] of [
      ['--paper', '#e7ddc7'], ['--paper-lo', '#ddd0b3'], ['--plate', '#f2ecda'], ['--plate-hi', '#fbf6e8'],
      ['--ink', '#2c2620'], ['--ink-2', '#6f6350'], ['--ink-3', '#9a8a6d'],
      ['--rule', '#c3b48f'], ['--rule-hi', '#b3a179'], ['--stamp', '#9e3b2e'], ['--ochre', '#b8862b'], ['--herb', '#5c7a52'],
      ['--t-c', '#8a8175'], ['--t-u', '#5c7a52'], ['--t-r', '#9e3b2e'], ['--t-l', '#b8862b'],
    ]) {
      expect(carte.corps).toMatch(new RegExp(`${token}\\s*:\\s*${valeur}`))
    }
  })

  it('pose la palette Vitrine sur :root', () => {
    const racine = regles.find((r) => r.selecteur.split(',').map((x) => x.trim()).includes(':root') && /--bg\s*:/.test(r.corps))
    expect(racine.corps).toMatch(/--bg\s*:\s*#14110e/)
    expect(racine.corps).toMatch(/--gold\s*:\s*#d4b06a/)
    expect(racine.corps).toMatch(/--t-r\s*:\s*#d7756a/)
  })

  /**
   * L'éventail de la connexion tourne et décale ses cartes au-delà de sa colonne : sans
   * rognage, la page défile à l'horizontale entre 900 et 1 200 px de large.
   */
  it('rogne l’éventail de la connexion', () => {
    const fan = regles.find((r) => r.selecteur === '.front-fan')
    expect(fan.corps).toMatch(/overflow(-x)?\s*:\s*(hidden|clip)/)
  })

  /**
   * Une pastille de palier décochée reste un bouton qu'on lit : atténuer tout le bouton
   * faisait tomber son texte à 2,9:1. Seuls le point et le contour s'éteignent.
   */
  it('n’atténue pas le texte d’une pastille de palier décochée', () => {
    const off = regles.filter((r) => r.selecteur === '.tier-chip:not(.active)')
    expect(off.some(declare('opacity'))).toBe(false)
  })

  it('redéfinit le décor en thème clair', () => {
    const clair = regles.find((r) => r.selecteur === ':root[data-theme="light"]')
    expect(clair).toBeDefined()
    expect(clair.corps).toMatch(/--bg\s*:\s*#f6f0e2/)
    expect(clair.corps).toMatch(/--fg\s*:\s*#2c2620/)
    expect(clair.corps).toMatch(/--gold\s*:\s*#7a5c22/)
  })

  /**
   * Le rituel et l'évolution sont des scènes de nuit dans les deux thèmes : s'ils héritaient
   * des tokens clairs, leur texte passerait à l'encre sur fond noir.
   */
  it('garde le rituel et l’évolution en tokens sombres', () => {
    const scenes = regles.find((r) => r.selecteur.split(',').map((x) => x.trim()).includes('.ritual')
      && r.selecteur.includes('.evostage') && /--fg\s*:/.test(r.corps))
    expect(scenes).toBeDefined()
    expect(scenes.corps).toMatch(/--fg\s*:\s*#efe7d8/)
  })

  it('ne laisse plus le titre crème écrit en dur dans le décor', () => {
    const horsScenes = regles.filter((r) => !r.selecteur.includes('.pkc') && !/:root|\.ritual|\.evostage|\.reveal|\.evo-|\.next-btn|\.queue-note|\.fx-/.test(r.selecteur))
    expect(horsScenes.filter((r) => /#f4ecda/i.test(r.corps)).map((r) => r.selecteur)).toEqual([])
  })
})
