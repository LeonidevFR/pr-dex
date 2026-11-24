# PR-DEX — la fusion d'exemplaires et l'échange entre joueurs

Document d'arbitrage, écrit le 24 novembre 2026, arbitré le même jour. **Rien n'est implémenté.**
Il instruit deux changements qui se tiennent : remplacer les bonbons par la fusion d'exemplaires,
et permettre l'échange entre joueurs. Les décisions prises sont au § 1.

Il s'appuie sur la branche de l'arène (`feature/poke-arena-battle`, PR #10), qui porte les tables
d'exemplaires, la revente et la spec des objets (`spec-objets-boutique.md`). Le brief
(`brief-design-pr-dex.md`) fait foi sur les règles de jeu ; ce document en change une, celle des
bonbons, et le dit.

---

## 1. Les décisions

**Fusion**

- **4 exemplaires d'une espèce fusionnent en un de son évolution.** Le 3 → 1 a été écarté : le début
  de partie sera plus lent, c'est assumé — c'est le jeu.
- **14 Magicarpe** pour un Léviator.
- **Fusion à volonté**, y compris vers une espèce déjà possédée.
- **Dans l'espèce** seulement : quatre Chenipan, pas un mélange de la famille.
- **Le niveau de l'exemplaire fusionné est le plus haut des quatre**, pas leur somme.
- **Livraison visée : après la saison 1** (§ 6).

**Échange**

- **1 contre 1**, et rien d'autre pour l'instant.
- **Aucune limite de palier** : un légendaire en triple peut s'échanger contre le rare qui manque.
- **Les shiny s'échangent**, et c'est clairement indiqué dans la proposition.
- **Pas de don.**
- **Un crédit d'échange par semaine** (5 jours ouvrés), **cumulable jusqu'à 4** d'une semaine sur
  l'autre — à l'inverse des crédits de duel, perdus le dimanche soir. **Chacun des deux joueurs**
  dépense un crédit.
- **Plusieurs propositions peuvent viser le même exemplaire** : la première validée des deux côtés
  l'emporte et annule les autres.
- **Une proposition sans réponse expire après 7 jours.**
- **Échange ouvert, à double validation** : chacun propose des exemplaires et peut afficher ce qu'il
  recherche, sans que cette demande ferme l'échange à autre chose. L'échange n'a lieu que lorsque
  les deux joueurs l'ont validé, chacun de son côté.
- **Le dos d'une carte reçue affiche « Échangée par <pseudo> »**, sans le titre de la PR.
- **Une carte reçue compte dans le Pokédex** et les succès d'espèces, **pas dans les statistiques de
  tirage**.

## 2. Pourquoi les deux ensemble

La fusion donne une raison d'échanger : « il me manque un Chenipan pour fusionner ». L'échange
donne un débouché à la fusion : un doublon qu'on ne peut pas fusionner se cède. Et les deux
touchent la même chose — qui possède quel exemplaire — que le schéma actuel ne sait pas faire
bouger (§ 5.1). Les instruire séparément reviendrait à concevoir deux fois le même socle.

L'ordre de livraison est : le socle (§ 5.1), puis la fusion, puis l'échange. La fusion se joue seul
et n'ouvre aucune collusion ; elle se rode avant que les exemplaires changent de main.

## 3. Ce qui existe aujourd'hui

- Chaque carte donne **3 bonbons** (`CANDY_PER_CATCH`), crédités à la **famille** entière : un
  Chrysacier tiré alimente la lignée de Chenipan.
- Évoluer coûte **8 bonbons** au premier stade, **16** au second, **40** pour Magicarpe → Léviator.
- L'évolution consomme **un** exemplaire. Les autres restent en stock : c'est ce surplus que la
  revente a été créée pour écouler (`20260924000000_revente.sql` : « le surplus est donc du poids
  mort »).
- **Les 151 sont tirables**, formes évoluées comprises, sauf Léviator. L'évolution n'est donc pas le
  seul chemin vers une espèce.
- Le solde de bonbons n'est **stocké nulle part** : `dex_candies` le recalcule depuis les captures
  et les évolutions. Supprimer les bonbons n'efface aucun solde.
- Volume mesuré sur l'export du 14 octobre (`spec-objets-boutique.md`) : 1 894 captures pour
  9 joueurs en 93 jours, soit environ **2,3 cartes par joueur et par jour**, ≈ 800 par an. Le brief
  tablait sur ~300.

## 4. La fusion

### La règle

**4 exemplaires d'une espèce fusionnent en un exemplaire de son évolution** (14 pour Magicarpe).
Le joueur choisit le **porteur** parmi les quatre, comme il choisit aujourd'hui l'exemplaire qui
évolue (#8). Les trois autres sont consommés. Plus de bonbons, plus de jauge.

### Ce que disent les chiffres

Simulation sur le vrai tirage de la branche (`shared/draw.js`, vivier Gen 1 : 22 c, 78 u, 45 r,
5 l), 400 joueurs simulés par ligne, évolutions faites de façon gloutonne vers les espèces
manquantes, fusion dans l'espèce. Ce sont des projections, pas des mesures.

| cartes | système | évolutions / joueur | espèces /151 |
|---|---|---|---|
| 300 | bonbons actuels | 8,4 | 120,3 |
| 300 | **fusion 4 → 1** | **4,5** | **116,5** |
| 300 | fusion 3 → 1 (écartée) | 6,6 | 118,5 |
| 800 | bonbons actuels | 3,0 | 145,2 |
| 800 | **fusion 4 → 1** | **2,5** | **144,7** |
| 800 | fusion 3 → 1 (écartée) | 3,0 | 145,1 |

Avec 14 Magicarpe, Léviator reste aussi rare qu'aujourd'hui : 74 % des joueurs l'ont à 800 cartes
(14 cartes × 3 bonbons = 42, l'équivalent des 40 actuels).

Ce qu'il faut retenir :

1. **Au volume réel, l'évolution compte peu pour finir le Pokédex.** À 800 cartes, presque tout se
   tire directement : on finit vers 145 espèces dans tous les cas.
2. **Le début de partie ralentit** : à 300 cartes, 4,5 évolutions possibles au lieu de 8,4. L'écart
   vient surtout de la fin de la mise en commun par famille. C'est le prix accepté du 4 → 1.
3. **La fusion à volonté est le premier débouché du surplus.** En gardant toujours un exemplaire de
   la source :

| cartes | doublons avant → après | fusions |
|---|---|---|
| 300 | 188 → 123 | 21 |
| 800 | 658 → 347 | 101 |

La fusion à volonté a un sens dans le jeu : une forme évoluée a de meilleures stats, et le palier
monte souvent (16 Chenipan communs donnent un Papilusion rare).

### Ce qui survit à la fusion

- **Le shiny** : celui du porteur. Le joueur choisit le porteur, donc il garde un shiny s'il en
  fusionne un — c'est la règle actuelle (« perdre un shiny à une évolution se lirait comme un bug »,
  `NOTES.md`).
- **Le niveau d'arène** : **le plus haut des quatre**. La spec des objets pose qu'« un niveau ne se
  substitue pas à une victoire » ; additionner les niveaux revendrait des niveaux contre des cartes.
- **La provenance** (dos de la carte) et **les victoires** (`arena_exemplars.wins`) : celles du
  porteur.

### Cas particuliers

- **Évoli** : la fusion choisit la branche, comme l'évolution aujourd'hui. Avec les pierres de la spec
  des objets, « la pierre remplace les bonbons » devient « la pierre remplace la fusion » : un Évoli
  et une pierre donnent un évolien.
- **Les 25 familles sans évolution** (Ronflex, Métamorph, légendaires…) : la question des bonbons
  morts disparaît ; leurs doublons trouvent un usage dans l'échange.
- **Exemplaire engagé dans un duel ouvert** : non fusionnable, ni comme porteur ni comme consommé —
  même contrôle que `dex_evolve`.

### Ce qui bouge dans le code et le jeu

- `dex_evolve` : le contrôle de solde (`dex_candies(...) < v_cost`) devient un verrou sur quatre
  exemplaires disponibles. Deux fusions concurrentes ne doivent pas consommer le même exemplaire —
  c'est l'unicité du § 5.1 qui le garantit.
- Front : `candies()`, `canEvolve()`, la jauge de bonbons des formes finales, le filtre « Évoluables »
  (`useDex.js`).
- Succès : « Pêcheur patient » parle de bonbons (`src/lib/achievements.js:51`).
- `species_evo.cost` change de sens (nombre d'exemplaires au lieu de bonbons), et le test de parité
  JS/SQL suit.
- **La transition ne retire rien** : les joueurs gardent tous leurs exemplaires et leurs évolutions
  passées.

## 5. L'échange

### 5.1 Le socle : qui possède quoi

Aujourd'hui, posséder un exemplaire veut dire avoir sa ligne dans `catches` (ou dans `evolutions`
pour une forme obtenue). `catches` n'a qu'un écrivain — l'ingestion — et n'est jamais modifiée :
c'est la règle structurante du brief. La propriété y est lue à travers `catches.user_id` dans
**14 requêtes réparties sur 8 migrations**, plus `useDex` côté front.

Un échange ne peut donc pas réécrire `user_id` : ce serait un second écrivain sur `catches`, et la
ligne perdrait sa vérité d'origine. Il suit le modèle des évolutions : **une table écrite par le
serveur seul**, qui crée un exemplaire neuf chez le receveur (clé `trade:<id>`, comme `evo:<id>`)
et enregistre la sortie chez le donneur.

Les sorties de stock sont aujourd'hui dispersées : `evolutions.from_key` (consommé),
`arena_exemplars.destroyed_at` (détruit), `arena_exemplars.sold_at` (vendu). La fusion et l'échange
en ajoutent deux. **Proposition : une table unique des sorties**, `unique (user_id, entry_key)`, et
une vue « exemplaires possédés » = captures + évolutions + échanges reçus, moins les sorties. Toutes
les lectures passent par elle. C'est le seul endroit où l'unicité garantit qu'un exemplaire ne sort
qu'une fois, quelle que soit la sortie — la leçon des deux doubles dépenses déjà corrigées.

Ce socle est un changement de schéma sur des données de production : il demande une migration de
reprise, rejouée d'abord sur une copie.

### 5.2 Le déroulé

1. **La vitrine.** Chaque joueur y met les exemplaires qu'il propose, et peut afficher les espèces
   qu'il recherche. La demande est indicative : elle ne ferme pas l'échange à autre chose.
2. **La proposition.** Un joueur propose un de ses exemplaires contre un exemplaire de la vitrine
   d'un autre. Un shiny est signalé comme tel des deux côtés.
3. **La double validation.** L'échange n'a lieu que lorsque les deux joueurs l'ont validé, chacun de
   son côté. Il se résout dans une transaction qui verrouille les deux exemplaires — le modèle du
   duel — et revérifie que chacun est encore disponible.

### 5.3 Les règles

- **1 contre 1**, pas de don.
- **Aucune limite de palier.** Un échange déséquilibré (un légendaire contre un commun) est un choix
  des deux joueurs. Le crédit hebdomadaire borne ce qui ressemblerait à un don.
- **Le shiny et le niveau voyagent avec l'exemplaire.**
- **Un crédit d'échange par semaine** (5 jours ouvrés), **cumulable jusqu'à 4**, dépensé par chacun des
  deux joueurs.
- **Propositions concurrentes** sur un même exemplaire : la première validée des deux côtés l'emporte,
  les autres sont annulées.
- **Expiration** : une proposition sans réponse disparaît après 7 jours.
- **Non échangeable** : un exemplaire engagé dans un duel ouvert.

### 5.4 La visibilité

Le profil d'un collègue est caviardé par le schéma : `arena_public_profile` ne porte ni les
exemplaires ni la caisse. L'échange ne perce pas ce principe : **seule la vitrine est lisible par les
autres**, et elle ne contient que ce que le joueur y a mis.

### 5.5 La provenance

Le dos de la carte porte la PR qui l'a produite et son titre. Le README pose que **ni le titre ni le
lien d'une PR ne sortent de la base pour un autre joueur**. Le dos d'une carte reçue montre donc
« Échangée par <pseudo> », la date de la capture et la source (PR, monkey-testing), sans titre ni
lien. Une carte de seconde main se reconnaît à son dos.

### 5.6 Ce qu'un échange compte

- **Pokédex, classement, succès d'espèces** : une espèce reçue compte.
- **« Cartes retournées », tirages par palier, shiny tirés** : non — un échange n'est pas un tirage.
  La distinction « possédé » / « tiré » est à poser dans la vue du § 5.1.
- **Le risque** : deux joueurs s'échangent en boucle pour gonfler leurs espèces distinctes. Le crédit
  hebdomadaire et l'interdiction du don le bornent ; dans une équipe de neuf, c'est un risque de jeu
  entre collègues, pas une fraude à prévenir à tout prix.

## 6. Le calendrier : la fusion après la saison 1

L'arène ouvre le 1er décembre 2026, pour une saison de deux mois. La fusion est visée après.

### Ce que le passage rebat

Au passage, chaque joueur fusionne d'un coup les doublons accumulés depuis l'été. Simulé avec les
paramètres retenus (4 → 1, 14 Magicarpe, à volonté) :

| stock | fusions d'un coup | communs | peu communs | rares | légendaires |
|---|---|---|---|---|---|
| 300 cartes | 20 | 135 → 59 | 126 → 141 | 37 → 38 | 2 → 2 |
| 500 cartes | 50 | 225 → 61 | 210 → 217 | 63 → 68 | 3 → 3 |
| 800 cartes | 100 | 361 → 60 | 335 → 315 | 100 → 114 | 4 → 4 |

- **L'arène est peu rebattue.** Les rares gagnent au plus 14 %, les légendaires ne bougent pas.
  L'essentiel est une conversion des communs en peu communs. Le passage touche tous les joueurs en
  même temps, et le changement de saison remet les points à zéro : aucun classement en cours n'est
  faussé.
- **L'économie l'est davantage.** Le stock fond d'environ 40 % (800 → 493 exemplaires à 800 cartes),
  donc la revente rapporte moins. Et les enjeux des duels montent : le gain se fait au palier du plus
  petit des deux engagements, et il reste peu de communs à engager.
- **Conséquence pour la boutique.** Ses prix doivent être fixés sur l'économie *avec* fusion, pas sur
  les chiffres bruts de la saison 1, qui mesureront un revenu de revente que la fusion va réduire. Le
  remède est de rejouer la fusion sur les stocks réels de fin de saison 1, puis de recalculer revente
  et prix : la fusion étant déterministe, la simulation se fait sur les vraies données.

**Conclusion : après la saison 1 est le bon moment**, à condition de livrer la fusion avec la
boutique, et de fixer les prix de la boutique après la simulation.

### Ce qui est retenu

- **1er février 2027**, ouverture de la saison 2 : le socle (§ 5.1), la fusion et la boutique, aux prix
  recalculés.
- **L'échange dans la foulée, en cours de saison 2.** Livré avant la fusion, il se jouerait encore sous
  les bonbons et demanderait de décider si une carte reçue crédite sa famille — une question que la
  fusion supprime ensuite.
- **La fusion s'annonce à sa sortie**, pas pendant la saison 1. Annoncée plus tôt, elle pousserait les
  joueurs à garder leurs doublons au lieu de les revendre, et la revente mesurée en saison 1 serait
  faussée.

## 7. Ce qui reste ouvert

Rien sur les règles. Restent à faire avant de livrer : la simulation de fin de saison 1 sur les
stocks réels (§ 6) et la migration de reprise du socle (§ 5.1), rejouée sur une copie.
