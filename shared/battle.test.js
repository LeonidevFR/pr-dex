import { describe, it, expect } from 'vitest'
import {
  TIER_POWER, LEVEL_MAX, FORMS, NORMAL_FORM, levelFactor, power, formOf,
  P_FLOOR, P_CEIL, winProbability, levelGain, resolveDuel,
} from './battle.js'
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

  // Léger sur les trois premiers paliers, parce que les stats portent déjà l'écart de rareté
  // (spec § 3) et qu'un coefficient lourd le compterait deux fois. Le légendaire est
  // l'exception mesurée : son pool (580 à 680) chevauche le haut du pool rare (jusqu'à 600),
  // donc les stats seules ne séparent pas ces deux paliers-là.
  it('reste léger sur les trois premiers paliers', () => {
    expect(TIER_POWER.u / TIER_POWER.c).toBeLessThanOrEqual(1.10)
    expect(TIER_POWER.r / TIER_POWER.c).toBeLessThanOrEqual(1.15)
  })

  it('appuie franchement le palier légendaire, que les stats ne séparent pas du rare', () => {
    expect(TIER_POWER.l).toBe(1.45)
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

  // Sans ce garde-fou, une espèce inconnue produit un `NaN` que `levelGain` traduit en gain
  // maximal, parce que toutes ses comparaisons avec `NaN` sont fausses.
  it('refuse une espèce inconnue au lieu de propager un NaN', () => {
    expect(() => power({ species: 9999 })).toThrow(/9999/)
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

  it('fait apparaître les cinq formes sur deux cents exemplaires le même jour', () => {
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

describe('winProbability', () => {
  it('donne une chance sur deux à puissances égales', () => {
    expect(winProbability(400, 400)).toBe(0.5)
  })

  it('est symétrique — les deux probabilités somment à 1 hors bornage', () => {
    expect(winProbability(355, 614) + winProbability(614, 355)).toBeCloseTo(1, 10)
  })

  it('borne les deux extrêmes', () => {
    expect(winProbability(1, 10_000)).toBe(0.10)
    expect(winProbability(10_000, 1)).toBe(0.90)
  })

  // Un rapport direct laisserait un Rattata battre Électhor près d'une fois sur trois.
  // L'élévation au cube est ce qui rend l'écart de stats réellement décisif.
  it('amplifie l’écart au lieu de suivre le rapport brut', () => {
    expect(winProbability(300, 600)).toBeLessThan(300 / 900)
  })
})

describe('probabilités de référence de la spec', () => {
  const forte = FORMS[FORMS.length - 1]
  const duel = (gauche, droite) => winProbability(power(gauche), power(droite))

  it('Rattata contre Électhor tombe sur la borne basse', () => {
    expect(duel({ species: 19 }, { species: 145 })).toBe(0.10)
  })

  it('Salamèche contre Dracaufeu, tous deux frais : 16 %', () => {
    expect(duel({ species: 4 }, { species: 6 })).toBeCloseTo(0.162, 3)
  })

  it('Salamèche niveau 10 contre Dracaufeu frais : 37 %', () => {
    expect(duel({ species: 4, level: 10 }, { species: 6 })).toBeCloseTo(0.371, 3)
  })

  it('Roucool niveau 10 contre Dracaufeu frais : 17 %', () => {
    expect(duel({ species: 16, level: 10 }, { species: 6 })).toBeCloseTo(0.172, 3)
  })

  // Canarticho est rare et Rattatac peu commun, mais Rattatac a de meilleures stats :
  // le coefficient de rareté rattrape presque l'écart sans le renverser.
  it('Canarticho contre Rattatac, tous deux frais : 49 %', () => {
    expect(duel({ species: 83 }, { species: 20 })).toBeCloseTo(0.493, 3)
  })

  it('la forme du jour déplace l’issue sans la décider', () => {
    const neutre = duel({ species: 6 }, { species: 6 })
    const avantage = duel({ species: 6, form: forte }, { species: 6 })
    expect(avantage).toBeGreaterThan(neutre)
    expect(avantage).toBeLessThan(0.65)
  })
})

describe('levelGain', () => {
  it('n’accorde rien pour un adversaire nettement plus faible', () => {
    expect(levelGain(1000, 500)).toBe(0)
    expect(levelGain(1000, 740)).toBe(0)
  })

  it('accorde un niveau pour un adversaire comparable', () => {
    expect(levelGain(1000, 750)).toBe(1)
    expect(levelGain(1000, 1000)).toBe(1)
    expect(levelGain(1000, 1090)).toBe(1)
  })

  it('accorde deux niveaux au-delà de 1,10×', () => {
    expect(levelGain(1000, 1100)).toBe(2)
    expect(levelGain(1000, 1490)).toBe(2)
  })

  it('accorde trois niveaux au-delà de 1,50×', () => {
    expect(levelGain(1000, 1500)).toBe(3)
    expect(levelGain(1000, 1990)).toBe(3)
  })

  it('accorde cinq niveaux pour un adversaire deux fois plus puissant', () => {
    expect(levelGain(1000, 2000)).toBe(5)
    expect(levelGain(1000, 9000)).toBe(5)
  })

  // Un légendaire écrase tout mais ne progresse plus : face au tout-venant de l'arène il
  // est très au-dessus de 1,33× l'adversaire, donc sous le seuil des 0,75× inverses.
  it('ne fait pas progresser un légendaire contre le tout-venant', () => {
    const electhor = power({ species: 145 })
    const rattatac = power({ species: 20 })
    expect(levelGain(electhor, rattatac)).toBe(0)
  })
})

describe('resolveDuel', () => {
  const duel = (over = {}) =>
    resolveDuel({ left: { species: 6 }, right: { species: 6 }, seed: 'duel-1', ...over })

  it('rend le même résultat pour un même seed', () => {
    expect(duel()).toEqual(duel())
  })

  it('désigne toujours exactement un vainqueur', () => {
    for (let i = 0; i < 100; i++) {
      expect(['left', 'right']).toContain(duel({ seed: `duel-${i}` }).winner)
    }
  })

  it('conserve les puissances des deux camps pour le résumé de combat', () => {
    const r = duel()
    expect(r.left.power).toBeCloseTo(power({ species: 6 }), 6)
    expect(r.right.power).toBeCloseTo(power({ species: 6 }), 6)
    expect(r.probability).toBe(0.5)
    expect(r.roll).toBeGreaterThanOrEqual(0)
    expect(r.roll).toBeLessThan(1)
  })

  it('fait gagner le favori à peu près à la fréquence annoncée', () => {
    const n = 20_000
    let gauche = 0
    for (let i = 0; i < n; i++) {
      if (resolveDuel({
        left: { species: 4 }, right: { species: 6 }, seed: `duel-${i}`,
      }).winner === 'left') gauche++
    }
    expect(gauche / n).toBeCloseTo(0.162, 2)
  })

  it('accorde le gain de niveau au seul vainqueur, borné au niveau maximal', () => {
    const r = resolveDuel({
      left: { species: 16, level: 9 }, right: { species: 16, level: 9 }, seed: 'duel-1',
    })
    expect(r.gain).toBe(1)
    expect(r.levelAfter).toBe(LEVEL_MAX)
  })

  it('ne dépasse jamais le niveau maximal, même sur un exploit', () => {
    const r = resolveDuel({
      left: { species: 16, level: 10 }, right: { species: 145, level: 10 }, seed: 'exploit',
    })
    expect(r.levelAfter).toBeLessThanOrEqual(LEVEL_MAX)
  })

  // L'issue ne doit dépendre que du couple d'exemplaires et du seed, jamais de qui a été
  // passé en premier : le serveur résout un duel challenger/preneur, le client le rejoue
  // dans l'ordre qui l'arrange, et les deux doivent tomber sur le même vainqueur.
  it('désigne le même vainqueur quel que soit l’ordre des arguments', () => {
    for (let i = 0; i < 500; i++) {
      const seed = `ordre-${i}`
      const gauche = resolveDuel({ left: { species: 4 }, right: { species: 6 }, seed })
      const droite = resolveDuel({ left: { species: 6 }, right: { species: 4 }, seed })
      expect(gauche.winner === 'left').toBe(droite.winner === 'right')
    }
  })

  // Deux exemplaires jumeaux — même espèce, même niveau, même forme — ne sont distingués
  // que par leur clé. Sans elle ils retombent ex æquo et l'ordre des arguments décide.
  it('reste indépendant de l’ordre pour deux exemplaires jumeaux distingués par leur clé', () => {
    for (let i = 0; i < 500; i++) {
      const seed = `jumeaux-${i}`
      const a = { species: 6, level: 3, key: 'github:aaa' }
      const b = { species: 6, level: 3, key: 'github:bbb' }
      const gauche = resolveDuel({ left: a, right: b, seed })
      const droite = resolveDuel({ left: b, right: a, seed })
      expect(gauche.winner === 'left').toBe(droite.winner === 'right')
    }
  })

  it('applique la forme passée en argument', () => {
    const forte = FORMS[FORMS.length - 1]
    const r = resolveDuel({
      left: { species: 6, form: forte }, right: { species: 6 }, seed: 'duel-1',
    })
    expect(r.probability).toBeGreaterThan(0.5)
    expect(r.left.form).toBe(forte)
  })
})
