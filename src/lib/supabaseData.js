import { supabase } from './supabaseClient.js'

/** `kind` : 'conflict' | 'offline' | 'server' — mêmes usages que GithubError côté useCollection.js. */
export class SupabaseDataError extends Error {
  constructor(kind, message) {
    super(message)
    this.name = 'SupabaseDataError'
    this.kind = kind
  }
}

/** Taille d'une page de captures : au plus le plafond par défaut de Supabase (`max_rows`). */
const CATCHES_PAGE_SIZE = 1000

async function query(fn) {
  let result
  try {
    result = await fn()
  } catch {
    // supabase-js ne rejette que sur une panne réseau franche — jamais sur une erreur Postgres,
    // qui arrive dans `error` du résultat. Même distinction que fetch côté github.js.
    throw new SupabaseDataError('offline', 'Pas de connexion réseau.')
  }
  if (result.error) throw new SupabaseDataError('server', result.error.message)
  return result.data
}

/**
 * Même contrat que l'ancien createGithubClient (checkAccess/readCatches/readState/writeState) : useCollection.js
 * ne change pas d'une ligne entre les deux backends. `blobSha` porte en réalité l'entier `version`
 * de la table `state` — nom gardé pour ne pas toucher à l'appelant, qui le traite comme un jeton opaque.
 * `triggerCatch` est une addition sans équivalent côté ancien client (pas de bouton de sync à l'époque).
 * `readLeaderboard` est la seconde addition, pour le classement.
 */
export function createSupabaseClient(userId) {
  async function checkAccess() {
    await query(() => supabase.from('profiles').select('user_id').eq('user_id', userId).single())
    return true
  }

  /**
   * Page par page jusqu'à une page vide : Supabase tronque une réponse à `max_rows` (1000 par
   * défaut) sans le signaler. D'un seul tenant, un joueur au-delà de 1000 captures ne voyait
   * plus ses plus récentes. Le tri (date, id) est total, donc les pages ne se chevauchent pas.
   */
  async function readCatches() {
    const all = []
    for (;;) {
      const page = await query(() =>
        supabase
          .from('catches')
          .select('source, external_id, label, ref, url, date, species, shiny')
          .eq('user_id', userId)
          .order('date', { ascending: true })
          // À date égale, l'ordre d'insertion : c'est celui de `leaderboard_players()`, et les
          // succès « d'affilée » doivent lire la même suite partout.
          .order('id', { ascending: true })
          .range(all.length, all.length + CATCHES_PAGE_SIZE - 1),
      )
      if (!page.length) return all
      all.push(...page)
    }
  }

  async function readState() {
    const row = await query(() =>
      supabase.from('state').select('claimed, spent, evolutions, version').eq('user_id', userId).single(),
    )
    const { version, ...state } = row
    return { state, blobSha: version }
  }

  /**
   * Déclenche l'Action `catch.yml` sans attendre qu'elle tourne — la fonction Edge répond
   * dès que GitHub a accepté la mise en file, pas quand la capture est faite. `readCatches`
   * juste après n'aura donc rien de neuf tant que le run n'est pas terminé.
   */
  async function triggerCatch() {
    return query(() => supabase.functions.invoke('trigger-catch', { method: 'POST' }))
  }

  /** État des captures lancées depuis `since` : 'waiting' | 'running' | 'success' | 'failure'. */
  async function catchStatus(since) {
    const data = await query(() => supabase.functions.invoke('catch-status', { method: 'POST', body: { since } }))
    return data?.status
  }

  async function writeState(state, blobSha) {
    const version = blobSha ?? 0
    const data = await query(() =>
      supabase
        .from('state')
        .update({ ...state, version: version + 1 })
        .eq('user_id', userId)
        .eq('version', version)
        .select('version'),
    )
    // Predicat `version = version` non vérifié : un autre appareil a écrit entre-temps.
    // PostgREST répond 200 avec un tableau vide, jamais une erreur — même rôle que le 409 GitHub.
    if (!data.length) throw new SupabaseDataError('conflict', 'Écriture concurrente détectée.')
    return { blobSha: data[0].version }
  }

  /**
   * L'état d'arène du joueur, en une fois : son solde de crédits, son portefeuille, et les
   * niveaux de ses exemplaires. Trois lectures parce que ce sont trois tables — mais un seul
   * aller-retour utile côté ressenti, elles partent ensemble.
   */
  async function readArena() {
    const [credits, wallet, exemplars] = await Promise.all([
      query(() => supabase.rpc('arena_credits', { uid: userId })),
      query(() => supabase.from('arena_wallet').select('pokedollars').eq('user_id', userId).maybeSingle()),
      query(() => supabase.from('arena_exemplars')
        .select('entry_key, level, wins, destroyed_at, sold_at, sold_price').eq('user_id', userId)),
    ])
    return {
      credits: credits ?? 0,
      pokedollars: wallet?.pokedollars ?? 0,
      exemplars: exemplars ?? [],
    }
  }

  /**
   * Les défis ouverts, sans leur mise — la vue ne l'expose pas, et c'est tout le sel du mode :
   * on choisit qui l'on affronte, jamais ce que l'on affronte.
   */
  async function readOpenChallenges() {
    return query(() =>
      supabase
        .from('arena_open_challenges')
        .select('id, challenger_id, slug, login, created_at')
        .order('created_at', { ascending: true }),
    )
  }

  /**
   * Son propre défi en attente. Lisible par son seul auteur : le secret de la mise protège le
   * pari contre l'adversaire, pas contre celui dont le Pokémon est immobilisé.
   */
  /**
   * TOUS ses défis en attente, et non le premier.
   *
   * Un joueur peut en poster autant qu'il a de crédits — jusqu'à cinq. La lecture s'arrêtait au
   * premier : les autres restaient invisibles à leur auteur, qui ne savait plus lesquels de ses
   * Pokémon étaient immobilisés ni combien de défis il avait laissés traîner.
   */
  async function readMyOpen() {
    return query(() =>
      supabase
        .from('arena_duels')
        .select('id, challenger_key, created_at')
        .eq('challenger_id', userId)
        .eq('status', 'open')
        .order('created_at'),
    ) ?? []
  }

  /** Un duel résolu, avec de quoi rejouer le combat plutôt que d'avoir à croire son résultat. */
  async function readDuel(id) {
    return query(() =>
      supabase
        .from('arena_duels')
        .select('id, challenger_id, challenger_key, opponent_id, opponent_key, status, winner_id, ' +
                'stake_tier, challenger_power, opponent_power, probability, roll, resolved_at')
        .eq('id', id)
        .single(),
    )
  }

  /**
   * Le classement de la saison en cours, et les saisons closes avec leur podium.
   *
   * Deux lectures parce que ce sont deux choses : ce qui se joue et ce qui est acquis. Un badge
   * ne se recalcule pas depuis les points — ceux-ci repartent à zéro à chaque saison, et c'est
   * précisément pour ça que les podiums sont consignés à part.
   */
  const readSeasonLeaderboard = (season) =>
    query(() => supabase.from('arena_leaderboard')
      .select('user_id, slug, login, avatar_url, points, rank')
      .eq('season', season).order('rank'))

  const readSeasons = () =>
    query(() => supabase.from('arena_seasons').select('season, podium:arena_season_podium(user_id, rank, prize)')
      .order('season', { ascending: false }))

  /**
   * Les évolutions, telles que le serveur les tient. Elles vivaient dans `state.evolutions`,
   * que le client réécrivait en entier ; il ne les écrit plus, il les lit.
   */
  const readEvolutions = () =>
    query(() => supabase.from('evolutions')
      .select('id, from_species, to_species, from_key, day')
      .order('id'))

  /**
   * Fait évoluer un exemplaire. Le serveur vérifie tout — propriété, disponibilité, lignée,
   * bonbons — et rend l'identifiant de l'évolution créée, qui devient la clé du Pokémon obtenu.
   */
  const evolve = (fromKey, to, day) =>
    query(() => supabase.rpc('dex_evolve', { p_from_key: fromKey, p_to: to, p_day: day }))

  /**
   * Les duels récemment résolus où l'on figurait, le plus frais d'abord.
   *
   * Un défi que personne ne relève est résolu par la maison au bout de vingt-quatre heures : on
   * peut donc perdre un Pokémon pendant la nuit. Sans cette lecture, rien ne le dit — on le
   * découvre en constatant une absence, ce qui se lit comme une panne plutôt que comme une
   * défaite.
   *
   * La politique RLS ne rend que les duels résolus où l'on est l'un des deux camps : la requête
   * n'a donc pas à filtrer, elle ne peut pas voir autre chose.
   */
  const readMyDuels = (limite = 10) =>
    query(() => supabase.from('arena_duels')
      .select('*')
      .neq('status', 'open')
      .order('resolved_at', { ascending: false })
      .limit(limite))

  /**
   * L'historique de ses duels joués, une page à la fois, le plus récent d'abord.
   *
   * Les filtres s'appliquent côté base et non sur la page reçue : filtrer vingt lignes déjà
   * lues donnerait trois défaites, puis un « Voir plus » qui en apporterait deux autres, et
   * l'on croirait la liste finie. On lit une ligne de plus que la page pour savoir s'il en
   * reste, sans compter toute la table.
   *
   * Le nom de l'adversaire vient d'`arena_identities` : la ligne du duel ne porte que son
   * identifiant. Un duel contre l'ordinateur n'a pas d'adversaire, `winner_id` nul y veut dire
   * que l'ordinateur a gagné.
   *
   * @param {{ userId: string, offset?: number, limit?: number,
   *   issue?: 'tous'|'gagnes'|'perdus', adversaire?: 'tous'|'joueur'|'ordinateur' }} options
   * @returns {Promise<{ duels: Array, plus: boolean }>}
   */
  async function readDuelHistory({ userId, offset = 0, limit = 20, issue = 'tous', adversaire = 'tous' }) {
    const lignes = await query(() => {
      let q = supabase.from('arena_duels').select('*').neq('status', 'open')
      if (issue === 'gagnes') q = q.eq('winner_id', userId)
      if (issue === 'perdus') q = q.or(`winner_id.is.null,winner_id.neq.${userId}`)
      if (adversaire === 'joueur') q = q.eq('status', 'resolved')
      if (adversaire === 'ordinateur') q = q.eq('status', 'computer')
      return q.order('resolved_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + limit)
    }) ?? []
    const duels = lignes.slice(0, limit)
    const autres = [...new Set(duels
      .map((d) => (d.challenger_id === userId ? d.opponent_id : d.challenger_id))
      .filter(Boolean))]
    let noms = new Map()
    if (autres.length) {
      const ids = await query(() => supabase.from('arena_identities').select('user_id, login').in('user_id', autres))
      noms = new Map((ids ?? []).map((i) => [i.user_id, i.login]))
    }
    return {
      duels: duels.map((d) => {
        const autre = d.challenger_id === userId ? d.opponent_id : d.challenger_id
        return { ...d, adversaire_login: autre ? noms.get(autre) ?? null : null }
      }),
      plus: lignes.length > limit,
    }
  }

  /**
   * Le dossier public d'un joueur : le sien, ou celui d'un collègue.
   *
   * La vue ne porte QUE ce que la spec § 5 autorise à publier — espèces, victoires, défaites.
   * Les exemplaires, la caisse et les crédits n'y sont pas, et c'est voulu : un écran peut
   * oublier de cacher une colonne, une colonne absente de la vue ne peut pas fuir. Le dossier
   * complet du joueur courant se compose donc à côté, avec ses propres lectures.
   */
  const CHAMPS_PROFIL = 'user_id, slug, login, avatar_url, species, wins, losses'

  const readPublicProfile = (slug) =>
    query(() => supabase.from('arena_public_profile').select(CHAMPS_PROFIL)
      .eq('slug', slug).maybeSingle())

  const readMyProfile = (uid) =>
    query(() => supabase.from('arena_public_profile').select(CHAMPS_PROFIL)
      .eq('user_id', uid).maybeSingle())

  /**
   * Les exemplaires perdus à l'arène. Ils ne sortent jamais du dossier public : c'est une
   * information à soi, et elle ne regarde personne d'autre.
   */
  const readDestroyed = () =>
    query(() => supabase.from('arena_exemplars').select('entry_key, level, wins, destroyed_at')
      .not('destroyed_at', 'is', null).order('destroyed_at', { ascending: false }))

  /** Le catalogue vient de la base, jamais des constantes du front : c'est elle qui débite. */
  const readShop = () =>
    query(() => supabase.from('arena_shop').select('slug, gen, tier, fresh, price').order('price'))

  const buy = (slug) => query(() => supabase.rpc('arena_buy', { p_slug: slug }))

  /**
   * Vendre un lot d'exemplaires. Le prix n'est pas envoyé : le serveur le calcule, sinon il
   * serait un champ de formulaire. La réponse rend le nombre vendu, le total et le nouveau solde.
   */
  const sell = (keys) => query(() => supabase.rpc('dex_sell', { p_keys: keys }))

  const engage = (entryKey, vsComputer = false) =>
    query(() => supabase.rpc('arena_engage', { p_entry_key: entryKey, p_vs_computer: vsComputer }))

  const accept = (duelId, entryKey) =>
    query(() => supabase.rpc('arena_accept', { p_duel_id: duelId, p_entry_key: entryKey }))

  /**
   * Les captures ouvertes et les évolutions de tous les joueurs, réduites à ce que le
   * classement calcule (cf. `leaderboard_players` côté base). C'est la seule lecture qui
   * traverse RLS : elle passe par une fonction, jamais par un `from()` sur les tables.
   */
  async function readLeaderboard() {
    return query(() => supabase.rpc('leaderboard_players'))
  }

  async function readAchievements() {
    return query(() =>
      supabase.from('achievements').select('code, unlocked_at, trigger_key, announced').eq('user_id', userId),
    )
  }

  /**
   * `on conflict do nothing` : deux onglets qui débloquent le même succès n'écrivent qu'une
   * ligne, et le second n'échoue pas. Renvoie les seules lignes vraiment insérées : un succès
   * déjà en base ne doit pas être annoncé une seconde fois.
   */
  async function insertAchievements(rows) {
    return query(() =>
      supabase
        .from('achievements')
        .upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: 'user_id,code', ignoreDuplicates: true })
        .select('code'),
    )
  }

  async function markAnnounced(codes) {
    return query(() =>
      supabase.from('achievements').update({ announced: true }).eq('user_id', userId).in('code', codes),
    )
  }

  /** Le nombre de joueurs par succès : seule lecture des succès des autres (cf. la migration). */
  async function readAchievementCounts() {
    return query(() => supabase.rpc('achievement_counts'))
  }

  return {
    checkAccess, readCatches, readState, writeState, triggerCatch, catchStatus, readLeaderboard,
    readArena, readOpenChallenges, readMyOpen, readDuel, readShop, buy, readSeasonLeaderboard,
    readSeasons, engage, accept,
    readPublicProfile, readMyProfile, readDestroyed, readMyDuels, readDuelHistory, sell,
    readEvolutions, evolve,
    readAchievements, insertAchievements, markAnnounced, readAchievementCounts,
  }
}
