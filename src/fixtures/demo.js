import { fnv1a, drawFrom } from '../../shared/draw.js'
import { entryKey } from '../../shared/entry.js'
import { DEX } from '../../shared/species.js'
import { FORMS, formOf, power, resolveDuel } from '../../shared/battle.js'
import { REWARD, coveredTier } from '../../shared/arena-economy.js'

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

  // Quatre captures de la seconde source déjà ouvertes, insérées avant la file d'attente…
  drawn.splice(-3, 0, ...FAKE_CRM.slice(0, -1).map((c) => crmCatch(...c)))

  // …et la cinquième glissée dans les trois derniers, donc en attente. Sa date la place en
  // tête de file : le premier pli scellé de la démo vient de l'autre pôle, ce qui est
  // précisément ce qu'on cherche à montrer. Le nombre de plis en attente reste à trois.
  drawn.splice(-1, 0, crmCatch(...FAKE_CRM[FAKE_CRM.length - 1]))

  return drawn
}

/**
 * Client en mémoire respectant l'interface commune des clients de données. Trois plis restent
 * à ouvrir, dont un venu de la seconde source.
 */
export function loadDemoClient() {
  const catches = demoCatches()
  let state = {
    claimed: catches.slice(0, -3).map((c) => entryKey(c.source, c.external_id)),
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
    ...demoArena(catches),
  }
}

/**
 * L'arène en mémoire, avec le VRAI moteur de combat — `resolveDuel` est le même module que
 * celui dont la parité avec le SQL est prouvée. La démo n'imite donc pas les duels, elle les
 * joue : ce qu'on voit sans compte est exactement ce qui se produirait avec.
 *
 * Ce qu'elle ne reproduit pas, et ne peut pas : la concurrence, l'atomicité et les policies —
 * tout ce qui n'existe que parce qu'il y a plusieurs joueurs et une base.
 */
export function demoArena(catches) {
  const RIVAUX = [
    { id: 'demo-bob', pseudo: 'bob', species: 130, level: 6 },
    { id: 'demo-ada', pseudo: 'ada', species: 59, level: 2 },
  ]
  const JOUR = '2026-08-11'
  const MOI = 'demo-moi'

  let credits = 5
  let pokedollars = 250
  let seq = 100
  const levels = new Map()
  const destroyed = new Set()
  const duels = new Map()
  let mine_ouverte = null
  const challenges = RIVAUX.map((r, i) => ({
    id: i + 1, challenger_id: r.id, pseudo: r.pseudo, created_at: JOUR, rival: r,
  }))

  const especeDe = (key) => catches.find((c) => entryKey(c.source, c.external_id) === key)?.species

  const cote = (key, species, level) => ({
    key, species, level, form: formOf(key, JOUR),
  })

  /** Écrit le duel résolu sous la forme exacte que rend la base, pour que l'écran ne voie aucune différence. */
  function enregistrer(id, moi, lui, out, statut, adversaireId) {
    const gagne = out.winner === 'left'
    duels.set(id, {
      id,
      challenger_id: MOI,
      challenger_key: moi.key,
      opponent_id: adversaireId,
      opponent_key: lui.key,
      status: statut,
      winner_id: gagne ? MOI : adversaireId,
      stake_tier: coveredTier(DEX[moi.species].tier, DEX[lui.species].tier),
      challenger_species: moi.species,
      opponent_species: lui.species,
      challenger_level: moi.level,
      opponent_level: lui.level,
      challenger_form: FORMS.indexOf(moi.form),
      opponent_form: FORMS.indexOf(lui.form),
      challenger_power: power(moi),
      opponent_power: power(lui),
      probability: out.probability,
      roll: out.roll,
      resolved_at: JOUR,
    })
    if (gagne) {
      levels.set(moi.key, out.levelAfter)
      pokedollars += statut === 'computer'
        ? Math.round(REWARD[duels.get(id).stake_tier].dollars / 5)
        : REWARD[duels.get(id).stake_tier].dollars
    } else if (statut !== 'computer') {
      destroyed.add(moi.key)
    }
    return duels.get(id)
  }

  function jouer(key, adversaire, statut, adversaireId) {
    credits = Math.max(0, credits - 1)
    const id = ++seq
    const moi = cote(key, especeDe(key), levels.get(key) ?? 1)
    const lui = cote(`${statut}:${id}`, adversaire.species, adversaire.level)
    const out = resolveDuel({ left: moi, right: lui, seed: `demo:${id}` })
    return enregistrer(id, moi, lui, out, statut, adversaireId)
  }

  return {
    readArena: async () => ({
      credits,
      pokedollars,
      exemplars: [...levels].map(([entry_key, level]) => ({
        entry_key, level, wins: level - 1, destroyed_at: null,
      })).concat([...destroyed].map((entry_key) => ({
        entry_key, level: levels.get(entry_key) ?? 1, wins: 0, destroyed_at: JOUR,
      }))),
    }),
    readOpenChallenges: async () => challenges.map(({ rival, ...c }) => c),
    readDuel: async (id) => duels.get(id) ?? null,
    readMyOpen: async () => (mine_ouverte
      ? { id: mine_ouverte.id, challenger_key: mine_ouverte.key, species: especeDe(mine_ouverte.key) }
      : null),
    /**
     * Poster un défi ne le résout pas : il reste ouvert, comme en vrai, et c'est l'ordinateur
     * qui le relèvera au bout de 24 h si personne ne s'en charge. La démo le rend visible dans
     * la liste et rappelle qui l'a posé — sans jamais montrer ce qui a été engagé.
     */
    engage: async (key, vsComputer) => {
      if (!vsComputer) {
        credits = Math.max(0, credits - 1)
        const id = ++seq
        mine_ouverte = { id, key }
        challenges.push({ id, challenger_id: MOI, pseudo: 'toi', created_at: JOUR, rival: null })
        return id
      }
      return jouer(key, { species: 20, level: 2 }, 'computer', null).id
    },
    accept: async (duelId, key) => {
      const defi = challenges.find((c) => c.id === duelId)
      const duel = jouer(key, defi.rival, 'resolved', defi.challenger_id)
      challenges.splice(challenges.indexOf(defi), 1)
      return duel.id
    },
  }
}
