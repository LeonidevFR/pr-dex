import { writeFile } from 'node:fs/promises'
import { SPECIES } from '../shared/species.js'

const API = 'https://pokeapi.co/api/v2'
const OUT = new URL('../shared/species-info.json', import.meta.url)
const OUT_STATS = new URL('../shared/species-stats.js', import.meta.url)

/**
 * Les versions gen 1 n'ont jamais eu de traduction française : `flavor_text_entries` n'a
 * aucune entrée `fr` pour red, blue ou yellow. On se rabat sur les remakes gen 1, dont les
 * textes sont les plus fidèles à l'univers de la planche.
 */
const VERSION_PREFERENCE = ['firered', 'leafgreen']

/**
 * PokeAPI conserve la mise en page de la boîte de dialogue du jeu dans ces textes.
 * Le trait d'union conditionnel (U+00AD) est SUPPRIMÉ et non remplacé par une espace :
 * il coupait un mot au bord de la boîte, le remplacer scinderait le mot en deux.
 */
export const cleanFlavor = (text) =>
  text.replace(/­/g, '').replace(/[\n\f\r]/g, ' ').replace(/\s+/g, ' ').trim()

/** Premier texte français disponible, par ordre de préférence de version. */
export function pickFlavor(entries) {
  const fr = entries.filter((e) => e.language.name === 'fr')
  for (const version of VERSION_PREFERENCE) {
    const hit = fr.find((e) => e.version.name === version)
    if (hit) return cleanFlavor(hit.flavor_text)
  }
  return fr.length ? cleanFlavor(fr[0].flavor_text) : null
}

/** Total des six stats de base — la colonne vertébrale de la puissance en arène. */
export const statTotal = (stats) => stats.reduce((sum, s) => sum + s.base_stat, 0)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function get(path) {
  const res = await fetch(`${API}/${path}`)
  if (!res.ok) throw new Error(`PokeAPI ${path} → HTTP ${res.status}`)
  return res.json()
}

/** Les 18 types, une fois pour toutes : leur nom français ne dépend pas de l'espèce. */
async function frenchTypeNames() {
  const { results } = await get('type?limit=100')
  const map = {}
  for (const t of results) {
    const detail = await get(`type/${t.name}`)
    const fr = detail.names.find((n) => n.language.name === 'fr')
    if (fr) map[t.name] = fr.name
    await sleep(60)
  }
  return map
}

async function main() {
  const typeFr = await frenchTypeNames()
  const out = {}
  const statsOut = {}

  for (const [id] of SPECIES) {
    const mon = await get(`pokemon/${id}`)
    const species = await get(`pokemon-species/${id}`)

    const types = [...mon.types]
      .sort((a, b) => a.slot - b.slot)
      .map((t) => ({ slug: t.type.name, name: typeFr[t.type.name] }))
    const text = pickFlavor(species.flavor_text_entries)
    const stats = statTotal(mon.stats)

    // Échec bruyant plutôt que JSON partiel : une fiche silencieusement vide en production
    // est beaucoup plus difficile à repérer qu'un script qui refuse de finir.
    if (!types.length || types.some((t) => !t.name)) throw new Error(`types manquants pour l'id ${id}`)
    if (!text) throw new Error(`texte français manquant pour l'id ${id}`)
    if (!stats) throw new Error(`stats manquantes pour l'id ${id}`)

    out[id] = { types, text }
    statsOut[id] = stats
    process.stdout.write(`\r${id}/${SPECIES.length}`)
    await sleep(60)
  }

  // Une entrée par ligne : le diff d'une régénération reste lisible.
  const body = Object.entries(out)
    .map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v)}`)
    .join(',\n')
  await writeFile(OUT, `{\n${body}\n}\n`)

  // Un module JS et non du JSON : `shared/battle.js` est importé par Vite, par Vitest et
  // par Node nu (script de simulation), et Node exige `with { type: 'json' }` là où le
  // front s'en passe. Un module supprime la question.
  const statsBody = Object.entries(statsOut).map(([id, v]) => `  ${id}: ${v},`).join('\n')
  await writeFile(OUT_STATS, `/** Total des stats de base par espèce — généré par scripts/gen-species-info.mjs. */\nexport const STATS = {\n${statsBody}\n}\n`)

  console.log(`\n${Object.keys(out).length} espèces écrites dans shared/species-info.json`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
