/**
 * « 3 févr. 2026 » : une seule écriture de date dans toute l'app. Les dates arrivent en
 * 'YYYY-MM-DD' ; midi local plutôt que minuit évite qu'un fuseau à l'ouest de Greenwich
 * affiche la veille.
 */
export const formatDate = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

/** « 3 févr. » : la même, sans l'année, là où la place manque (vignettes). */
export const formatShortDate = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''
