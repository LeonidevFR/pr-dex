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
- **Aucun rattrapage rétroactif par défaut.** `BOOTSTRAP_SINCE` vaut le jour du run,
  jamais une date fixe dans le passé. Un défaut fixe aurait rattrapé d'un coup tout
  l'historique de quiconque active l'outil longtemps après sa mise en service — des
  années de PR mergées pour quelqu'un de longue date, contre quelques PR pour un
  nouvel arrivant. La collection démarre au moment de l'activation, pas avant.
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

## Décisions de la carte et de son rituel

Voir `docs/superpowers/specs/2026-08-11-carte-rituel-design.md` pour le détail. Ce qui ne
se déduit pas du code :

- **Une seule matière, deux éclairages.** La tentation était de faire une carte
  spectaculaire au tirage (laqué noir, foil irisé) et une carte sobre dans la fiche. Refusé :
  une carte qui change d'identité entre l'écran où on la gagne et celui où on la retrouve ne
  se possède pas. Seule la `scene` change — nuit sous les rayons, jour sur le bureau.
- **La rareté se lit dans le carton, pas dans un décor.** Quatre traitements distincts —
  papier pâle, trame pointillée, carton teinté ocre, carton profond guilloché. Le rare est
  passé par des hachures, un cartouche gravé et une bordure imprimée avant d'arriver là : la
  seule version qui se reconnaît à la vignette est celle où c'est la *teinte du carton* qui
  change, sans motif ajouté.
- **La fanfare est muette en commun, et c'est le sujet.** Ces plis s'ouvrent quelques
  centaines de fois par an sans qu'on puisse les sauter. Si chacun explose, l'explosion du
  légendaire ne signifie plus rien. On ne monte pas le plancher, on monte le plafond. Un
  chromatique relève tout de même ce plancher au niveau du rare : il sort une fois sur cent
  vingt-huit quel que soit le palier.
- **La cérémonie tient en un geste, et le pli scellé a disparu.** Il y a d'abord eu une
  ouverture de pli complète — sceau, entaille au trait de lumière, bandeau qui se soulève,
  corps découpé qui tombe — puis un retournement automatique à quatre secondes annoncé par une
  barre de décompte. Deux cérémonies pour une seule information, sur une scène qui se rejoue
  quelques centaines de fois par an : à la troisième ouverture on attendait déjà que ça passe.
  Le pli portait la PR, mais le dos de la carte la porte aussi et mieux — il reste avec elle.
  Il ne reste donc que la carte, dos visible, et le geste de la retourner. Rien ne se
  déclenche sans le joueur, y compris s'il ne fait rien pendant une heure.
- **Les décors ne sont jamais aléatoires.** Les positions des étincelles sont dérivées de leur
  index : deux tirages du même palier produisent la même salve. Un décor qui varie cesse
  d'être un objet.
- **Aucune animation n'est conditionnée à `prefers-reduced-motion`**, et ce n'est pas un
  oubli. Plusieurs postes de l'équipe forcent ce réglage sans que personne l'ait demandé
  (profil durci, préférence cachée) : s'y fier leur servait une application entièrement figée.
  La décision remonte à `ac68ba4` et vaut pour tout le jeu, cérémonie d'évolution comprise.
  Ce lot l'avait réintroduite par mégarde — voir plus bas.
- **Le zoom du sprite a été conservé** sur la fiche, contre ce que prévoyait le plan
  d'implémentation : c'était une fonctionnalité complète, clavier compris, et l'échanger
  contre une carte plus petite aurait été un recul déguisé en refonte. La carte l'ouvre.

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
- Les rayons du rituel tournaient en 3,2 s pour un rare et **1,8 s** pour un légendaire.
  Sur la seule scène du jeu qu'on ne peut ni sauter ni désactiver, ça ne lisait plus « ça
  rayonne » mais « ça stroboscope ». Trouvé en relisant `INTENSITY` pour la carte, jamais
  remonté par personne — un défaut d'accessibilité ne casse aucun test.
- Les deux faces de la carte coexistent dans le DOM pour que le retournement soit une vraie
  rotation, et `backface-visibility` ne les cache qu'à l'œil : un lecteur d'écran annonçait
  l'espèce avant le retournement. La révélation n'existait que pour les voyants. Corrigé par
  `aria-hidden` sur la face non tournée vers le joueur.
- La carte et son rituel ont **réintroduit `prefers-reduced-motion`** partout — rayons,
  étincelles, ondes, secousse, retournement, inclinaison, entaille, décompte — alors que
  `ac68ba4` l'avait retiré trois semaines plus tôt, précisément parce que des postes le
  forcent. Sur ces machines, l'entaille durait 0,01 s et la carte ne se retournait pas
  visiblement : le correctif de juillet était annulé sans que rien ne le signale. Aucun test
  ne pouvait l'attraper — une media query ne casse rien, elle éteint. Remonté par un
  utilisateur qui a reconnu le symptôme d'un bug déjà corrigé.

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

## Supabase envisagé en juillet 2026, basculé le même mois

Remplacer le repo-base-de-données par une base Supabase a été évalué en fin de
construction, puis reporté sur un principe : **le coût de la bascule ne grandit pas avec
le temps**, donc rien n'obligeait à trancher avant la mise en service. Décision initiale :
mettre en service la version GitHub, et basculer si et quand le besoin collectif devient
concret plutôt qu'hypothétique.

Le besoin est devenu concret dans la même itération, en discutant l'onboarding d'un
premier collègue : chaque dev aurait dû créer son propre repo privé, deux PAT fine-grained
et installer un workflow — sans compter le PAT front à renouveler par machine. La bascule
a été faite immédiatement plutôt que remise à plus tard.

**Ce qui a effectivement changé.** Trois tables Supabase (`profiles`, `catches`, `state`,
schéma dans `supabase/schema.sql`), RLS partout, OAuth GitHub à la place de l'écran de
saisie de jeton. Surface réécrite, plus large que l'estimation d'origine (`src/lib/github.js`
a été supprimé, pas juste modifié ; l'auth ajoute `useAuth.js` et remplace `ConnectScreen.vue`
en profondeur) — mais toujours localisée : `useDex`, les composants de jeu et
`shared/species.js`/`shared/draw.js` n'ont pas bougé d'une ligne, ils ignoraient déjà d'où
venaient les données.

**Ce qui n'a PAS changé, contrairement à ce qui était anticipé** : la logique de rejeu sur
conflit dans `useCollection.js` (celle où vivait le bug de double dépense de bonbons) est
restée telle quelle — seul le jeton de concurrence optimiste change de nature (`version`
entier Postgres au lieu du SHA de blob git). L'idée de la remplacer par une contrainte SQL
(une fonction RPC atomique pour l'évolution) n'a pas été faite ; ça reste un axe
d'amélioration future, pas un acquis de cette bascule.

**Nouveau point d'attention introduit par la bascule** : l'Action n'écrit plus dans son
propre repo (elle écrit dans Supabase), donc elle ne s'auto-entretient plus. GitHub
désactive un planning après 60 jours d'inactivité du *repo* — sans autre commit sur
`pr-dex-data` entre-temps, il faudra relancer manuellement le workflow pour le réveiller.
Accepté : ce dépôt n'a de toute façon plus d'autre activité que ce workflow.

**Le point du plan gratuit Supabase** (pause après une semaine d'inactivité) évoqué lors de
l'évaluation initiale reste vrai mais sans conséquence : l'Action tourne plusieurs fois par
jour même sur le cron restreint (8h-19h, une fois par heure), largement au-dessus du seuil.

## Découplage de la source, juillet 2026

Demande d'origine : d'autres pôles voudraient le même objet, chacun sur un acte de leur
métier. Le tirage, lui, n'a jamais rien su de GitHub (`shared/draw.js` ne voit qu'une
chaîne) ; le couplage vivait ailleurs, en quatre endroits — le schéma, l'auth, l'ingestion,
l'affichage.

**La connexion et l'identité-source ont été séparées.** C'était l'hypothèse implicite qui
saute au deuxième pôle : `profiles.github_login` faisait à la fois preuve d'identité, clé de
profil et handle chez la source. Une table `identities` porte désormais une ligne par
(personne, source). La connexion reste en OAuth GitHub — la basculer sur un provider commun
est un autre chantier, celui qui touche des comptes existants — mais plus rien n'y oblige :
le trigger d'inscription crée simplement l'identité `github` que cette connexion prouve.

**Le tirage reste au centre, jamais dans un connecteur.** Un connecteur rend des événements
bruts et n'attribue aucune espèce. C'est ce qui empêche un pôle de se donner de meilleures
chances, et c'est la traduction en code de la règle produit : un pôle déclare quel acte vaut
un tirage, pas ce que vaut un tirage.

**Un curseur de recherche par source, pas par personne.** `sinceDate` se calculait sur la
capture la plus récente d'un profil, toutes sources confondues. Avec deux sources, la plus
active aurait tiré la fenêtre de la plus lente en avant, dont les événements seraient passés
hors fenêtre sans jamais être vus. Bug introduit à la première source ajoutée, invisible
jusque-là — il y a un test dédié.

**La faible entropie des identifiants de CRM a été mesurée, pas supposée.** Un sha de merge
est un seed à forte entropie ; l'identifiant d'un objet de CRM est un entier séquentiel. Vu
le précédent de la fixture effondrée à 16 espèces (plus haut), la question ne pouvait pas
rester ouverte — d'autant que `% SHINY_ODDS` est un modulo par une puissance de deux, donc
ne dépend que des bits bas. Mesuré sur 100 000 identifiants consécutifs : paliers à ±1 %,
151 espèces distinctes, taux de chromatique dans la bande attendue. Rien à corriger, mais le
test reste pour que la réponse ne se reperde pas.

**`label` / `ref` / `url` plutôt qu'un `meta jsonb`.** Le front affichait `repo#pr` et un sha
court ; il lui fallait un équivalent générique. Trois colonnes que le connecteur remplit dans
le vocabulaire de son pôle, plutôt qu'un fourre-tout que chaque source remplirait à sa façon
et que le front devrait apprendre à lire source par source. Conséquence assumée : le sha
court affiché sous chaque case du tiroir est remplacé par le nom de la source — l'information
qui devient utile dès qu'il y en a deux.

**Ce qui n'a pas bougé, encore une fois** : `useDex`, `useCollection`, les composants de jeu
et `shared/species.js`. Comme à la bascule Supabase, le cœur du jeu ignorait déjà d'où
venaient les données.

## Hors périmètre, non touché

Comptes, OAuth, partage, classements, échanges, combats, génération 2 et suivantes,
notifications, tests e2e, tout framework de gestion d'état — deux fichiers JSON et des
`computed` suffisent.
