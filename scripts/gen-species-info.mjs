import { writeFile } from 'node:fs/promises'
import { SPECIES, DEX } from '../shared/species.js'

const API = 'https://pokeapi.co/api/v2'
const OUT = new URL('../shared/species-info.json', import.meta.url)
const OUT_STATS = new URL('../shared/species-stats.js', import.meta.url)
const OUT_STATS_SQL = new URL('../supabase/seed.sql', import.meta.url)

/**
 * Les versions gen 1 n'ont jamais eu de traduction française : `flavor_text_entries` n'a
 * aucune entrée `fr` pour red, blue ou yellow. On se rabat sur les remakes gen 1, dont les
 * textes sont les plus fidèles à l'univers de la planche.
 */
const VERSION_PREFERENCE = ['firered', 'leafgreen']

/**
 * En-tête du seed, réécrit à l'identique à chaque régénération. Il vit ici et non dans le
 * fichier produit, sinon la première régénération l'effacerait en silence — et la base locale
 * repartirait sans ces droits, avec des tests d'isolation redevenus trompeurs.
 */
const SEED_HEADER = `-- Généré par scripts/gen-species-info.mjs — ne pas éditer à la main.

-- Droits que la production possède déjà sur les tables antérieures à l'arène : l'application
-- y lit \`catches\` et \`state\` tous les jours. La base locale ne les a pas, faute de privilèges
-- par défaut équivalents — sans eux, les tests d'isolation constateraient un refus de droit
-- au lieu du filtrage RLS qu'ils prétendent vérifier.
--
-- Rejouer ces \`grant\` en production est sans effet : ils y sont déjà.
grant select on public.profiles, public.identities, public.catches, public.state to authenticated;
grant update on public.identities, public.state to authenticated;
`

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

/**
 * Le seed complet, à partir du seul total des stats par espèce. Le palier ne vient pas de
 * PokéAPI mais de `DEX` : c'est une donnée du jeu, pas une donnée du Pokémon. D'où le mode
 * `--seed-only` plus bas — régénérer le seed pour un champ purement local n'a aucune raison
 * de rappeler l'API 320 fois.
 */
export function seedSql(statsById) {
  const rows = Object.entries(statsById).map(([id, stats]) => {
    // Échec bruyant : une espèce sans palier ferait échouer l'insertion en base bien plus
    // loin, sur une contrainte, sans dire laquelle des 151 lignes est en cause.
    const tier = DEX[id]?.tier
    if (!tier) throw new Error(`palier manquant pour l'id ${id}`)
    return `  (${id}, ${stats}, '${tier}')`
  })
  return `${SEED_HEADER}\ninsert into public.species_stats (species, stats, tier) values\n` +
    `${rows.join(',\n')}\non conflict (species) do update set ` +
    'stats = excluded.stats, tier = excluded.tier;\n'
}

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
    // Le total, lui, ne trahit rien : cinq statistiques sur six donnent une somme plausible
    // et fausse, qui fausserait silencieusement toute la puissance en arène.
    if (mon.stats.length !== 6) {
      throw new Error(`${mon.stats.length} statistiques au lieu de 6 pour l'id ${id}`)
    }

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

  // La même donnée en SQL, générée par le même passage : la fonction de combat du lot 2b la
  // lit en base, le moteur JavaScript la lit en module. Deux copies produites d'un seul
  // fichier source ne peuvent pas diverger sans qu'on le voie dans le même diff.
  await writeFile(OUT_STATS_SQL, seedSql(statsOut))

  console.log(`\n${Object.keys(out).length} espèces écrites dans shared/species-info.json, ` +
    'shared/species-stats.js et supabase/seed.sql')
}

/**
 * Régénère le seul `supabase/seed.sql`, à partir des totaux déjà collectés dans
 * `shared/species-stats.js`. Sert quand on ajoute au seed une donnée qui n'est pas dans
 * PokéAPI — le palier, par exemple : rappeler l'API 320 fois pour la réécrire à l'identique
 * coûterait dix minutes et risquerait de faire bouger des textes sans rapport avec le
 * changement en cours.
 */
async function seedOnly() {
  const { STATS } = await import('../shared/species-stats.js')
  await writeFile(OUT_STATS_SQL, seedSql(STATS))
  console.log(`${Object.keys(STATS).length} espèces écrites dans supabase/seed.sql`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = process.argv.includes('--seed-only') ? seedOnly : main
  run().catch((e) => { console.error(e); process.exit(1) })
}
