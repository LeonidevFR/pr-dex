import { writeFile } from 'node:fs/promises'
import { STATS } from '../shared/species-stats.js'

const API = 'https://pokeapi.co/api/v2'
const OUT = new URL('../shared/species-gen2.js', import.meta.url)

const FIRST = 152
const LAST = 251

/**
 * Les six légendaires de la seconde génération. Posés à la main plutôt que déduits d'un
 * `is_legendary` de l'API : la notion y recouvre aussi les « fabuleux » et a bougé au fil des
 * générations, alors que ce jeu a besoin d'une liste stable — c'est elle qui décide du palier
 * le plus cher de la boutique.
 */
const LEGENDAIRES = new Set([243, 244, 245, 249, 250, 251])

/**
 * Le palier d'une espèce Gen 2 se déduit de son total de stats, sur les bornes observées dans
 * la planche Gen 1 déjà en service (moyennes mesurées : 280 commun, 402 peu commun, 458 rare,
 * 604 légendaire).
 *
 * Un choix à la main aurait été plus fidèle à l'esprit de la Gen 1, dont les paliers ont été
 * arbitrés espèce par espèce — mais cent arbitrages inventés seraient cent occasions de se
 * tromper en silence, là où une règle énoncée se conteste et se rejoue. Elle est ici, elle
 * tient en trois seuils, et le fichier produit reste éditable à la main si un cas choque.
 */
const SEUILS = [[330, 'c'], [430, 'u']]

function palier(id, stats) {
  if (LEGENDAIRES.has(id)) return 'l'
  for (const [max, t] of SEUILS) if (stats < max) return t
  return 'r'
}

/**
 * Le coût en bonbons suit la règle de la Gen 1 : 8 pour une première évolution, 16 pour une
 * seconde. Magicarpe y fait exception à 40, mais c'est une exception assumée sur une espèce
 * précise, pas une règle à généraliser.
 */
const cout = (etage) => (etage === 0 ? 8 : 16)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path) {
  const res = await fetch(`${API}/${path}`)
  if (!res.ok) throw new Error(`PokeAPI ${path} → HTTP ${res.status}`)
  return res.json()
}

/** Le nom français, seul retenu : toute l'interface du jeu est en français. */
function nomFr(species) {
  const fr = species.names.find((n) => n.language.name === 'fr')
  if (!fr) throw new Error(`nom français manquant pour ${species.id}`)
  return fr.name
}

/**
 * Rend, pour chaque espèce de la chaîne, vers quoi elle évolue et à quel étage elle se trouve.
 * Les espèces hors Gen 2 sont conservées dans le parcours — une chaîne peut commencer en Gen 1
 * (Évoli, Rondoudou) — mais seules celles de la fenêtre sont écrites.
 */
function parcourirChaine(node, etage, acc) {
  const id = Number(node.species.url.match(/\/(\d+)\/?$/)[1])
  const suivants = node.evolves_to.map((n) => Number(n.species.url.match(/\/(\d+)\/?$/)[1]))
  acc.set(id, { to: suivants, etage })
  for (const enfant of node.evolves_to) parcourirChaine(enfant, etage + 1, acc)
  return acc
}

async function main() {
  const especes = []
  const chaines = new Map()

  for (let id = FIRST; id <= LAST; id++) {
    const species = await get(`pokemon-species/${id}`)
    const mon = await get(`pokemon/${id}`)
    const stats = mon.stats.reduce((a, s) => a + s.base_stat, 0)

    if (!chaines.has(species.evolution_chain.url)) {
      const chaine = await get(species.evolution_chain.url.replace(`${API}/`, ''))
      chaines.set(species.evolution_chain.url, parcourirChaine(chaine.chain, 0, new Map()))
    }
    const infos = chaines.get(species.evolution_chain.url).get(id) ?? { to: [], etage: 0 }

    especes.push({ id, nom: nomFr(species), stats, tier: palier(id, stats), ...infos })
    process.stdout.write(`\r${id - FIRST + 1}/${LAST - FIRST + 1}`)
    await sleep(60)
  }

  // Une évolution qui sort de la fenêtre Gen 2 n'a pas sa place ici : la planche des 151 ne doit
  // pas se mettre à pointer vers des espèces qu'elle ne contient pas.
  const dansLaFenetre = new Set(especes.map((e) => e.id))
  const lignes = especes.map((e) => {
    const to = e.to.filter((t) => dansLaFenetre.has(t))
    const cible = to.length === 0 ? null : to.length === 1 ? to[0] : to
    const suffixe = cible === null ? '' : `, ${JSON.stringify(cible)}, ${cout(e.etage)}`
    return `  [${e.id}, ${JSON.stringify(e.nom)}, '${e.tier}'${suffixe}],`
  })

  const stats = Object.fromEntries(especes.map((e) => [e.id, e.stats]))
  const repartition = especes.reduce((a, e) => ({ ...a, [e.tier]: (a[e.tier] ?? 0) + 1 }), {})

  await writeFile(OUT, `// Généré par scripts/gen-species-gen2.mjs — ne pas éditer à la main,
// sauf pour corriger un palier qui choquerait : la règle est une commodité, pas un dogme.
//
// Répartition obtenue : ${JSON.stringify(repartition)}
//
// Ces espèces N'ENTRENT JAMAIS dans le tirage du travail — elles ne s'obtiennent qu'en
// boutique, avec des pokédollars gagnés en arène. C'est ce qui les garde désirables sans
// toucher aux cotes de personne.
export const SPECIES_GEN2 = [
${lignes.join('\n')}
]

export const STATS_GEN2 = ${JSON.stringify(stats)}
`)

  console.log(`\n${especes.length} espèces écrites dans shared/species-gen2.js`)
  console.log('répartition des paliers :', repartition)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1) })
}

export { palier, cout, parcourirChaine, nomFr }
