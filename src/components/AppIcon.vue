<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 15 },
})

/**
 * Le jeu d'icônes du projet, tracé à la main plutôt qu'importé.
 *
 * Aucune bibliothèque : le build ne dépend d'aucun CDN, l'application se sert entièrement
 * depuis Pages, et une icône pèse ici quelques dizaines d'octets contre plusieurs dizaines de
 * kilo-octets pour un paquet dont on utiliserait six symboles.
 *
 * Toutes au même gabarit — 24×24, trait de 2, extrémités arrondies — parce que c'est ce qui
 * fait qu'un jeu d'icônes se lit comme un jeu et non comme une collection. Le filtre reprend
 * exactement le tracé qui existait déjà dans le rail, pour que rien ne bouge à l'écran.
 */
const PATHS = {
  // Quatre cases : la planche du dex.
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>'
      + '<rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  // Deux lames croisées : l'arène.
  arena: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/>' +
         '<path d="M19 21h2v-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/>',
  // Un sac à anses : la boutique.
  shop: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/>' +
        '<path d="M16 10a4 4 0 0 1-8 0"/>',
  /*
   * Les réglages. La version précédente était un cercle et huit rayons : personne n'y voyait
   * une roue crantée, tout le monde y voyait un SOLEIL — c'est-à-dire un basculement clair /
   * sombre, qui n'existe pas dans cette application. Une vraie roue a des dents attachées à
   * son pourtour, pas des traits qui s'en échappent ; c'est ce contact qui fait la différence
   * entre un engrenage et un astre.
   */
  settings: '<circle cx="12" cy="12" r="3.2"/>'
          + '<path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0'
          + '-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0'
          + '-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2'
          + ' 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1'
          + 'a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5'
          + ' 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6'
          + ' 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  // Une flèche qui boucle : la synchronisation. Arc ouvert et pointe pleine — c'est le dessin
  // retenu sur `main`, dont le tracé symétrique tourne mieux qu'une pointe en deux traits.
  sync: '<path d="M19 12A7 7 0 1 1 12 5"/>'
      + '<polygon points="12 1.5 12 8.5 16.5 5" fill="currentColor" stroke="none"/>',
  // L'entonnoir d'origine du rail, repris au trait près.
  filter: '<polygon points="3 4 21 4 14 12.5 14 20 10 20 10 12.5 3 4"/>',
  // Une médaille à ruban : la saison, et ce qu'elle met en jeu.
  season: '<circle cx="12" cy="9" r="6"/><path d="m8.2 14.3-1.7 6.2 5.5-3 5.5 3-1.7-6.2"/>',
  // Une tête et des épaules : le profil.
  profile: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
}
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    v-html="PATHS[name]"
  />
</template>
