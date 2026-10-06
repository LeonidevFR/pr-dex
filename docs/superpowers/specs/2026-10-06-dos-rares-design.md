# Dos de carte rares — Dorure et Holo

Date : 2026-10-06

Suite de `2026-10-01-cartes-onyx-theme-design.md`. Branche `feat/dos-rares`, partie de
`feat/refonte-ui-vitrine` (PR #21) : elle s'appuie sur le dos Onyx.

## Pourquoi

« Ce serait cool d'avoir des dos de carte un peu rares et stylés pour les Pokémon shiny et/ou
légendaires. » Trois directions ont été dessinées sur le canevas (Dorure, Holo, Médaillon).
Léonard a retenu un étagement : **Dorure** pour le légendaire seul et pour le shiny seul,
**Holo** pour le légendaire shiny, la carte la plus rare du jeu.

C'est la logique du rituel appliquée au dos : on ne monte pas le plancher, on monte le
plafond. Le dos le plus spectaculaire reste un événement.

## La règle qui ne se négocie pas

**Le dos ne doit rien dévoiler pendant le rituel.** Tant que la carte n'est pas retournée, elle
montre le dos neutre, quelle que soit sa rareté : ni rayons, ni iris, ni couronne, ni ✦, ni
filet coloré. C'est la même prop `secret` qui masque déjà le numéro (`Nº ···`) : avec
`secret`, le dos est toujours neutre.

Une fois la carte connue, elle montre son vrai dos : sur la carte agrandie de la fiche, et dans
tout autre endroit où le dos se voit hors rituel.

## Les quatre dos

| Carte | Dos | Ce qui change par rapport au neutre |
|---|---|---|
| ni légendaire ni shiny | **neutre** | rien (dos Onyx actuel) |
| légendaire, non shiny | **Dorure or** | rosace en rayons d'or serrés, halo doré au centre, couronne au-dessus du logo, filet or brossé sur le pourtour |
| shiny, non légendaire | **Dorure iris** | rosace irisée, ✦ au-dessus du logo, filet irisé sur le pourtour |
| légendaire et shiny | **Holo** | toute la surface en holographique arc-en-ciel, cœur doré au centre, couronne et ✦, filet or brossé ; un reflet clair balaie la carte |

- Le numéro, la date, le logo « *PR*·DEX » et l'étiquette de provenance restent à leur place
  sur les quatre dos.
- **Mouvement** : la rosace irisée, l'holographique et le reflet suivent l'inclinaison de la
  carte (`--px`, `--py`), comme le balayage de la face. Au repos, ils sont centrés.
- **Thème clair** (demandé explicitement) : chaque dos a sa version claire.
  - Neutre : l'ivoire actuel.
  - Dorure or : rayons et couronne en or assombri (`#7a5c22`) sur ivoire, filet or brossé foncé.
  - Dorure iris : rosace irisée en fusion `multiply` sur ivoire (elle s'imprime au lieu
    d'éclairer), ✦ en violet foncé, filet irisé.
  - Holo : un holographique plus pastel sur fond nacré, cœur doré, texte en encre ; l'étiquette
    de provenance passe sur fond ivoire.
  - Tout texte du dos tient 4,5:1 sur son fond, dans les deux thèmes.
- Sur le Holo, le texte (numéro, date, logo) passe en encre sombre ou garde une ombre portée,
  pour rester lisible sur l'arc-en-ciel ; l'étiquette de provenance garde son fond sombre.

## Mise en œuvre

- `PokeCard.vue` calcule la variante de dos :
  `secret ? 'neutral' : (tier === 'l' && shiny ? 'holo' : tier === 'l' ? 'gold' : shiny ? 'iris' : 'neutral')`,
  posée en `data-back` sur `.pkc-back`. Aucune nouvelle prop : `tier` et `shiny` existent déjà.
- La couronne et le ✦ du dos sont des éléments du gabarit, rendus seulement pour les variantes
  qui les portent. Avec `secret`, ils ne sont pas dans le DOM du tout (pas seulement cachés).
- Les matières vivent dans `src/styles.css`, sous `.pkc-back[data-back="…"]`, avec les mêmes
  tokens de carte que le dos neutre.

## Tests

- `PokeCard` :
  - `data-back` vaut `neutral` pour un commun, `gold` pour un légendaire, `iris` pour un shiny,
    `holo` pour un légendaire shiny ;
  - avec `secret`, `data-back` vaut `neutral` pour les quatre cas, et ni couronne ni ✦ ne sont
    dans le dos ;
  - la couronne n'apparaît qu'en `gold` et `holo`, le ✦ qu'en `iris` et `holo`.
- `RitualOverlay` : pendant l'attente, un pli légendaire shiny montre `data-back="neutral"`.
- `styles.test.js` : les trois variantes ont leur règle `.pkc-back[data-back="…"]`.
- Vérification en navigateur, dans les deux thèmes : carte agrandie de Sulfura (Dorure or), de
  Chenipan shiny (Dorure iris), d'un légendaire shiny forcé dans la démo (Holo) ; rituel d'un
  légendaire : dos neutre jusqu'au geste.

## Démo

La démo n'a pas de légendaire shiny. On en ajoute un, capturé et déjà retourné, pour qu'on
puisse voir le Holo sur la carte agrandie.

## Hors périmètre

- Un dos spécial pour les rares non légendaires : le palier rare garde le dos neutre.
- Toute modification de la face des cartes.
