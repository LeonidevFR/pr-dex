import { describe, it, expect } from 'vitest'
import { simulateLeague, simulateLegendaryLife } from './simulate-arena.mjs'

// Une saison : deux mois, ~8,7 semaines, 5 duels par semaine ouvrée.
const SAISON = 8.7
const RUNS = 30
const POLICIES = ['prudent', 'rare', 'audacieux', 'rare', 'ordinateur']

/** Moyenne d'un joueur sur plusieurs ligues : une saison isolée varie trop pour un seuil stable. */
function moyenne(index) {
  const runs = Array.from({ length: RUNS }, (_, i) =>
    simulateLeague({ weeks: SAISON, seed: `eq-${i}`, policies: POLICIES })[index])
  const moy = (f) => runs.reduce((a, r) => a + f(r), 0) / RUNS
  return {
    dollars: moy((r) => r.dollars), points: moy((r) => r.points),
    packs: moy((r) => r.packs), lost: moy((r) => r.lost), duels: moy((r) => r.duels),
    fallbacks: moy((r) => r.fallbacks), stakesL: moy((r) => r.stakes.l),
    stockR: moy((r) => r.stock.r), stockL: moy((r) => r.stock.l),
    winRate: moy((r) => r.wins / r.duels),
  }
}

const PRUDENT = 0
const RARE = 1
const AUDACIEUX = 2
const ORDINATEUR = 4

describe('équilibrage de l’arène', () => {
  // Acquis 1 de la spec : aucune stratégie de mise dominante. La contrainte n'est pas la
  // table des gains, c'est la réserve — on ne tire qu'environ un légendaire par saison
  // (0,5 % de ~217 plis), donc la politique la plus ambitieuse finit la saison sans réserve
  // et se bat le plus souvent avec autre chose.
  //
  // La fraction de duels est délibérément mesurée large : elle est bimodale, tout se jouant
  // sur la date du premier légendaire tiré, et un champion réengagé douze fois est une belle
  // histoire, pas un défaut d'équilibrage. Ce qui compte ici est la réserve.
  it('contraint la politique la plus ambitieuse par sa réserve', () => {
    const audacieux = moyenne(AUDACIEUX)
    expect(audacieux.stockL).toBeLessThan(1)
    expect(audacieux.fallbacks / audacieux.duels).toBeGreaterThan(0.5)
  })

  // Un avantage reste possible — engager au-dessus du terrain achète du taux de victoire,
  // que la règle de l'enjeu ne neutralise pas. Ce qui serait un défaut de conception, c'est
  // qu'il devienne écrasant : au-delà du double, la politique cesse d'être un pari pour
  // devenir la seule à jouer.
  it('ne laisse pas la politique ambitieuse rapporter plus du double de la politique rare', () => {
    const audacieux = moyenne(AUDACIEUX)
    const rare = moyenne(RARE)
    expect(audacieux.dollars).toBeLessThan(rare.dollars * 2)
    expect(rare.dollars).toBeLessThan(audacieux.dollars * 2)
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
    expect(r.fallbacks / r.duels).toBeLessThan(0.05)
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

  // Acquis 4 : la boutique reste hors de portée du seul farming contre l'ordinateur.
  it('rapporte moins de la moitié en n’affrontant que l’ordinateur', () => {
    const ordinateur = moyenne(ORDINATEUR)
    expect(ordinateur.dollars).toBeLessThan(moyenne(RARE).dollars / 2)
    // Les trois suivantes sont des garde-fous structurels, pas des acquis : `duelOrdinateur` ne
    // touche jamais ces compteurs. Elles rougiraient si l'ordinateur se mettait un jour à
    // distribuer des plis ou des points.
    expect(ordinateur.points).toBe(0)
    expect(ordinateur.packs).toBe(0)
    expect(ordinateur.lost).toBe(0)
  })

  // Identité comptable, et rien de plus : chaque duel entre humains produit exactement une
  // victoire et une défaite. Ce test ne détecte pas un biais du moteur — il garde contre une
  // régression de comptage, du genre de celle qui faisait entrer les victoires contre
  // l'ordinateur dans le même compteur.
  it('équilibre victoires et défaites sur l’ensemble de la ligue', () => {
    const ligue = simulateLeague({ weeks: SAISON, seed: 'symetrie', policies: POLICIES })
    const humains = ligue.filter((j) => j.policy !== 'ordinateur')
    const wins = humains.reduce((a, j) => a + j.wins - j.computerWins, 0)
    const lost = humains.reduce((a, j) => a + j.lost, 0)
    expect(wins).toBe(lost)
  })

  it('refuse une politique inconnue au lieu de retomber silencieusement sur une autre', () => {
    expect(() => simulateLeague({ weeks: 1, seed: 'x', policies: ['nawak'] })).toThrow(/nawak/)
  })
})
