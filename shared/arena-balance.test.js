import { describe, it, expect } from 'vitest'
import { simulateSeason, simulateLegendaryLife } from '../scripts/simulate-arena.mjs'

// Une saison : deux mois, ~8,7 semaines, 5 crédits par semaine ouvrée.
const SAISON = 8.7
const RUNS = 40

/** Moyenne sur plusieurs saisons : une saison isolée varie trop pour un seuil stable. */
function moyenne(policy) {
  const runs = Array.from({ length: RUNS }, (_, i) =>
    simulateSeason({ policy, weeks: SAISON, seed: `eq-${i}` }))
  const moy = (f) => runs.reduce((a, r) => a + f(r), 0) / RUNS
  return {
    dollars: moy((r) => r.dollars), points: moy((r) => r.points),
    plis: moy((r) => r.plis), lost: moy((r) => r.lost),
    duels: moy((r) => r.duels), winRate: moy((r) => r.winRate),
  }
}

describe('équilibrage de l’arène', () => {
  // Acquis 1 de la spec : aucune stratégie de mise dominante. Engager petit doit perdre.
  // Mesuré : ~1 060 $ en commun contre ~5 400 $ en rare.
  it('rapporte bien moins en engageant toujours un commun qu’un rare', () => {
    const commun = moyenne('commun')
    const rare = moyenne('rare')
    expect(commun.dollars).toBeLessThan(rare.dollars / 2)
    expect(commun.points).toBeLessThan(rare.points / 2)
  })

  // Acquis 2 : le rare s'autofinance — on en perd un sur deux, on gagne un pli rare l'autre
  // fois. C'est ce qui en fait le point d'équilibre naturel plutôt qu'un pari.
  it('laisse le stock de rares stable pour qui n’engage que des rares', () => {
    const r = moyenne('rare')
    expect(Math.abs(r.plis - r.lost) / r.duels).toBeLessThan(0.10)
  })

  it('donne une victoire sur deux quand les deux camps engagent le même palier', () => {
    for (const policy of ['commun', 'peu-commun', 'rare', 'legendaire']) {
      expect(moyenne(policy).winRate).toBeGreaterThan(0.42)
      expect(moyenne(policy).winRate).toBeLessThan(0.58)
    }
  })

  // Le légendaire est la politique la plus RENTABLE (~13 000 $, deux fois et demie le rare),
  // et rien dans la table des gains ne l'en empêche. Ce qui l'interdit est le stock : il
  // coûte une vingtaine de légendaires par saison quand on en tire environ un.
  it('rend la politique légendaire rentable mais inabordable', () => {
    const l = moyenne('legendaire')
    expect(l.dollars).toBeGreaterThan(moyenne('rare').dollars)
    expect(l.lost).toBeGreaterThan(10)
  })

  // Acquis 3 : un légendaire descendu chaque semaine finit détruit. Le bornage à 90 % suffit
  // à le garantir — c'est ce qui empêche un rouleau compresseur immortel.
  it('détruit un légendaire engagé chaque semaine en quelques mois', () => {
    const vies = Array.from({ length: 200 }, (_, i) =>
      simulateLegendaryLife({ weeks: 52, seed: `vie-${i}` }))
    const survivants = vies.filter((v) => v >= 52).length
    expect(survivants / vies.length).toBeLessThan(0.10)
    const mediane = vies.slice().sort((a, b) => a - b)[Math.floor(vies.length / 2)]
    expect(mediane).toBeLessThan(30)
  })

  // Acquis 4 : la boutique reste hors de portée du seul farming contre la maison. Mesuré à
  // ~21 % du jeu humain avec le quart de tarif — c'était ~96 % au demi-tarif initial.
  it('rapporte moins de la moitié en n’affrontant que la maison', () => {
    const maison = moyenne('maison')
    const humain = moyenne('rare')
    expect(maison.dollars).toBeLessThan(humain.dollars / 2)
    expect(maison.points).toBe(0)
    expect(maison.plis).toBe(0)
    expect(maison.lost).toBe(0)
  })

  // Les prix de la boutique sont calés sur ce chiffre (spec § 4) : s'il dérive, ce sont les
  // prix qu'il faut reprendre, pas ce seuil.
  it('place une saison de jeu humain autour de 5 400 pokédollars', () => {
    expect(moyenne('rare').dollars).toBeGreaterThan(4500)
    expect(moyenne('rare').dollars).toBeLessThan(6500)
  })
})
