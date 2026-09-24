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
})
