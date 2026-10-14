/**
 * Les huit badges d'arène, dessinés pour ce dex.
 *
 * Ils étaient découpés d'une planche vectorielle tierce — les badges de Kanto, en plat
 * multicolore. Trois raisons de les refaire. Leurs couleurs bonbon ne tenaient dans aucun des
 * deux thèmes de la refonte, qui est en papier, or et encre. Ils portaient une attribution dans
 * les réglages pour un dessin qu'on ne contrôlait pas. Et chacun traînait trente-cinq classes
 * CSS identiques d'un badge à l'autre, préfixées à la main pour qu'ils ne se repeignent pas
 * l'un l'autre, là où six couleurs suffisaient.
 *
 * LA SILHOUETTE DISTINGUE, LE MÉTAL RASSEMBLE. C'est la règle d'un vrai jeu de badges : on
 * reconnaît le sien à sa découpe avant sa couleur, et une étagère de huit se lit comme une
 * collection et non comme huit dessins sans rapport. Chacun est donc la même médaille frappée —
 * plaque, biseau, figure en émail — et ne change que de contour.
 *
 * Les huit teintes sont patinées et de valeur voisine : aucune ne crie plus fort que les autres
 * sur un fond crème comme sur un fond sombre, et le podium reste lisible à côté.
 *
 * Chaque badge porte une mécanique du jeu — le pli, la branche, l'éclat, le duel, le sablier,
 * la caisse, le niveau, la forme. Une étagère pleine raconte la partie.
 */

/** Une seule géométrie pour les huit : 100 × 100, centre en (50,50), rayon utile 42. */
export const VIEWBOX = '0 0 100 100'

/**
 * Le métal se compose de trois valeurs, posées en variables CSS par `SeasonBadge` : la plaque,
 * le biseau qui l'ombre, et l'émail clair de la figure. L'émail est un blanc chaud fixe et non
 * la couleur du fond : une médaille garde son métal quel que soit le papier sur lequel on la
 * pose, et un émail qui suivrait le thème deviendrait un trou dans la plaque en sombre.
 */
export const EMAIL = '#f7f2e6'

const medaille = (nom, mecanique, plaque, biseau, contour, figure) => ({
  nom,
  mecanique,
  plaque,
  biseau,
  contour,
  figure,
  body: `<path class="bg-plaque" d="${contour}" />`
    + `<path class="bg-biseau" d="${contour}" />`
    + `<g class="bg-figure">${figure}</g>`,
})

export const BADGES = [
  /**
   * LE PLI — hexagone à plat. Le pli est la première chose qu'on ouvre : un rabat scellé, la
   * forme la plus proche de la carte qu'il contient.
   */
  medaille('Pli', 'le pli', '#b08428', '#8a661c',
    'M50 7 L87 28 V72 L50 93 L13 72 V28 Z',
    '<path d="M30 39 h40 v26 h-40 Z" />'
    + '<path class="bg-trait" d="M30 39 L50 55 L70 39" fill="none" stroke-width="5" stroke-linejoin="round" />'),

  /**
   * LA BRANCHE — écu. Deux brins qui n'en font plus qu'un : le dessin d'une fusion, et celui
   * d'une évolution. C'est le même geste dans les deux mondes du projet.
   */
  medaille('Branche', 'l’évolution', '#3a5a86', '#2a4365',
    'M50 7 L88 19 V52 C88 73 71 88 50 94 C29 88 12 73 12 52 V19 Z',
    '<path d="M38 74 V34 M38 56 C38 42 64 48 64 34"'
    + ' fill="none" stroke-width="6" stroke-linecap="round" />'
    + '<circle cx="38" cy="76" r="8" /><circle cx="38" cy="32" r="8" /><circle cx="64" cy="32" r="8" />'),

  /**
   * L'ÉCLAT — losange. Le chromatique tombe une fois sur cent vingt-huit : la médaille la plus
   * pointue du jeu pour la chose la plus rare.
   */
  medaille('Éclat', 'le chromatique', '#3f8077', '#2d6058',
    'M50 5 L91 50 L50 95 L9 50 Z',
    '<path d="M50 26 L56 44 L74 50 L56 56 L50 74 L44 56 L26 50 L44 44 Z" />'),

  /**
   * LE DUEL — octogone, la forme de l'arène. Deux cartes face cachée, posées de biais : c'est
   * littéralement ce qu'est un duel ici — on choisit qui l'on affronte, jamais avec quoi, et
   * les deux mises restent scellées jusqu'à la résolution.
   *
   * Deux lames croisées d'abord, qui se relisaient comme le ✕ de l'erreur ; puis deux coins
   * affrontés, dont le creux redonnait le sablier de la médaille voisine. Une médaille ne peut
   * pas emprunter la figure d'une autre dans le même jeu.
   */
  medaille('Duel', 'le duel', '#8e3535', '#6d2626',
    'M33 8 H67 L92 33 V67 L67 92 H33 L8 67 V33 Z',
    '<g transform="rotate(-13 38 52)"><rect x="22" y="31" width="30" height="42" rx="5" /></g>'
    + '<g transform="rotate(13 62 52)"><rect x="47" y="31" width="30" height="42" rx="5" /></g>'
    + '<g class="bg-trait" fill="none" stroke-width="4" stroke-linecap="round">'
    + '<path transform="rotate(-13 38 52)" d="M30 44 h14 M30 54 h14" />'
    + '<path transform="rotate(13 62 52)" d="M55 44 h14 M55 54 h14" /></g>'),

  /**
   * LE SABLIER — arche. Une saison ne se rejoue pas : c'est la seule médaille qui parle du
   * temps, et elle en a la forme.
   */
  medaille('Sablier', 'la saison', '#58616e', '#3f4752',
    'M50 6 C72 6 88 22 88 44 V80 Q88 90 78 90 H22 Q12 90 12 80 V44 C12 22 28 6 50 6 Z',
    '<path d="M34 28 h32 L50 50 Z M34 72 h32 L50 50 Z" />'
    + '<path d="M32 28 h36 M32 72 h36" fill="none" stroke-width="5" stroke-linecap="round" />'),

  /**
   * LA CAISSE — disque cranté, une pièce. Les pokédollars s'empilent par deux sources, le duel
   * et la revente : deux barres sur la tranche.
   */
  medaille('Caisse', 'les pokédollars', '#5e7a35', '#465c26',
    'M50 6 L62 11 L75 10 L83 20 L94 27 L92 40 L96 52 L87 61 L84 74 L71 78 L62 88 L50 84 '
    + 'L38 88 L29 78 L16 74 L13 61 L4 52 L8 40 L6 27 L17 20 L25 10 L38 11 Z',
    '<ellipse cx="50" cy="31" rx="21" ry="6" /><ellipse cx="50" cy="47" rx="21" ry="6" />'
    + '<ellipse cx="50" cy="63" rx="21" ry="6" />'),

  /**
   * LE NIVEAU — pentagone montant. Un exemplaire gagne un niveau par duel remporté à sa hauteur :
   * trois marches, et la pointe vers le haut.
   */
  medaille('Niveau', 'les niveaux', '#6a4273', '#4e2f56',
    'M50 5 L92 36 L76 90 H24 L8 36 Z',
    '<path d="M30 62 h11 v16 h-11 Z M44 50 h11 v28 h-11 Z M58 38 h11 v40 h-11 Z" />'),

  /**
   * LA FORME — disque échancré. La forme du jour change toutes les nuits et ne se voit que sur
   * ses propres Pokémon : un croissant, ce qu'on ne voit jamais en entier.
   */
  medaille('Forme', 'la forme du jour', '#a85a2c', '#80401c',
    'M50 6 A44 44 0 1 1 49.9 6 Z',
    '<path d="M62 20 A34 34 0 1 0 62 80 A27 27 0 1 1 62 20 Z" />'),
]

/**
 * Le badge d'une saison. Les saisons défilent, les badges tournent : `2026-S4` et `2027-S6`
 * n'ont pas le même, et la roue reprend au premier tous les huit — seize mois à deux mois par
 * saison. On indexe sur le rang absolu de la saison et non sur son seul numéro, sans quoi les
 * six saisons d'une année recevraient les mêmes badges que celles de l'année suivante.
 */
export function badgeOf(season) {
  const [annee, numero] = String(season).split('-S').map(Number)
  if (!Number.isInteger(annee) || !Number.isInteger(numero)) return BADGES[0]
  return BADGES[(annee * 6 + numero - 1) % BADGES.length]
}
