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
  // Deux lames croisées : l'arène.
  arena: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/>' +
         '<path d="M19 21h2v-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/>',
  // Un sac à anses : la boutique.
  shop: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/>' +
        '<path d="M16 10a4 4 0 0 1-8 0"/>',
  // Une roue crantée, simplifiée : les réglages.
  settings: '<circle cx="12" cy="12" r="3"/>' +
            '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2' +
            'M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2"/>',
  // Une flèche qui boucle : la synchronisation. Arc ouvert et pointe pleine — c'est le dessin
  // retenu sur `main`, dont le tracé symétrique tourne mieux qu'une pointe en deux traits.
  sync: '<path d="M19 12A7 7 0 1 1 12 5"/>'
      + '<polygon points="12 1.5 12 8.5 16.5 5" fill="currentColor" stroke="none"/>',
  // L'entonnoir d'origine du rail, repris au trait près.
  filter: '<polygon points="3 4 21 4 14 12.5 14 20 10 20 10 12.5 3 4"/>',
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
