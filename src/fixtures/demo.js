import { fnv1a, drawFrom } from '../../shared/draw.js'
import { entryKey } from '../../shared/entry.js'

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

/** Une capture GitHub telle que le connecteur la produirait, sans passer par l'API. */
const ghCatch = (sha, repo, pr, label, date, species, shiny) => ({
  source: 'github',
  external_id: sha,
  label,
  ref: `${repo}#${pr} · ${sha.slice(0, 7)}`,
  url: `https://github.com/${repo}/pull/${pr}`,
  date,
  species,
  shiny,
})

/**
 * Une seconde source, inventée pour la démo. Aucune source métier réelle n'est branchée à ce
 * jour : `crm` n'existe que dans ce fichier, jamais en base ni dans `CONNECTORS`.
 *
 * Elle est là pour rendre visible ce que le découpage par source a changé — un dex qui mêle
 * deux pôles — sur les trois endroits où ça se voit : la provenance sous chaque case du
 * tiroir, le libellé du pli, et la ligne du journal. Elle sert aussi de cas limite utile :
 * pas d'`url`, donc une ligne de journal non cliquable, ce qu'une source sans page par
 * événement produirait pour de vrai.
 */
const crmCatch = (id, client, note, date) => {
  const { species, shiny } = drawFrom(entryKey('crm', id))
  return {
    source: 'crm',
    external_id: id,
    label: `${client} — ${note}/10`,
    ref: `enquête valeur · ${date}`,
    url: null,
    date,
    species,
    shiny,
  }
}

const FAKE_CRM = [
  ['104428', 'Groupe Meridiem', 9, '2026-06-12'],
  ['104517', 'Hôtels du Littoral', 10, '2026-06-19'],
  ['104603', 'Résidences Vallon', 8, '2026-06-27'],
  ['104790', 'Groupe Meridiem', 10, '2026-07-08'],
  ['104862', 'Camping Les Ormes', 9, '2026-07-14'],
]

export function demoCatches() {
  const drawn = FAKE_PRS.map(([title, repo, pr, date], i) => {
    const sha = fakeSha(i)
    const { species, shiny } = drawFrom(entryKey('github', sha))
    // Aucun chromatique ne sort naturellement des 40 tirages : on en force deux pour que
    // le cas soit visible en démo — un capturé (au tiroir et à la fiche) et un en attente
    // (au rituel).
    const forcedShiny = i === 9 || i === FAKE_PRS.length - 2
    return ghCatch(sha, repo, pr, title, date, species, shiny || forcedShiny)
  })

  // Aucune famille n'atteint le seuil de bonbons dans les 40 tirages naturels : on force une
  // troisième capture Roucool (la lignée en compte déjà deux, cf. plus haut) pour que le badge
  // « peut évoluer » de la grille soit visible dès la démo. Insérée juste avant les 3 en attente
  // pour rester capturée sans toucher ni aux 40 tirages naturels ni au nombre de plis en attente.
  drawn.splice(-3, 0, ghCatch(
    'ev0e1c10ded1c4700000000000000000000000',
    'moi/atlas', 224, 'fix: timeout sur le webhook Slack', '2026-07-18', 16, false,
  ))

  // Un troisième exemplaire Chenipan, forcé chromatique : Chenipan a déjà deux exemplaires
  // non-shiny et évolue dès la démo (cf. les 40 tirages naturels), ce qui en fait le cas de
  // démo du sélecteur d'exemplaire — un shiny pré-coché par défaut, mais un normal disponible
  // pour tester le changement de sélection avant de confirmer l'évolution.
  drawn.splice(-3, 0, ghCatch(
    'ev2ch3n1p4n000000000000000000000000000',
    'moi/atlas', 226, 'fix: timeout sur la génération du sprite', '2026-07-19', 10, true,
  ))

  // Idem pour une légendaire : à 0,5 % par tirage, aucune ne sort naturellement sur 40-41
  // essais. Sulfura forcée pour que le halo légendaire de la grille soit visible en démo.
  drawn.splice(-3, 0, ghCatch(
    'ev1eg3ndary000000000000000000000000000',
    'moi/atlas', 225, 'perf: cache des agrégats du dashboard', '2026-07-19', 146, false,
  ))

  // Un Mewtwo shiny, déjà ouvert : sans légendaire shiny, la démo ne montrerait jamais le dos
  // Holo, réservé à la carte la plus rare du jeu. Inséré avant la file pour rester capturé.
  drawn.splice(-3, 0, ghCatch(
    'ev3m3wtw0sh1ny0000000000000000000000000',
    'moi/atlas', 241, 'feat: classement d’équipe', '2026-07-20', 150, true,
  ))

  // Quatre captures de la seconde source déjà ouvertes, insérées avant la file d'attente…
  drawn.splice(-3, 0, ...FAKE_CRM.slice(0, -1).map((c) => crmCatch(...c)))

  // …et la cinquième glissée dans les derniers, donc en attente. Sa date la place en tête de
  // file : le premier pli scellé de la démo vient de l'autre pôle, ce qui est précisément ce
  // qu'on cherche à montrer.
  drawn.splice(-1, 0, crmCatch(...FAKE_CRM[FAKE_CRM.length - 1]))

  // Une seconde légendaire, celle-là laissée EN ATTENTE : sans elle, la démo ne permet pas
  // d'ouvrir un pli légendaire, donc pas de juger la seule fanfare qui tape vraiment fort.
  // Insérée en DERNIER, après toutes les autres : chaque `splice` en fin de tableau repousse
  // ce qui précède, et une insertion trop tôt sortait de la file d'attente sans qu'on le voie.
  // Sa date la place juste derrière le pli de la seconde source, qui garde la tête de file.
  drawn.splice(-1, 0, ghCatch(
    'ev1eg3ndary2000000000000000000000000000',
    'moi/atlas', 227, 'feat: file d’attente prioritaire sur la synchro', '2026-07-15', 144, false,
  ))

  return drawn
}

// Avatar sans réseau : une lettre sur un disque, en SVG inline. Jamais une URL GitHub
// réelle — la démo ne doit désigner personne.
const svgAvatar = (login) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#6f6350"/>` +
    `<text x="20" y="26" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#e7ddc7">${login[0].toUpperCase()}</text></svg>`,
  )

// Quatre joueurs fictifs à effectifs très différents, pour que le classement ait un ordre
// lisible d'un coup d'œil. Tirages déterministes (`drawFrom` sur un seed fixe), datés en
// remontant depuis aujourd'hui tous les six jours : les derniers tombent dans les 30 jours.
const FAKE_PLAYERS = [['marge', 12], ['ondine', 27], ['pierre', 41], ['sacha', 58]]

function demoPlayers() {
  const now = Date.now()
  const dateAt = (stepsBack) => new Date(now - stepsBack * 6 * 86_400_000).toISOString().slice(0, 10)
  return FAKE_PLAYERS.map(([login, count]) => {
    const catches = Array.from({ length: count }, (_, n) => {
      const id = `${login}-${n}`
      const { species, shiny } = drawFrom(entryKey('demo', id))
      return { source: 'demo', external_id: id, species, shiny, date: dateAt(count - 1 - n) }
    })
    // Aucun chromatique ni légendaire ne sort naturellement sur si peu de tirages, et une
    // lignée complète demande une évolution : on force ce qu'il faut sur le meneur pour que
    // chaque colonne soit non nulle au moins une fois. Chenipan (10) en n=7 puis deux
    // évolutions en chaîne donnent la lignée Chenipan → Chrysacier → Papilusion.
    let evolutions = []
    if (login === 'sacha') {
      catches[3].shiny = true
      catches[5].species = 150
      catches[7].species = 10
      evolutions = [
        { species: 11, from: 10, date: dateAt(2), fromKey: entryKey('demo', `${login}-7`) },
        { species: 12, from: 11, date: dateAt(1), fromKey: 'evo:0' },
      ]
    }
    if (login === 'ondine') catches[10].shiny = true
    return { login, avatar_url: svgAvatar(login), is_me: false, catches, evolutions }
  })
}

/**
 * Client en mémoire respectant l'interface commune des clients de données. Quatre plis restent
 * à ouvrir : un venu de la seconde source, un légendaire, et deux ordinaires. Le classement y
 * compte quatre joueurs fictifs plus le joueur courant.
 */
export function loadDemoClient() {
  const catches = demoCatches()
  let state = {
    claimed: catches.slice(0, -4).map((c) => entryKey(c.source, c.external_id)),
    spent: {},
    evolutions: [],
  }
  return {
    checkAccess: async () => true,
    readCatches: async () => catches,
    readState: async () => ({ state: JSON.parse(JSON.stringify(state)), blobSha: 'demo' }),
    writeState: async (next) => { state = JSON.parse(JSON.stringify(next)); return { blobSha: 'demo' } },
    // Rien à déclencher en démo : pas de vraie Action, pas de vrai repo derrière.
    triggerCatch: async () => {},
    // La ligne « démo » se construit à chaque appel depuis l'état courant : ouvrir un pli ou
    // faire une évolution, puis rouvrir le panneau, doit faire bouger sa ligne — c'est ce
    // qui rend la démo utile pour juger le panneau.
    readLeaderboard: async () => {
      const opened = catches
        .filter((c) => state.claimed.includes(entryKey(c.source, c.external_id)))
        .map(({ source, external_id, species, shiny, date }) => ({ source, external_id, species, shiny, date }))
      return [
        ...demoPlayers(),
        { login: 'démo', avatar_url: svgAvatar('démo'), is_me: true, catches: opened, evolutions: state.evolutions },
      ]
    },
  }
}
