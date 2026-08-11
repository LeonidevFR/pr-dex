import { describe, it, expect } from 'vitest'
import { TIER_POWER, LEVEL_MAX, FORMS, NORMAL_FORM, levelFactor, power, formOf } from './battle.js'
import { DEX } from './species.js'
import { STATS } from './species-stats.js'

describe('coefficients de rareté', () => {
  it('couvre les quatre paliers, croissants, à partir de 1', () => {
    expect(Object.keys(TIER_POWER).sort()).toEqual(['c', 'l', 'r', 'u'])
    expect(TIER_POWER.c).toBe(1)
    expect(TIER_POWER.u).toBeGreaterThan(TIER_POWER.c)
    expect(TIER_POWER.r).toBeGreaterThan(TIER_POWER.u)
    expect(TIER_POWER.l).toBeGreaterThan(TIER_POWER.r)
  })

  // La mesure des stats par palier (spec § 3) montre que les stats portent déjà l'écart de
  // rareté : un coefficient lourd le compterait deux fois.
  it('reste léger — au plus 25 % d’écart entre commun et légendaire', () => {
    expect(TIER_POWER.l / TIER_POWER.c).toBeLessThanOrEqual(1.25)
  })
})

describe('formes du jour', () => {
  it('propose cinq états ordonnés du plus faible au plus fort', () => {
    expect(FORMS).toHaveLength(5)
    expect(FORMS.map((f) => f.factor)).toEqual([0.90, 0.95, 1.00, 1.05, 1.10])
  })

  it('donne à chaque forme un identifiant et un libellé non vides', () => {
    for (const f of FORMS) {
      expect(f.slug.length).toBeGreaterThan(0)
      expect(f.name.length).toBeGreaterThan(0)
    }
  })

  it('expose la forme neutre', () => {
    expect(NORMAL_FORM.factor).toBe(1)
  })
})

describe('levelFactor', () => {
  it('ne change rien au niveau 1', () => {
    expect(levelFactor(1)).toBe(1)
  })

  it('ajoute 45 % au niveau maximal', () => {
    expect(levelFactor(LEVEL_MAX)).toBeCloseTo(1.45, 10)
  })
})

describe('power', () => {
  // Roucool, commun, 251 de stats : aucun multiplicateur ne s'applique au niveau 1.
  it('rend les stats brutes pour un commun frais en forme normale', () => {
    expect(power({ species: 16 })).toBeCloseTo(251, 6)
  })

  it('applique le coefficient de rareté', () => {
    // Dracaufeu, rare, 534 de stats.
    expect(power({ species: 6 })).toBeCloseTo(534 * 1.15, 6)
  })

  it('applique le niveau et la forme', () => {
    const forte = FORMS[FORMS.length - 1]
    expect(power({ species: 16, level: 10, form: forte })).toBeCloseTo(251 * 1.45 * 1.10, 6)
  })

  it('rend une puissance strictement positive pour les 151 espèces', () => {
    for (const id of Object.keys(DEX).map(Number)) {
      expect(power({ species: id })).toBeGreaterThan(0)
      expect(Number.isFinite(power({ species: id }))).toBe(true)
    }
  })

  // Mewtwo est le plafond de la planche : 680 de stats et le coefficient légendaire.
  it('classe Mewtwo au-dessus de toutes les autres espèces fraîches', () => {
    const mewtwo = power({ species: 150 })
    const autres = Object.keys(STATS).map(Number).filter((id) => id !== 150)
    for (const id of autres) expect(power({ species: id })).toBeLessThan(mewtwo)
  })
})

describe('formOf', () => {
  it('rend toujours une forme de la liste', () => {
    expect(FORMS).toContain(formOf('github:abc123', '2026-08-11'))
  })

  it('est stable pour une même clé et un même jour', () => {
    expect(formOf('github:abc123', '2026-08-11')).toBe(formOf('github:abc123', '2026-08-11'))
  })

  it('change d’un jour à l’autre', () => {
    const jours = ['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']
    const vues = new Set(jours.map((j) => formOf('github:abc123', j).slug))
    expect(vues.size).toBeGreaterThan(1)
  })

  it('ne donne pas la même forme à deux exemplaires le même jour', () => {
    const cles = Array.from({ length: 200 }, (_, i) => `github:sha${i}`)
    const vues = new Set(cles.map((k) => formOf(k, '2026-08-11').slug))
    expect(vues.size).toBe(FORMS.length)
  })

  // `fnv1a` est un hachage 32 bits : un `% 5` sur une entrée mal dispersée s'effondrerait
  // sur une ou deux formes. Le tirage a déjà connu ce défaut (cf. NOTES.md), on le vérifie.
  it('répartit les cinq formes à peu près également sur 50 000 clés', () => {
    const counts = Object.fromEntries(FORMS.map((f) => [f.slug, 0]))
    const n = 50_000
    for (let i = 0; i < n; i++) counts[formOf(`github:sha${i}`, '2026-08-11').slug]++
    for (const f of FORMS) {
      expect(counts[f.slug] / n).toBeGreaterThan(0.17)
      expect(counts[f.slug] / n).toBeLessThan(0.23)
    }
  })
})
