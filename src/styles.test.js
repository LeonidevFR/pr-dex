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
   * La carte suit le thème : carton noir en sombre, ivoire en clair. Ses matières lisent des
   * tokens qui lui sont propres, pour que le décor puisse changer sans toucher au carton.
   */
  it('donne à la carte des tokens Onyx, redéfinis en clair', () => {
    const sombre = regles.find((r) => r.selecteur === '.pkc' && /--card-a\s*:/.test(r.corps))
    const clair = regles.find((r) => r.selecteur === '[data-theme="light"] .pkc')
    expect(sombre).toBeDefined()
    expect(clair).toBeDefined()
    for (const t of ['--card-a', '--card-b', '--card-c', '--card-edge', '--card-ink', '--iris-blend']) {
      expect(sombre.corps).toMatch(new RegExp(`${t}\\s*:`))
      expect(clair.corps).toMatch(new RegExp(`${t}\\s*:`))
    }
    expect(sombre.corps).toMatch(/--iris-blend\s*:\s*screen/)
    expect(clair.corps).toMatch(/--iris-blend\s*:\s*multiply/)
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

  describe('lisibilité du thème clair', () => {
    const clair = () => regles.find((r) => r.selecteur === ':root[data-theme="light"]')

    // Les pastilles de palier et « Évoluables » restent transparentes une fois cochées :
    // leur passer le texte crème du plein encre les rendait invisibles.
    it('ne passe au crème que le filtre actif plein, pas les pastilles transparentes', () => {
      const r = regles.find((x) => x.selecteur.includes('[data-theme="light"]') && x.selecteur.includes('.filter-chip.active'))
      expect(r.selecteur).toMatch(/:not\(\.tier-chip\)/)
      expect(r.selecteur).toMatch(/:not\(\.chip-evo\)/)
    })

    it('redéfinit la couleur d’erreur', () => {
      expect(clair().corps).toMatch(/--danger\s*:/)
    })

    // Le scrim du zoom reste noir dans les deux thèmes : son indice ne peut pas lire --fg-3.
    it('garde l’indice du zoom lisible sur son fond noir', () => {
      const hint = regles.find((x) => x.selecteur === '.zoom-hint')
      expect(hint.corps).not.toMatch(/var\(--fg-3\)/)
    })

    it('assombrit le texte du carton rare en clair', () => {
      const r = regles.find((x) => x.selecteur === '[data-theme="light"] .pkc[data-tier="r"]')
      expect(r.corps).toMatch(/--t-r\s*:/)
      expect(r.corps).toMatch(/--card-ink-2\s*:/)
    })

    // Un contour crème écrit en dur disparaît sur le papier : il passe par un token.
    it('ne laisse aucun contour crème écrit en dur dans le décor', () => {
      const fautifs = regles.filter((x) => !/:root|\.pkc|\.ritual|\.evostage|\.reveal|\.next-btn|\.queue-note/.test(x.selecteur)
        && /border[^;]*rgba\(239,\s*230,\s*207/.test(x.corps)).map((x) => x.selecteur)
      expect(fautifs).toEqual([])
    })
  })

  // Le légendaire a son filet, comme le shiny : or métallique au lieu d'irisé. Une case qui
  // est les deux garde l'irisé seul — deux filets superposés se brouilleraient.
  it('entoure une case légendaire d’un filet or, sauf si elle est aussi shiny', () => {
    const filet = regles.find((r) => r.selecteur === '.cell.has.legendary:not(.shiny)::after')
    expect(filet).toBeDefined()
    expect(filet.corps).toMatch(/linear-gradient/)
    expect(filet.corps).toMatch(/mask/)
  })

  // Coché, « Évoluables » garde un fond vert pâle : son texte doit suivre le thème, pas un vert
  // clair écrit en dur, invisible sur le papier crème.
  it('écrit « Évoluables » coché avec le vert du thème', () => {
    const r = regles.find((x) => x.selecteur === '.chip-evo.active')
    expect(r.corps).toMatch(/color\s*:\s*var\(--u-text\)/)
    expect(r.corps).not.toMatch(/#cfe8da/i)
  })

  // Une espèce tirée trente fois ne doit pas allonger la fiche de trente lignes : le journal
  // s'arrête à cinq lignes et demie, et défile au-delà.
  it('borne la hauteur du journal des captures et le fait défiler', () => {
    const r = regles.find((x) => x.selecteur === '.log')
    expect(r.corps).toMatch(/max-height\s*:/)
    expect(r.corps).toMatch(/overflow-y\s*:\s*auto/)
  })

  it('donne une matière à chaque dos rare, en sombre et en clair', () => {
    for (const v of ['gold', 'iris', 'holo']) {
      expect(regles.some((r) => r.selecteur.includes(`.pkc-back[data-back="${v}"]`) && !r.selecteur.includes('data-theme'))).toBe(true)
      expect(regles.some((r) => r.selecteur.includes('[data-theme="light"]') && r.selecteur.includes(`.pkc-back[data-back="${v}"]`))).toBe(true)
    }
  })
})
