/**
 * Ce qu'on montre au joueur quand une action échoue.
 *
 * Deux natures d'échec, et une seule des deux mérite d'être citée. Un REFUS vient d'une règle du
 * jeu : le serveur l'a écrit en français dans sa fonction — « aucun crédit d'engagement
 * disponible cette semaine », « bonbons insuffisants (8 requis) » — et ce message dit quoi
 * faire. Une PANNE, elle, porte un message technique qui n'apprendrait rien à personne.
 *
 * D'où le tri : on cite le serveur quand il a quelque chose à dire, on traduit sinon.
 */
const RESEAU = {
  offline: 'Pas de connexion. Réessaie dans un instant.',
  server: 'Le serveur n’a pas répondu. Réessaie.',
}

/** Les préfixes que les fonctions SQL posent devant leurs refus, et qu'on retire à l'affichage. */
const PREFIXE = /^(arene|dex|boutique) : /

export function messageDErreur(e) {
  const brut = String(e?.message ?? '')
  if (!PREFIXE.test(brut)) return RESEAU[e?.kind] ?? RESEAU.server

  const dit = brut.replace(PREFIXE, '')
  return dit ? dit.charAt(0).toUpperCase() + dit.slice(1) : RESEAU.server
}
