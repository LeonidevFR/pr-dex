import { fnv1a, drawFromSha } from '../../shared/draw.js'

const FAKE_PRS = [
  ['fix: race condition à l\'upload de fichiers', 'moi/atlas', 142, '2026-02-03'],
  ['feat: pagination curseur sur /events', 'moi/atlas', 145, '2026-02-11'],
  ['chore: bump vite 5 → 6', 'moi/atlas', 147, '2026-02-14'],
  ['refactor: extraire le client HTTP', 'moi/atlas', 151, '2026-02-20'],
  ['fix: fuseau horaire dans les exports CSV', 'moi/atlas', 153, '2026-02-24'],
  ['feat: mode sombre', 'moi/pergola', 12, '2026-03-01'],
  ['test: couvrir le parser de dates', 'moi/atlas', 158, '2026-03-05'],
  ['fix: memory leak sur le worker', 'moi/atlas', 161, '2026-03-09'],
  ['docs: README de contribution', 'moi/pergola', 14, '2026-03-12'],
  ['feat: recherche floue dans la sidebar', 'moi/pergola', 17, '2026-03-18'],
  ['perf: index sur user_id', 'moi/atlas', 166, '2026-03-22'],
  ['fix: crash au resize sur Safari', 'moi/pergola', 21, '2026-03-27'],
  ['feat: webhooks sortants', 'moi/atlas', 170, '2026-04-02'],
  ['chore: migrer CI vers Actions', 'moi/atlas', 172, '2026-04-06'],
  ['fix: double soumission du formulaire', 'moi/pergola', 25, '2026-04-10'],
  ['feat: raccourcis clavier', 'moi/pergola', 28, '2026-04-15'],
  ['refactor: virer le state global', 'moi/atlas', 178, '2026-04-19'],
  ['fix: encodage des accents en PDF', 'moi/atlas', 181, '2026-04-23'],
  ['feat: import CSV en masse', 'moi/atlas', 184, '2026-04-28'],
  ['style: harmoniser les espacements', 'moi/pergola', 31, '2026-05-02'],
  ['fix: retry exponentiel sur 429', 'moi/atlas', 188, '2026-05-07'],
  ['feat: aperçu avant publication', 'moi/pergola', 34, '2026-05-11'],
  ['chore: nettoyer les deps mortes', 'moi/atlas', 191, '2026-05-15'],
  ['fix: focus trap dans la modale', 'moi/pergola', 37, '2026-05-19'],
  ['feat: export vers Notion', 'moi/atlas', 195, '2026-05-24'],
  ['perf: lazy-load des sprites', 'moi/pergola', 40, '2026-05-28'],
  ['fix: régression sur le tri par date', 'moi/atlas', 199, '2026-06-02'],
  ['feat: filtres combinés', 'moi/atlas', 203, '2026-06-06'],
  ['refactor: passer les hooks en composables', 'moi/pergola', 44, '2026-06-11'],
  ['fix: 404 sur les routes profondes', 'moi/pergola', 47, '2026-06-15'],
  ['feat: undo/redo', 'moi/pergola', 51, '2026-06-20'],
  ['chore: passer en pnpm', 'moi/atlas', 208, '2026-06-24'],
  ['fix: overflow sur mobile', 'moi/pergola', 54, '2026-06-28'],
  ['feat: notifications par e-mail', 'moi/atlas', 212, '2026-07-02'],
  ['test: e2e du parcours d\'inscription', 'moi/atlas', 215, '2026-07-06'],
  ['fix: cache invalidé trop tôt', 'moi/pergola', 58, '2026-07-09'],
  ['feat: thèmes personnalisés', 'moi/pergola', 61, '2026-07-13'],
  ['fix: null check sur avatar_url', 'moi/atlas', 219, '2026-07-15'],
  ['feat: recherche par tag', 'moi/atlas', 221, '2026-07-16'],
  ['chore: mettre à jour les types', 'moi/pergola', 63, '2026-07-17'],
]

// Cinq hachages 32 bits rendus en hexadécimal — on utilise tous les bits de sortie.
// Un `% 16` sur FNV-1a ne dépendrait que des quartets bas de l'entrée et s'effondrerait
// sur une poignée de valeurs distinctes (16 sha pour 40 PR, mesuré).
const fakeSha = (i) =>
  Array.from({ length: 5 }, (_, k) => fnv1a(`seed${i}/${k}`).toString(16).padStart(8, '0')).join('')

export function demoCatches() {
  const drawn = FAKE_PRS.map(([title, repo, pr, date], i) => {
    const sha = fakeSha(i)
    const { species, shiny } = drawFromSha(sha)
    // Aucun chromatique ne sort naturellement des 40 tirages : on en force deux pour que
    // le cas soit visible en démo — un capturé (au tiroir et à la fiche) et un en attente
    // (au rituel).
    const forcedShiny = i === 9 || i === FAKE_PRS.length - 2
    return { sha, repo, pr, title, date, species, shiny: shiny || forcedShiny }
  })

  // Aucune famille n'atteint le seuil de bonbons dans les 40 tirages naturels : on force une
  // troisième capture Roucool (la lignée en compte déjà deux, cf. plus haut) pour que le badge
  // « peut évoluer » de la grille soit visible dès la démo. Insérée juste avant les 3 en attente
  // pour rester capturée sans toucher ni aux 40 tirages naturels ni au nombre de plis en attente.
  drawn.splice(-3, 0, {
    sha: 'ev0e1c10ded1c4700000000000000000000000',
    repo: 'moi/atlas', pr: 224, title: 'fix: timeout sur le webhook Slack',
    date: '2026-07-18', species: 16, shiny: false,
  })

  // Idem pour une légendaire : à 0,5 % par tirage, aucune ne sort naturellement sur 40-41
  // essais. Sulfura forcée pour que le halo légendaire de la grille soit visible en démo.
  drawn.splice(-3, 0, {
    sha: 'ev1eg3ndary000000000000000000000000000',
    repo: 'moi/atlas', pr: 225, title: 'perf: cache des agrégats du dashboard',
    date: '2026-07-19', species: 146, shiny: false,
  })

  return drawn
}

/** Client en mémoire respectant l'interface commune des clients de données. Trois PR restent à ouvrir. */
export function loadDemoClient() {
  const catches = demoCatches()
  let state = { claimed: catches.slice(0, -3).map((c) => c.sha), spent: {}, evolutions: [] }
  return {
    checkAccess: async () => true,
    readCatches: async () => catches,
    readState: async () => ({ state: JSON.parse(JSON.stringify(state)), blobSha: 'demo' }),
    writeState: async (next) => { state = JSON.parse(JSON.stringify(next)); return { blobSha: 'demo' } },
  }
}
