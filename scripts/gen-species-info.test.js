import { describe, it, expect } from 'vitest'
import { cleanFlavor, pickFlavor, statTotal } from './gen-species-info.mjs'

describe('cleanFlavor', () => {
  // PokeAPI stocke ces textes avec la mise en page de la boîte de dialogue du jeu.
  it('remplace les retours à la ligne et les sauts de page par des espaces', () => {
    expect(cleanFlavor('Il a une graine\nsur le dos depuis\fsa naissance.')).toBe(
      'Il a une graine sur le dos depuis sa naissance.',
    )
  })

  it('réduit les espaces multiples et rogne les bords', () => {
    expect(cleanFlavor('  deux   espaces \n ')).toBe('deux espaces')
  })

  it('retire les traits d’union conditionnels', () => {
    expect(cleanFlavor('POKé­MON')).toBe('POKéMON')
  })
})

describe('pickFlavor', () => {
  const entry = (lang, version, text) => ({
    language: { name: lang }, version: { name: version }, flavor_text: text,
  })

  // Les versions gen 1 n'ont jamais eu de traduction française.
  it('ignore les entrées qui ne sont pas en français', () => {
    expect(pickFlavor([entry('en', 'red', 'A strange seed…')])).toBe(null)
  })

  it('préfère le texte de Rouge Feu', () => {
    const entries = [entry('fr', 'x', 'texte X'), entry('fr', 'firered', 'texte RF')]
    expect(pickFlavor(entries)).toBe('texte RF')
  })

  it('se rabat sur Vert Feuille à défaut de Rouge Feu', () => {
    const entries = [entry('fr', 'x', 'texte X'), entry('fr', 'leafgreen', 'texte VF')]
    expect(pickFlavor(entries)).toBe('texte VF')
  })

  it('accepte n’importe quelle version française en dernier recours', () => {
    expect(pickFlavor([entry('fr', 'x', 'texte X')])).toBe('texte X')
  })

  it('nettoie le texte retenu', () => {
    expect(pickFlavor([entry('fr', 'firered', 'deux\nlignes')])).toBe('deux lignes')
  })
})

describe('statTotal', () => {
  const stat = (name, base_stat) => ({ base_stat, stat: { name } })

  it('additionne les six statistiques de base', () => {
    expect(statTotal([
      stat('hp', 45), stat('attack', 49), stat('defense', 49),
      stat('special-attack', 65), stat('special-defense', 65), stat('speed', 45),
    ])).toBe(318)
  })

  it('rend 0 pour une liste vide plutôt que NaN', () => {
    expect(statTotal([])).toBe(0)
  })
})
