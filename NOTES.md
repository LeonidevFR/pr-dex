# Notes de partis pris

## Les trois questions ouvertes du brief

**1. Les bonbons morts.** 25 espèces n'ont d'évolution nulle part dans leur famille
(Ronflex, Métamorph, les 5 légendaires…). Leurs doublons produisent des bonbons
inutilisables. Décision : pas de monnaie générique, pas de mur d'échange — la réserve
affiche la pile comme une collection possédée, assumée telle quelle. Le problème était
ressenti, pas résolu mécaniquement.

**2. La silhouette.** Pas le gris classique attendu. Un traitement en dessin
préparatoire : cadre en tirets, sprite sépia fortement atténué.

**3. La file d'attente.** Paquet par paquet, avec une échappatoire « tout ouvrir sans
cérémonie » qui apparaît à partir du deuxième paquet.

## Décisions prises pendant l'implémentation

- **Vite + composants Vue 3 (SFC) plutôt que Nuxt.** Le SSR, les routes serveur et le
  routing par fichiers sont ici soit inutilisables soit désactivés ; le module de
  tirage partagé est plus simple à brancher en Vite pur.
- **Deux repos, coquille publique.** Gratuit, et c'est la seule option qui permette de
  servir plusieurs personnes plus tard sans dupliquer le déploiement. Le repo de
  données est un réglage d'exécution, jamais une constante de build — la seule
  concession faite en direction d'un multi-utilisateur éventuel, sans aucun mécanisme
  multi-utilisateur construit.
- **`state.evolutions` porte un `fromSha`.** La spec décrit `{species, from, date}`.
  Avec plusieurs captures de l'espèce source, dont une shiny, l'affirmation « le shiny
  est hérité de la source » n'a pas de référent — l'information n'est simplement pas
  dans le fichier. Enregistrer quelle capture a évolué lève l'ambiguïté. En l'absence
  d'un choix explicite dans la spec, une capture shiny est préférée : perdre un shiny
  à une évolution se lirait comme un bug.
- **Les coûts d'évolution suivent le brief (8/16, Magicarpe 40), pas la maquette**, qui
  utilisait 4/8 sur les deux lignes insectes.
- **Une jauge de bonbons de famille en lecture seule sur les formes finales.** 56 des
  151 espèces ne évoluent pas et n'appartiennent pas à une famille non-évolutive
  autrement — elles n'affichaient aucune section. Simulé au rythme d'environ 300
  PR/an annoncé par le brief, environ 21 d'entre elles ont des doublons après un an et
  48 après trois ans. Leurs doublons créditent déjà la famille ; la jauge se contente
  d'exposer un compteur qui existait déjà.
- **`localStorage` ne contient que `prdex.token` et `prdex.repo`.** Le brief dit à la
  fois « pas de localStorage » à propos de l'état de jeu et « le jeton gardé en local »
  — cette répartition concilie les deux.
- **Le modèle d'état a été refactoré.** La maquette portait `claimed` comme un
  booléen par entrée et poussait les évolutions dans le même tableau ; le contrat réel
  dérive les deux depuis `state.json`.

## Bugs trouvés en implémentation, non anticipés par les specs

Chacun était invisible à une suite de tests verte :

- Un générateur de SHA de test utilisant `'0123456789abcdef'[fnv1a(s) % 16]`
  s'effondrait à 16 SHA distincts sur 100 000. Un modulo puissance de deux de FNV-1a
  ne dépend que des bits de poids faible de l'entrée. Les tests de distribution et le
  golden test passaient en ne vérifiant presque rien. Même défaut dans la fixture démo
  de la maquette : 16 espèces au lieu de 33.
- Le golden test ne couvrait que les paliers commun et peu commun. Il vérifie
  désormais la couverture des quatre paliers plus un shiny.
- `GET /repos/{owner}/{repo}/` avec un slash final renvoie 404 là où la même URL sans
  slash renvoie 200. `checkAccess` aurait signalé « repo introuvable » pour un jeton et
  un repo parfaitement valides. Le `fetch` moqué ne pouvait pas l'attraper ; un appel
  réel, si.
- Le rejeu de conflit dépensait deux fois les bonbons. Rejouer une opération contre un
  état frais n'est correct que si l'opération est une fonction pure de cet état ; le
  contrôle de solde s'exécutait avant le rejeu, si bien que deux appareils faisant
  évoluer la même espèce produisaient `spent = 16` pour 9 bonbons gagnés, un solde de
  −7, et deux évolutions enregistrées pour une seule action utilisateur.
- Le « Suivant · N restants » du rituel était décalé d'un cran, parce que `remaining`
  était lié en direct à `pending.length` alors que `claim` retire le paquet en cours
  de cette liste en cours d'affichage.

## Manques connus, laissés volontairement

Consignés comme dette, pas comme oubli :

- Un fichier contenant du JSON invalide est diagnostiqué comme une panne GitHub.
  `JSON.parse` lève un `SyntaxError`, qui n'est pas un `GithubError`, donc le code
  retombe sur `kind: 'server'` et l'écran affiche « GitHub est indisponible, réessaie
  dans un moment ». Réessayer ne répare jamais ce cas.
- « Tout ouvrir sans cérémonie » écrit une fois par paquet — N allers-retours API et N
  commits, avec un état partiel si l'un échoue en cours de route.
- `search/issues` plafonne à 1000 résultats et le script ne détecte pas ce plafond :
  un long historique de bootstrap se tronque silencieusement.
- L'endpoint de recherche autorise 30 requêtes/minute, bien en-deçà des 5000/heure de
  l'API REST. Sans conséquence en régime stable (un seul appel de recherche par run de
  30 minutes), mais un long bootstrap pourrait échouer en cours de route ; le script
  échoue bruyamment, sans retry ni backoff.

## Supabase envisagé, reporté sciemment (juillet 2026)

Remplacer le repo-base-de-données par une base Supabase a été évalué en fin de
construction. L'analyse tient en un point : **le coût de la bascule ne grandit pas avec
le temps**, donc rien n'obligeait à trancher avant la mise en service.

Surface réelle à réécrire, mesurée et non estimée :

| | |
|---|---|
| `src/lib/github.js` | 91 lignes — seul module du front qui touche au réseau |
| `src/App.vue` | un import |
| `scripts/catch.mjs` | le chemin d'écriture de l'Action |

Rien d'autre. `useDex` est de la dérivation pure, les sept composants ne connaissent que
des props, `shared/species.js` et `shared/draw.js` ignorent d'où viennent les données.
C'est la contrainte « un seul module parle au réseau » qui rend la couche de stockage
interchangeable — elle a été posée pour la testabilité, elle sert ici à autre chose.

**Ce que Supabase apporterait**, le jour où un collègue veut entrer : le multi-utilisateur
par une colonne `user_id` et du RLS au lieu d'un repo privé, deux PAT et un workflow à
installer par personne ; la disparition de l'écran de saisie de jeton au profit d'un OAuth
GitHub ; et la disparition de toute la logique de rejeu sur conflit — celle où vivait le
bug de double dépense de bonbons — remplacée par une contrainte SQL.

**Ce que ça coûterait** : une dépendance externe là où il n'y en a aucune, l'historique git
de la collection, et la contrainte centrale de la spec technique (« Pas de backend. Le repo
est la base de données. »).

**Point vérifié qui aurait pu disqualifier l'option** : les projets Supabase gratuits sont
mis en pause après une semaine d'inactivité, et l'usage prévu est d'une à trois ouvertures
par semaine — soit juste à la limite. Mais l'Action interroge la base toutes les 30 minutes
pour connaître les SHA déjà capturés : le projet ne serait jamais inactif. Les autres
limites du plan gratuit sont hors sujet (500 Mo contre ~63 Ko de captures par an et par
personne).

**Décision** : mettre en service la version GitHub, s'en servir réellement, et basculer
si et quand le besoin collectif devient concret plutôt qu'hypothétique.

## Hors périmètre, non touché

Comptes, OAuth, partage, classements, échanges, combats, génération 2 et suivantes,
notifications, tests e2e, tout framework de gestion d'état — deux fichiers JSON et des
`computed` suffisent.
