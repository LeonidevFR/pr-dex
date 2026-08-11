import { describe, it, expect } from 'vitest'
import { simulateLeague, simulateLegendaryLife } from '../scripts/simulate-arena.mjs'

// Une saison : deux mois, ~8,7 semaines, 5 duels par semaine ouvrée.
const SAISON = 8.7
const RUNS = 30
const POLICIES = ['prudent', 'rare', 'audacieux', 'rare', 'maison']

/** Moyenne d'un joueur sur plusieurs ligues : une saison isolée varie trop pour un seuil stable. */
function moyenne(index) {
  const runs = Array.from({ length: RUNS }, (_, i) =>
    simulateLeague({ weeks: SAISON, seed: `eq-${i}`, policies: POLICIES })[index])
  const moy = (f) => runs.reduce((a, r) => a + f(r), 0) / RUNS
  return {
    dollars: moy((r) => r.dollars), points: moy((r) => r.points),
    plis: moy((r) => r.plis), lost: moy((r) => r.lost), duels: moy((r) => r.duels),
    fallbacks: moy((r) => r.fallbacks), stakesL: moy((r) => r.stakes.l),
    stockR: moy((r) => r.stock.r), winRate: moy((r) => r.wins / r.duels),
  }
}

const PRUDENT = 0
const RARE = 1
const AUDACIEUX = 2
const MAISON = 4

describe('équilibrage de l’arène', () => {
  // Acquis 1 de la spec : aucune stratégie de mise dominante. La version précédente de cette
  // simulation concluait l'inverse — engager gros rapportait toujours plus — parce qu'elle
  // ignorait le stock. Avec une réserve réelle, la politique la plus ambitieuse ne trouve
  // presque jamais de légendaire à engager et retombe sur le rare d'elle-même.
  it('rend la politique la plus ambitieuse indiscernable de la politique rare', () => {
    const audacieux = moyenne(AUDACIEUX)
    const rare = moyenne(RARE)
    expect(audacieux.stakesL).toBeLessThan(5)
    expect(Math.abs(audacieux.dollars - rare.dollars) / rare.dollars).toBeLessThan(0.25)
  })

  it('fait perdre bien plus à qui n’engage que des communs', () => {
    expect(moyenne(PRUDENT).dollars).toBeLessThan(moyenne(RARE).dollars / 2)
    expect(moyenne(PRUDENT).points).toBeLessThan(moyenne(RARE).points / 2)
  })

  // Acquis 2 : le rare est un point d'équilibre tenable — un joueur qui n'engage que des
  // rares ne vide pas sa réserve. Contrairement à la version précédente, ce test PEUT
  // échouer : le stock est réellement compté, et une politique intenable se traduirait par
  // des replis massifs sur un palier inférieur.
  it('laisse la politique rare soutenable — la réserve ne se vide pas', () => {
    const r = moyenne(RARE)
    expect(r.fallbacks / r.duels).toBeLessThan(0.15)
    expect(r.stockR).toBeGreaterThan(0)
  })

  // Acquis 3 : un légendaire descendu chaque semaine finit détruit. Le bornage à 90 % suffit
  // à le garantir — c'est ce qui empêche un rouleau compresseur immortel.
  it('détruit un légendaire engagé chaque semaine en quelques mois', () => {
    const vies = Array.from({ length: 200 }, (_, i) =>
      simulateLegendaryLife({ weeks: 52, seed: `vie-${i}` }))
    expect(vies.filter((v) => v >= 52).length / vies.length).toBeLessThan(0.02)
    const mediane = vies.slice().sort((a, b) => a - b)[Math.floor(vies.length / 2)]
    expect(mediane).toBeLessThan(15)
  })

  // Acquis 4 : la boutique reste hors de portée du seul farming contre la maison.
  it('rapporte moins de la moitié en n’affrontant que la maison', () => {
    const maison = moyenne(MAISON)
    expect(maison.dollars).toBeLessThan(moyenne(RARE).dollars / 2)
    expect(maison.points).toBe(0)
    expect(maison.plis).toBe(0)
    expect(maison.lost).toBe(0)
  })

  // Contrôle de symétrie du moteur, et rien de plus : sur toute la ligue, les victoires et
  // les défaites doivent s'équilibrer puisque chaque duel produit exactement l'une et
  // l'autre. Un écart signalerait un biais gauche/droite dans `resolveDuel`.
  it('équilibre victoires et défaites sur l’ensemble de la ligue', () => {
    const ligue = simulateLeague({ weeks: SAISON, seed: 'symetrie', policies: POLICIES })
    const humains = ligue.filter((j) => j.policy !== 'maison')
    const wins = humains.reduce((a, j) => a + j.wins, 0)
    const lost = humains.reduce((a, j) => a + j.lost, 0)
    expect(wins).toBe(lost)
  })

  it('refuse une politique inconnue au lieu de retomber silencieusement sur une autre', () => {
    expect(() => simulateLeague({ weeks: 1, seed: 'x', policies: ['nawak'] })).toThrow(/nawak/)
  })
})
