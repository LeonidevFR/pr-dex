# Mode arène — duels asynchrones, destruction d'exemplaires, saisons

Date : 2026-08-10

Premier mode **multijoueur** de PR-DEX. Deux joueurs engagent chacun un exemplaire de
leur collection, à l'aveugle ; le combat se résout ; le perdant voit son exemplaire
détruit, le vainqueur gagne un pli, des pokédollars et des points de saison.

C'est aussi le premier chantier qui sort du périmètre posé à l'origine : NOTES.md
listait explicitement « comptes, partage, classements, échanges, combats » comme hors
sujet. Rien n'est donc réutilisable tel quel côté multijoueur — tout est à concevoir,
y compris le fait qu'une perte soit irréversible.

---

## 1 · Les contraintes qui ont façonné la conception

Elles ont été trouvées dans le code avant que la mécanique soit arrêtée, et chacune a
changé une décision.

**`state` est modifiable par son propriétaire** (`state_update_own`, `supabase/schema.sql`).
Sans conséquence aujourd'hui — au pire on triche contre soi-même. Mais dès qu'un duel
engage quelqu'un d'autre, **rien de ce qui compte ne peut vivre là**. Niveaux, exemplaires
détruits, portefeuille et points sont écrits par une autorité, jamais par le joueur.
C'est la contrainte structurante du mode.

**`catches` est un registre immuable écrit par la seule Action.** Une capture supprimée
dans la fenêtre de recouvrement de sept jours **reviendrait toute seule** au run suivant ;
une plus ancienne disparaîtrait à jamais. La destruction ne peut donc pas être un `delete`.

**Le jeu sait déjà détruire un exemplaire sans retirer l'espèce.** `useDex.js`
(`consumedKeys`) le fait pour l'évolution : *« le Pokédex garde ce qui a été vu, même si
le dernier exemplaire a servi à évoluer »*. Un exemplaire détruit en arène est le même
geste — une clé de plus dans l'ensemble des consommés, et tout l'aval (compte
d'exemplaires, possibilité d'évoluer, affichage) se comporte correctement sans
modification.

**Les bonbons ne peuvent pas devenir négatifs.** `candies()` compte les captures
*ouvertes* de la famille moins les dépenses, pas les exemplaires en stock. Perdre un
exemplaire coûte la matière à évoluer et le chromatique s'il en était un — jamais des
bonbons acquis. Cohérent avec l'évolution, et ça n'ouvre pas la classe de bug de la
double dépense.

**`drawFrom(seed)` est une fonction pure de la clé d'exemplaire.** Aucun bonus de chance
n'est implémentable sans casser la règle produit (*« un pôle déclare quel acte vaut un
tirage, il ne déclare pas ce que vaut un tirage »*). Toute récompense passe donc par
**des tirages en plus**, jamais par de meilleures cotes.

**`NOT_DRAWABLE` existe déjà** (Léviator). Une espèce peut vivre dans le dex sans entrer
dans le pool de tirage : la Gen 2 est architecturalement supportée aujourd'hui.

**Le découplage par source est le véhicule des récompenses.** Un pli gagné est une ligne
`catches` de source `arene`, tirée par `drawFrom` sur sa propre clé. Le rituel,
l'animation, les bonbons, le compteur : rien à changer côté front.

**RLS isole totalement chaque joueur** (`auth.uid() = user_id` partout). Un mode versus
impose de créer une surface partagée, et de décider ce que l'adversaire a le droit de voir.

**`profiles` ne contient que `user_id` et `created_at`.** Aucun nom à afficher : un
pseudonyme devient nécessaire.

---

## 2 · La boucle de jeu

- Un joueur gagne **1 crédit par jour ouvré**, cumulable jusqu'à **5**, remis à zéro le
  dimanche à 23h59.
- Un crédit permet d'**engager un exemplaire précis**. Il est alors immobilisé : ni
  évolution, ni second engagement.
- Au moment d'engager, le joueur choisit : **poster un défi ouvert**, ou **affronter
  l'ordinateur tout de suite**. Personne n'est bloqué parce que l'équipe est absente.
- L'arène liste les défis ouverts avec le **pseudo** de qui les a posés, **jamais la
  mise**. On choisit qui on relève ; relever coûte un crédit et engage un exemplaire,
  **à l'aveugle des deux côtés**.
- Les deux mises sont révélées **à la résolution**, simultanément. Personne ne réagit à
  l'autre : sans ça, le second joueur ajusterait toujours au minimum nécessaire et il
  n'y aurait plus de pari.
- **Perdant : exemplaire détruit.** Espèce et bonbons conservés.
- **Vainqueur : exemplaire intact**, plus un **pli d'arène**, des pokédollars et des
  points de saison — tous trois au palier de **l'enjeu du duel**, c'est-à-dire le plus
  petit des deux engagements (§ 4).
- **Un défi ouvert sans preneur sous 24 h** est résolu contre l'ordinateur.
- **Deux duels par semaine maximum contre la même personne.**

**Propriété centrale** : entre humains, l'arène **ne crée ni ne détruit d'exemplaire,
elle déplace** — un détruit d'un côté, un tiré de l'autre. Contre l'ordinateur, elle ne
touche à rien.

### L'ordinateur

L'ordinateur n'est pas un joueur : il ne possède rien. S'il détruisait un exemplaire,
un Pokémon disparaîtrait sans contrepartie ; s'il payait un pli, il en apparaîtrait un
depuis rien. Un duel contre l'ordinateur est donc **symbolique** :

- des **pokédollars uniquement**, moitié moins que contre un humain, au palier de sa
  propre mise ;
- **aucun pli**, **aucun point de classement**, **aucun gain de niveau**, **aucun risque**.

**Comment l'ordinateur choisit son combattant.** Il **tire dans une distribution
plausible** : une espèce au hasard dans le pool du palier de ta propre mise, à un niveau
tiré entre 1 et le niveau médian des exemplaires réellement engagés dans l'arène ces
trente derniers jours, avec sa forme du jour normale.

Un 50/50 systématique a été écarté : si l'issue ne dépend plus de ce qu'on engage, on
engage n'importe quoi et le duel contre l'ordinateur n'apprend rien. Une distribution
plausible conserve la seule chose qui compte — que le choix de la mise ait des
conséquences — sans jamais rendre l'ordinateur plus facile que l'équipe.

L'absence de gain de niveau n'est pas un détail : sans elle, on monterait un champion
sans jamais rien risquer, et le niveau cesserait de mesurer ce qu'on a osé.

Conséquence assumée : **une saison ne peut pas se gagner sans affronter des humains.**

---

## 3 · Le combat

### Puissance

```
puissance = stats de base × coefficient de rareté × niveau × forme du jour
```

| Facteur | Valeurs | Rôle |
|---|---|---|
| Stats de base | 195 à 680 selon l'espèce | La colonne vertébrale |
| Rareté | c ×1,00 · u ×1,06 · r ×1,15 · **l ×1,45** | Appuie là où les stats ne suffisent pas — et le légendaire en a besoin : son pool (580-680) chevauche le haut du pool rare (jusqu'à 600) |
| Niveau | ×1,00 à ×1,45 (niv. 1 à 10, +5 %/niveau) | Le seul facteur qui se mérite |
| Forme du jour | ×0,90 · ×0,95 · ×1,00 · ×1,05 · ×1,10 | Fait hésiter, ne décide jamais |

**Les stats sont la base, pas un détail** : Salamèche et Dracaufeu sont *tous les deux
rares* dans ce projet — seules les stats les distinguent. Le coefficient de rareté est
volontairement léger parce que **la mesure montre que les stats portent déjà l'écart** :

| Palier | Espèces | Min | Moyenne | Max |
|---|---|---|---|---|
| Commun | 22 | 195 | 280 | 335 |
| Peu commun | 78 | 205 | 402 | 555 |
| Rare | 46 | 288 | 458 | 600 |
| Légendaire | 5 | 580 | 604 | 680 |

Le doubler partout compterait la rareté deux fois. Deux frontières font exception, et ce
sont elles que le coefficient appuie :

- **peu commun / rare se chevauchent lourdement** — un peu commun monte à 555, un rare
  démarre à 288, et Canarticho (rare, 377) est plus faible que Rattatac (peu commun, 413) ;
- **rare / légendaire se chevauchent aussi** — le pool légendaire va de 580 à 680 quand le
  pool rare monte à 600. À un coefficient de 1,25, un légendaire frais ne battait le
  meilleur rare que **54 %** du temps : le palier ne se sentait pas. À **1,45** il le bat
  64 % du temps et écrase un rare moyen à 80 %, sans devenir intouchable — le bornage à
  90 % continue de garantir sa mortalité.

### Issue

```
P(victoire) = clamp( Pa³ / (Pa³ + Pb³), 0,10 , 0,90 )
```

L'élévation au cube est nécessaire : un rapport direct laisserait un Rattata battre
Électhor près d'une fois sur trois. Le **bornage à [10 %, 90 %]** fait trois choses d'un
seul chiffre — aucun combat n'est gagné d'avance, l'exploit existe sans règle dédiée, et
**tout légendaire descendu régulièrement finit par mourir** (espérance de vie ≈ 10 duels).

Repères issus des vraies valeurs :

| Affrontement | P(victoire du premier) |
|---|---|
| Rattata (253, c) vs Électhor (580, l) | **10 %** (4,6 % avant bornage) |
| Salamèche (309, r) vs Dracaufeu (534, r), tous deux frais | **16 %** |
| Salamèche **niv. 10** vs Dracaufeu frais | **37 %** |
| Roucool (251, c) **niv. 10** vs Dracaufeu frais | **17 %** |
| Canarticho (377, **r**) vs Rattatac (413, **u**), tous deux frais | **49 %** — le coefficient de rareté rattrape presque l'écart de stats, sans le renverser |

### Niveaux

Gagnés selon le **rapport de puissance déjà calculé pour le combat** — un seul calcul qui
sert deux fois, aucune seconde formule.

| Puissance de l'adversaire | Gain |
|---|---|
| < 0,75× la sienne | **+0** |
| 0,75× à 1,10× | **+1** |
| 1,10× à 1,50× | **+2** |
| 1,50× à 2,00× | **+3** |
| ≥ 2,00× | **+5** |

Plafond **niveau 10**. Trois exploits suffisent à faire un champion ; écraser des faibles
n'en fait jamais. **Un légendaire ne progresse quasiment pas** : Électhor pèse 725 à
niveau 1 et lui faut un adversaire à 544 minimum pour marquer ne serait-ce que +1 — face
au tout-venant il est à 0,59× et gagne zéro. Cet équilibrage tombe de la règle, il n'est
écrit nulle part comme exception.

**Le niveau meurt avec l'exemplaire.** C'est ce qui donne au mode son enjeu le plus fort :
perdre un champion, c'est perdre du temps investi, pas de la chance au tirage.

### Forme du jour

Cinq états, de « en pleine forme » à « épuisé ». **Calculée, jamais stockée** : fonction
pure de la clé d'exemplaire et de la date, sur le modèle du tirage
(`fnv1a(clé + ':forme:' + jour)`). Aucune table, aucune écriture, impossible à retirer en
rafraîchissant, vérifiable par n'importe qui.

Un joueur voit la forme de **ses** exemplaires ; celle de l'adversaire lui est inconnue,
comme sa mise.

### Résumé de combat

Après la révélation, un décompte lisible : stats de base, coefficient de rareté, niveau,
forme, puissance qui en résulte, probabilité, résultat. Ce n'est pas une coquetterie :
une issue probabiliste sans explication passe pour arbitraire, surtout quand elle vient
de détruire un Pokémon.

### Les types ne comptent pas (pour l'instant)

Ils sont déjà dans `species-info.json`, donc gratuits à brancher. Mais **on engage à
l'aveugle : on ne peut pas counterpick.** Un avantage de type ne serait jamais une
décision, seulement un dé de plus déguisé en tactique. À reconsidérer uniquement si on
accepte un jour de montrer quelque chose de la mise adverse.

---

## 4 · Économie

### Gains par duel — sur l'enjeu du duel

**On ne gagne pas plus que ce que l'adversaire a engagé.** Le palier retenu est le **plus
petit des deux** — la règle du poker : celui qui pose 100 face à quelqu'un qui n'en pose
que 10 ne peut repartir qu'avec 10.

> **Nommage.** Le terme interne est *mise couverte*. Côté interface et guide du joueur, on
> dit **« l'enjeu du duel »** — « Enjeu : rare ». La règle ne s'énonce jamais, elle
> s'affiche.

| Enjeu (le plus petit des deux engagements) | Pokédollars | Points | Pli |
|---|---|---|---|
| Commun | 50 | 5 | 1 pli commun |
| Peu commun | 100 | 10 | 1 pli peu commun |
| Rare | 250 | 25 | 1 pli rare |
| Légendaire | 600 | 60 | 1 pli légendaire |

Exemples, parce que la règle se comprend mieux ainsi qu'en définition :

| Toi | L'adversaire | Enjeu | Le vainqueur gagne |
|---|---|---|---|
| Rare | Rare | **Rare** | 250 $, 25 pts, 1 pli rare |
| Rare | Commun | **Commun** | 50 $, 5 pts, 1 pli commun |
| Commun | Légendaire | **Commun** | 50 $, 5 pts, 1 pli commun |
| Peu commun | Rare | **Peu commun** | 100 $, 10 pts, 1 pli peu commun |

Battre un rare ne rapporte donc pas 250 $ : il faut que **les deux** aient engagé un rare.

| Autre situation | Gains |
|---|---|
| Défaite contre un humain | rien, et l'exemplaire engagé est détruit |
| Défaite contre l'ordinateur | rien, et l'exemplaire est conservé |

Contre l'ordinateur, en pokédollars seulement, au palier de **sa propre** mise, **au quart** du
tarif humain :

| Sa mise contre l'ordinateur | Pokédollars |
|---|---|
| Commun | 12 |
| Peu commun | 25 |
| Rare | 62 |
| Légendaire | 150 |

**Le quart et non la moitié — mesuré, pas supposé.** À demi-tarif, la simulation donne
2 750 pokédollars par saison en ne farmant que l'IA, **sans jamais rien risquer**, contre
5 406 en duels réels : l'option sûre rapportait 96 % de l'option risquée en terrain mixte.
Au quart, elle retombe à 1 158, soit 21 % — l'entraînement rémunéré qu'elle doit être.

Les **niveaux ne s'y lisent pas** : ils ne se gagnent que contre un humain, selon le
barème du § 3.

**Pourquoi l'enjeu plutôt qu'un gain fixe** (§ 8 pour les alternatives écartées).
Un gain identique quelle que soit la mise rend l'engagement d'un rare irrationnel : une
victoire vaudrait 1 pli et 100 pokédollars, quand exposer un légendaire à 10 % de perte
coûte infiniment plus. Engager pas cher dominerait mathématiquement, quel que soit le
poids de la rareté au combat, et l'arène finirait en ligue de communs.

L'enjeu supprime les deux stratégies dégénérées d'un seul mouvement :

- **Écraser un Roucool avec un légendaire** ne rapporte qu'un pli commun, pour avoir exposé
  sa pièce maîtresse. Mais attention à la formulation : contre un terrain ordinaire, un
  légendaire prend l'enjeu *rare* en gagnant deux fois sur trois, et la simulation le classe
  **politique la plus rentable du jeu** (~13 000 pokédollars par saison, deux fois et demie
  le rare). Ce qui l'interdit n'est pas la récompense, c'est **le stock** : elle coûte une
  vingtaine de légendaires par saison, quand on en tire environ un. Elle est
  **inabordable, pas non rentable** — la nuance compte le jour où quelqu'un en accumulera.
- **Venir en Roucool pour tenter l'exploit** ne rapporte qu'un pli commun aussi — même
  quand on renverse un légendaire. Le barème de niveaux à +5 reste atteignable, mais au
  prix de neuf Roucool perdus et de dix crédits dépensés : une trajectoire d'outsider
  viable, jamais dominante.
- **Rare contre rare** devient le duel le plus rentable du jeu.

**Lisibilité.** La règle n'a pas à être comprise pour être jouée : l'interface annonce le
lot **au moment de la révélation** (« Enjeu : rare — 1 pli rare, 250 pokédollars,
25 points »), et le résumé de combat le rappelle. On voit le résultat, on ne lit pas une
formule.

### Le rare est le point d'équilibre naturel de l'arène

Engager un rare **s'autofinance** : on en perd un une fois sur deux, et on gagne un **pli
rare** l'autre fois. Le stock de rares est donc à peu près neutre, et on encaisse 250
pokédollars au passage. Au rythme réel observé (~3 rares tirés par semaine, § 7), c'est
parfaitement tenable — donc **tout le monde engagera des rares**, et il faut calibrer
dessus plutôt que sur une hypothèse timide.

Rythme attendu en régime stable : 5 duels/semaine, une victoire sur deux, enjeu rare →
**~625 pokédollars et ~62 points par semaine**, soit **~5 400 pokédollars et ~540 points
par saison** de deux mois. Les prix de la boutique sont calés là-dessus.

**Ce chiffre n'est pas encore démontré, et le piège mérite d'être consigné.** Une première
simulation (2026-08-11) donnait 5 406 pokédollars par saison en rare, avec 22 plis gagnés
pour 22 exemplaires perdus, et concluait à l'autofinancement. **C'était une tautologie de
son modèle** : les deux camps y jouaient le même palier avec la même dynamique, donc le
taux de victoire valait 50 % par construction et l'égalité plis/pertes se vérifiait à
l'identique pour les quatre paliers (écart mesuré : 0,006 en rare, 0,010 en commun, 0,014
en peu commun, 0,012 en légendaire). Elle montrait aussi un revenu croissant strictement
avec la mise — 1 111 / 2 230 / 5 469 / 13 035 — parce que le seul frein réel, **on ne peut
engager que ce qu'on possède**, n'y était modélisé nulle part.

La simulation a été refaite en **ligue de cinq joueurs**, chacun avec sa réserve alimentée
par son travail et sa politique de mise, le terrain adverse devenant émergent au lieu
d'être supposé. Les chiffres qu'elle produit remplacent ceux-ci et sont la seule base
légitime pour calibrer les prix de la boutique.

**Conséquence assumée : les légendaires ne descendront jamais dans l'arène.** Personne
n'en tire assez (~1 par saison) pour encaisser d'en perdre un sur deux. Ils resteront des
trophées plutôt que des combattants. Si on veut les voir se battre un jour, il faudra une
occasion dédiée — un événement de fin de saison — pas un réglage de cette table.

### Deux compteurs, deux durées de vie

- **Points de classement** — mesurent la saison, **remis à zéro** à chaque nouvelle.
- **Pokédollars** — portefeuille qui **ne se remet jamais à zéro**.

C'est cette asymétrie qui rend la thésaurisation possible : économiser près de trois
saisons pour un légendaire inédit est une stratégie, alors qu'un portefeuille remis à zéro
la rendrait absurde.

### Boutique

Elle ne vend que des **plis**, jamais des espèces nommées : on garde le rituel,
l'animation et la surprise. Un pli acheté est une ligne `catches` de source `boutique`.

| Article | Normal | Inédit garanti (×2,5) |
|---|---|---|
| Pli Gen 1 commun | 500 | 1 250 |
| Pli Gen 1 peu commun | 1 000 | 2 500 |
| Pli Gen 1 rare | 2 500 | 6 250 |
| Pli Gen 2 commun | 1 000 | 2 500 |
| Pli Gen 2 peu commun | 2 000 | 5 000 |
| Pli Gen 2 rare | 5 000 | 12 500 |
| Pli légendaire Gen 1 | 6 000 | 15 000 |

**L'« inédit garanti » tire uniquement parmi les espèces non possédées.** Il existe parce
que l'objectif de la boutique est de *compléter* : un pli rare tire au hasard parmi 46
espèces, donc quand il en manque trois, on paye pour un doublon neuf fois sur dix. Plus
on approche de la fin, plus la boutique devient inefficace là où elle est le plus utile.
C'est un filtre sur le pool à l'achat, pas une mécanique de plus.

Repères sur une saison (~5 400) : un rare Gen 1 inédit ou un légendaire = **~1,1 saison** ;
un rare Gen 2 inédit = **~2,3 saisons** ; le légendaire inédit = **~2,8 saisons**, dernier
objectif du jeu.

### Saison

**Deux mois**, sur des bornes de calendrier fixes (une saison démarre le 1ᵉʳ d'un mois
impair et se clôt le dernier jour du mois suivant), pour qu'aucun joueur n'ait de saison
personnelle et que le classement compare bien la même période pour tout le monde.

Le légendaire n'a besoin d'aucune règle de calendrier : à ~1,4 saison d'économies, il
devient trimestriel de lui-même.

Fin de saison :

| Rang | Pokédollars | Autre |
|---|---|---|
| 1ᵉʳ | 2 500 | **Badge permanent** « Vainqueur de la saison N » |
| 2ᵉ | 1 250 | — |
| 3ᵉ | 600 | — |

Le podium plutôt que le seul vainqueur : à 4-5 joueurs, presque tout le monde touche
quelque chose, et le meilleur ne creuse pas un écart matériel saison après saison. Le
badge reste la vraie récompense.

**Les badges sont les vrais badges d'arène**, repris de
[SteGriff/pokemon-badges](https://github.com/SteGriff/pokemon-badges) — 40 badges
vectoriels de Kanto à Unova, **licence CC BY 3.0** (Stephen Griffiths, 2011, d'après
Bulbapedia). La seule obligation est de créditer ; l'attribution ira dans le guide du
joueur et dans le README.

**La région du badge suit la génération** : les 8 badges de **Kanto** tant que le jeu est
en Gen 1 — soit 16 mois de saisons — puis **Johto** à l'ouverture de la Gen 2. C'est un
alignement qu'aucun badge généré n'aurait donné.

**Travail d'intégration à prévoir**, ce n'est pas un import direct : le dépôt contient
**5 fichiers, un par région**, chacun étant une page A4 Inkscape portant les 8 badges
(144 Ko pour Kanto, identifiants générés du type `linearGradient4173`). Il faut découper
en 8 SVG individuels, recadrer les `viewBox`, purger les métadonnées Inkscape, optimiser,
puis **verser les fichiers dans le dépôt** — pas de récupération distante à l'exécution.
Compter une petite heure.

**Réserve, posée sans dramatiser** : la CC BY couvre la recréation de l'auteur, pas les
dessins de Nintendo en dessous. Le projet sert déjà des sprites Nintendo depuis
`PokeAPI/sprites` sur chaque écran — même classe de risque, pas une de plus, pour un outil
interne. Repli si on veut s'en affranchir un jour : des badges **dessinés en SVG dans le
projet et générés à partir du numéro de saison**, dans le registre des effets déjà
fabriqués à la main (rayons rotatifs, lasers multicolores).

### Gen 2

Obtenable **uniquement** par la boutique. Elle entre dans `DEX` et dans `NOT_DRAWABLE`,
donc jamais dans le tirage du travail. Elle vit sur une **étagère séparée**, hors de la
grille des 151 et de son compteur — sinon la grille afficherait 251 cases dont une
centaine vides pour toujours, et `/151` (`TheRail.vue:78`) ne voudrait plus rien dire.
Teasée par un point d'interrogation tant qu'on n'en possède aucune.

Sprites : même dépôt, mêmes URLs, ids 152 à 251 (`src/lib/sprites.js`). Aucun asset à
produire.

---

## 5 · Ce que chacun voit

| Donnée | Visibilité |
|---|---|
| Pseudo | Tous les connectés |
| Points de saison / classement | Tous les connectés |
| Badges de saison | Tous les connectés |
| Dex d'autrui — **quelles espèces** | Tous les connectés |
| Dex d'autrui — **combien d'exemplaires** | **Personne** |
| Mise d'un défi ouvert | **Personne**, jusqu'à résolution |
| Forme du jour d'un exemplaire | Son propriétaire seul |
| Stats, coefficient, niveau, puissance de ses propres exemplaires | Son propriétaire, **entièrement** |
| Duel résolu, dans le détail | Ses deux participants |

**Espèces oui, exemplaires non** : le nombre d'espèces plafonne à 151 et sature vite ; le
nombre d'exemplaires, lui, ne plafonne jamais — c'est un compteur brut de PR mergées.
Publier des collections dans une entreprise reviendrait à publier un classement de
productivité, et à comparer des feedbacks CSM à des PR comme si c'était la même unité.
La décision produit et la garantie technique sont le même objet : une vue en espèces
distinctes.

**Les stats de ses propres exemplaires sont affichées entièrement.** Le résumé de combat
les révèle de toute façon après coup ; les cacher avant obligerait à les apprendre par
cœur. L'information cachée intéressante est celle de l'adversaire.

---

## 6 · Architecture

### Tables — aucune écriture directe du joueur

| Table | Contenu |
|---|---|
| `arena_exemplars` | Niveau, victoires et destruction d'un exemplaire, repéré par sa clé `source:external_id` |
| `arena_duels` | Les deux camps, les deux mises, l'état (ouvert / résolu / ordinateur), le vainqueur, et les puissances conservées pour le résumé |
| `arena_wallet` | Portefeuille persistant |
| `arena_season_points` | Score par saison, remis à zéro |
| `arena_seasons` | Saisons closes et leur podium — **les points repartent à zéro, les badges sont permanents** : sans cette table, un badge gagné n'aurait plus aucun référent après la remise à zéro |
| `species_stats` | Stats de base, générée par le même script que `species-info.json` |
| `profiles.pseudo` | Seule donnée personnelle lue par les autres |

**Les crédits ne se stockent pas** : jours ouvrés écoulés depuis le début de la semaine
moins les duels déjà joués, plafonné à 5. Rien à maintenir, rien à désynchroniser.

### Résolution

Une **fonction Postgres `security definer`**, appelée par le joueur qui relève un défi.
Elle vérifie les crédits, le plafond hebdomadaire par paire, la disponibilité des deux
exemplaires, calcule l'issue et écrit tout **atomiquement**.

C'est indispensable : sans transaction unique, deux acceptations simultanées du même défi
détruiraient deux exemplaires pour un seul duel — exactement la classe de bug de la double
dépense de bonbons déjà rencontrée dans ce projet, dont NOTES.md dit que la vraie réponse
était une RPC atomique jamais écrite. Elle le sera ici.

**Les défis périmés à 24 h** sont résolus par le travail planifié existant : `catch.yml`
tourne déjà toutes les heures de 8h à 19h avec les droits nécessaires. Aucune
infrastructure nouvelle. Un défi posté en fin de journée expire le lendemain matin, sans
conséquence.

### Le pli gagné n'est pas un nouveau concept

Une ligne `catches` avec `source = 'arene'` (ou `'boutique'`) et l'identifiant du duel ou
de l'achat comme `external_id`, tirée par `drawFrom` sur sa propre clé, aux cotes de tout
le monde. Rituel, animation, compteur, bonbons : **aucune ligne du front à changer**. Le
découplage par source fait en juillet paye ici exactement ce pour quoi il a été fait.

### Ce qui, en revanche, touche bien le front

Le pli entrant est gratuit ; **la sortie ne l'est pas.** Deux états nouveaux doivent
entrer dans `useDex` :

- **l'immobilisation** d'un exemplaire engagé dans un défi en cours — ni évolution, ni
  second engagement ;
- **la destruction** d'un exemplaire perdu.

Les deux se comportent comme `consumedKeys` (l'exemplaire sort du stock, l'espèce reste
au dex), mais leur source de vérité est une **table d'arène**, pas `state` — qui est
modifiable par le joueur. `useDex` reçoit donc une entrée de plus, et `availableEntries`,
`copyCount` et `canEvolve` s'en servent. Ce n'est pas énorme, mais ce n'est pas rien :
le cœur du jeu, resté intact à la bascule Supabase comme au découpage par source, bouge
cette fois.

### RLS

- `profiles.pseudo` — lisible par tous les connectés.
- Défis ouverts : **une vue** n'exposant qu'identifiant, pseudo et heure. La mise n'est
  pas seulement masquée à l'affichage, elle **n'est pas lisible** — donc pas contournable
  par un appel direct à l'API.
- Dex d'autrui : **une vue en espèces distinctes**, jamais les exemplaires.
- Un duel résolu devient entièrement lisible par ses deux participants.

### Le seul point de duplication

La **forme du jour** doit être lisible côté client avant d'engager, et recalculée par la
fonction de résolution. Une petite fonction de hachage existera donc en JS **et** en SQL,
avec **un test de parité** entre les deux. C'est le seul endroit où de la logique vit en
deux exemplaires ; signalé maintenant plutôt que découvert en production.

---

## 7 · Calibration et simulation

Tous les chiffres ci-dessus sont un **point de départ**, pas des valeurs finales. Un
script d'affrontements en masse sur des collections plausibles les corrigera, dans
l'esprit de la mesure d'entropie déjà faite dans ce projet.

Quatre acquis à **démontrer**, pas à supposer :

1. **Aucune stratégie de mise dominante** — engager petit doit perdre, engager gros ne
   doit pas être gratuit.
2. **Un joueur prudent progresse, un joueur audacieux nettement plus.**
3. **Un légendaire descendu chaque semaine finit détruit** en quelques mois.
4. **La boutique reste hors de portée du seul farming contre l'ordinateur.**

### Une donnée qui change les ordres de grandeur

Le rythme réel observé est de **~5 PR mergées par jour et par personne**, soit ~25 plis
par semaine — **quatre fois l'hypothèse du brief** (300/an). Conséquences :

- Le dex sature vite et **les doublons s'entassent**, ce que NOTES.md consigne déjà comme
  un manque (les « bonbons morts »). L'arène leur donne enfin un usage et une sortie.
- Les plis d'arène (~2,5/semaine au mieux) sont **une garniture, pas une source
  d'inflation**.
- **L'arène est le seul endroit où quelqu'un qui merge peu joue à armes égales** : les
  crédits tombent au rythme du calendrier, pas de l'activité. Un Roucool niveau 10 se
  construit à la présence, pas au volume. C'est le contrepoids d'un jeu qui, sinon, ne
  récompenserait que le débit.

---

## 8 · Décisions écartées, et pourquoi

**Le transfert du Pokémon perdu au vainqueur** — plus personne n'engagerait autre chose
que des doublons sans valeur.

**Un bonus de chance sur les tirages (« +10 % pendant une semaine »)** — casserait la
pureté de `drawFrom`. Remplacé par des tirages en plus.

**Récompense indexée sur sa propre mise** — engager un légendaire et écraser un Roucool
devient le coup le plus payant du jeu.

**Récompense indexée sur la mise adverse** — le miroir : chacun engage petit en espérant
que l'autre engage gros.

**Gain fixe, identique quelle que soit la mise** — retenu un temps pour sa simplicité,
puis écarté à la relecture. Il rend l'engagement d'un rare irrationnel (une victoire vaut
1 pli, exposer un légendaire coûte bien plus), et il rendait le barème de niveaux
pathologique : venir en Roucool devenait doublement payant — peu à perdre, et +5 niveaux
les fois où l'exploit tombe. **Retenu à la place : la mise couverte** (§ 4), qui corrige
les deux d'un seul mouvement, sa lisibilité étant traitée par l'interface plutôt que par
la règle.

**Arènes séparées par palier** — supprimait la décision qui rend le duel intéressant :
ne pas savoir ce que l'autre engage.

**Appariement automatique** — supprimait la seule décision sociale du mode.

**« Pas deux fois de suite le même adversaire »** — dépendait de qui était connecté au
même moment. Remplacé par le **plafond de 2 duels par semaine et par paire**, prévisible
et sans condition. Coût assumé : en semaine à deux joueurs, seuls 2 duels humains sont
possibles, le reste part à l'ordinateur.

**Un pli offert par l'ordinateur** — créerait des exemplaires à partir de rien, jusqu'à 5 par
semaine et par personne. Le joueur isolé reçoit ses plis par la boutique, qui reste
**l'unique robinet de création**, dont les prix se calibrent.

**Un légendaire distribué en fin de saison** — 6 par an pour 5 espèces existantes, quatre
fois le rythme naturel et concentrés sur un joueur. Remplacé par un prix en boutique.

**Points de saison et pokédollars sur le même compteur** — acheter ferait dégringoler au
classement, punissant exactement ce que le mode récompense.

**Les types dans le combat** — invérifiables tant qu'on engage à l'aveugle.

---

## 9 · Hors périmètre

**La collusion.** Deux complices peuvent s'échanger des victoires. À quatre ou cinq
collègues, une machinerie anti-abus coûterait plus cher que ce qu'elle protège.

**Le ciblage d'un même joueur au-delà du plafond hebdomadaire.** Se corrige socialement :
la victime cesse de poster, ou engage gros une fois pour punir une lecture trop confiante.

**Un plancher de participation pour le perdant.** Une défaite ne rapporte rien. Si ça
décourage à l'usage, le correctif ira **dans le portefeuille, jamais au classement** —
pour que la régularité de l'un ne rattrape jamais au tableau les duels que l'autre n'a
pas joués.

**Le combat en direct.** Asynchrone uniquement : personne ne sera en ligne au même
instant dans une équipe de cinq.

**Un léger bonus de points à celui qui poste**, pour compenser le fait que celui qui
relève voit le pseudo alors que le poste ignore qui viendra. Réglage tenu en réserve,
pas une règle.
