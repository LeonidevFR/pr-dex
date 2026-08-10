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
- Au moment d'engager, le joueur choisit : **poster un défi ouvert**, ou **affronter la
  maison tout de suite**. Personne n'est bloqué parce que l'équipe est absente.
- L'arène liste les défis ouverts avec le **pseudo** de qui les a posés, **jamais la
  mise**. On choisit qui on relève ; relever coûte un crédit et engage un exemplaire,
  **à l'aveugle des deux côtés**.
- Les deux mises sont révélées **à la résolution**, simultanément. Personne ne réagit à
  l'autre : sans ça, le second joueur ajusterait toujours au minimum nécessaire et il
  n'y aurait plus de pari.
- **Perdant : exemplaire détruit.** Espèce et bonbons conservés.
- **Vainqueur : exemplaire intact**, plus un **pli d'arène**, des pokédollars et des
  points de saison.
- **Un défi ouvert sans preneur sous 24 h** est résolu contre la maison.
- **Deux duels par semaine maximum contre la même personne.**

**Propriété centrale** : entre humains, l'arène **ne crée ni ne détruit d'exemplaire,
elle déplace** — un détruit d'un côté, un tiré de l'autre. Contre la maison, elle ne
touche à rien.

### La maison

La maison n'est pas un joueur : elle ne possède rien. Si elle détruisait un exemplaire,
un Pokémon disparaîtrait sans contrepartie ; si elle payait un pli, il en apparaîtrait un
depuis rien. Un duel contre la maison est donc **symbolique** :

- des **pokédollars uniquement**, moitié moins que contre un humain ;
- **aucun pli**, **aucun point de classement**, **aucun gain de niveau**, **aucun risque** ;
- l'adversaire artificiel est **de force honnête**, jamais plus facile — sinon le mode se
  jouerait entièrement en solo.

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
| Rareté | c ×1,00 · u ×1,06 · r ×1,15 · l ×1,25 | Appuie là où les stats ne suffisent pas |
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

Le doubler compterait la rareté deux fois. En revanche **peu commun et rare se
chevauchent lourdement** (un peu commun monte à 555, un rare démarre à 288 — Canarticho,
rare, 377, est plus faible que Rattatac, peu commun, 413) : c'est cette frontière-là que
le coefficient appuie.

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
| Roucool (251, c) **niv. 10** vs Dracaufeu frais | **18 %** |

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
(`fnv1a(clé + ':forme' + jour)`). Aucune table, aucune écriture, impossible à retirer en
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

### Gains par duel — identiques quelle que soit la mise

| Situation | Pokédollars | Points | Pli |
|---|---|---|---|
| Victoire contre un humain | 100 | 10 | 1 |
| Défaite contre un humain | 0 | 0 | — |
| Victoire contre la maison | 50 | 0 | — |
| Défaite contre la maison | 0 | 0 | — |

Les **niveaux ne s'y lisent pas** : ils ne se gagnent que contre un humain, selon le
barème du § 3.

Le gain fixe est un **choix assumé** contre deux alternatives testées et écartées
(§ 8). Sa conséquence connue : puisque le gain ne dépend pas du risque, seul le poids
de la rareté dans le combat empêche d'engager systématiquement pas cher. **L'équilibre
du mode vit dans la formule de combat, pas dans la table des gains.**

Rythme attendu : 5 duels/semaine, une victoire sur deux → **250 pokédollars et 25 points
par semaine**, soit **~2 200 pokédollars et ~215 points par saison** de deux mois.

### Deux compteurs, deux durées de vie

- **Points de classement** — mesurent la saison, **remis à zéro** à chaque nouvelle.
- **Pokédollars** — portefeuille qui **ne se remet jamais à zéro**.

C'est cette asymétrie qui rend la thésaurisation possible : économiser deux saisons pour
un légendaire est une stratégie, alors qu'un portefeuille remis à zéro la rendrait absurde.

### Boutique

Elle ne vend que des **plis**, jamais des espèces nommées : on garde le rituel,
l'animation et la surprise. Un pli acheté est une ligne `catches` de source `boutique`.

| Article | Normal | Inédit garanti (×2,5) |
|---|---|---|
| Pli Gen 1 commun | 250 | 625 |
| Pli Gen 1 peu commun | 500 | 1 250 |
| Pli Gen 1 rare | 1 200 | 3 000 |
| Pli Gen 2 commun | 500 | 1 250 |
| Pli Gen 2 peu commun | 1 000 | 2 500 |
| Pli Gen 2 rare | 2 400 | 6 000 |
| Pli légendaire Gen 1 | 3 000 | 7 500 |

**L'« inédit garanti » tire uniquement parmi les espèces non possédées.** Il existe parce
que l'objectif de la boutique est de *compléter* : un pli rare tire au hasard parmi 46
espèces, donc quand il en manque trois, on paye pour un doublon neuf fois sur dix. Plus
on approche de la fin, plus la boutique devient inefficace là où elle est le plus utile.
C'est un filtre sur le pool à l'achat, pas une mécanique de plus.

Repères sur une saison (~2 200) : un rare Gen 1 inédit ou un légendaire = **1,4 saison** ;
un rare Gen 2 inédit = **2,7 saisons** ; le légendaire inédit = **3,4 saisons**, dernier
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
| 1ᵉʳ | 1 000 | **Badge permanent** « Vainqueur de la saison N » |
| 2ᵉ | 500 | — |
| 3ᵉ | 250 | — |

Le podium plutôt que le seul vainqueur : à 4-5 joueurs, presque tout le monde touche
quelque chose, et le meilleur ne creuse pas un écart matériel saison après saison. Le
badge reste la vraie récompense.

**Badges dessinés en SVG dans le projet, générés à partir du numéro de saison** — forme
et palette dérivées. Aucun asset à produire, aucune question de droits sur de l'imagerie
Nintendo, un badge distinct garanti pour la saison 12 comme pour la 1. Le projet fabrique
déjà ses effets à la main (rayons rotatifs, lasers multicolores) : c'est le même registre.

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
| `arena_duels` | Les deux camps, les deux mises, l'état (ouvert / résolu / maison), le vainqueur, et les puissances conservées pour le résumé |
| `arena_wallet` | Portefeuille persistant |
| `arena_season_points` | Score par saison, remis à zéro |
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
4. **La boutique reste hors de portée du seul farming contre la maison.**

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

**Récompense sur la « mise couverte » (règle du poker)** — mathématiquement le meilleur
équilibre, écarté pour sa lisibilité : la règle ne se comprend pas en une phrase.
**Retenu à la place : gain fixe**, avec la conséquence assumée que l'équilibre repose
entièrement sur la formule de combat.

**Arènes séparées par palier** — supprimait la décision qui rend le duel intéressant :
ne pas savoir ce que l'autre engage.

**Appariement automatique** — supprimait la seule décision sociale du mode.

**« Pas deux fois de suite le même adversaire »** — dépendait de qui était connecté au
même moment. Remplacé par le **plafond de 2 duels par semaine et par paire**, prévisible
et sans condition. Coût assumé : en semaine à deux joueurs, seuls 2 duels humains sont
possibles, le reste part à la maison.

**Un pli offert par la maison** — créerait des exemplaires à partir de rien, jusqu'à 5 par
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
