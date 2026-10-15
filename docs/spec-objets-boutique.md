# PR-DEX — les objets de la boutique

Document d'arbitrage, écrit le 14 octobre 2026. **Rien n'est implémenté.** Les décisions ci-dessous
sont prises, les chiffres mesurés, et le travail est repoussé à janvier 2027 — après que l'arène ait
tourné une saison. Ce document existe pour qu'on reprenne sans redériver.

Le pendant de game design est dans `brief-design-pr-dex.md`, qui fait foi sur les règles de jeu.
Ce document-ci ne couvre que les objets : ce qu'ils font, ce qu'ils coûtent, et pourquoi.

---

## 1. Pourquoi janvier et pas décembre

L'arène ouvre le 1er décembre 2026. Les objets viennent après, pour deux raisons.

**On ne connaît pas encore les prix justes.** L'étalon est le revenu réel d'un joueur : environ
3 000 ₽ de duels et 790 ₽ de revente par saison, soit **3 800 ₽ par deux mois**. Ces deux chiffres
sont des projections calibrées sur l'export de production du 14 octobre, pas des mesures. Une saison
jouée les remplacera par du constaté, et tous les prix d'ici en dépendent.

**Ce n'est pas un ajout de lignes.** `arena_shop` ne connaît que des plis : `slug, gen, tier, fresh,
price`. Aucune colonne ne dit ce qu'un article *fait*. Il faut donc un type d'article, une table
d'inventaire par joueur, une RPC de consommation par effet, et pour les pierres un changement du
vivier de tirage. C'est un lot comparable à la revente.

## 2. La règle de prix

**Chaque objet coûte plus que l'avantage qu'il donne**, mesuré contre le revenu d'arène. Sinon il
devient la stratégie optimale au lieu d'un agrément, et le jeu se joue à la boutique.

Cette règle se vérifie par simulation, comme les prix de revente. Elle ne l'a pas encore été : les
prix ci-dessous sont dérivés par proportion, pas simulés. **À simuler avant de livrer.**

Un repère utile pour juger : les crédits d'engagement tombent à **un par jour ouvré, cinq en réserve
au plus** (`CREDIT_PER_WORKING_DAY`, `CREDIT_CAP`). On joue donc environ cinq duels par semaine, pas
cinq par jour — un objet dépensé « à chaque engagement » se compte par semaine.

## 3. Les objets retenus

### Potion — 60 ₽ · Super Potion — 150 ₽

Remontent la forme du jour de l'exemplaire qu'on engage : la Potion jusqu'à « Normal », la Super
Potion jusqu'à « En pleine forme » (×1,10).

Dépensées **au moment d'engager**, sur l'exemplaire envoyé. La forme est ce que le jeu a de plus
proche des points de vie — Épuisé ×0,90, Fatigué ×0,95, Normal, En forme, En pleine forme ×1,10 — et
on soigne avant le combat, pas après.

Soigner tous ses engagements d'une semaine coûterait 300 à 750 ₽ sur 3 800 ₽ de revenu : 10 à 20 %
du budget. C'est un choix ponctuel, pas une routine.

### Super Bonbon — 300 ₽

+1 niveau sur un exemplaire.

Un niveau ne se substitue pas à une victoire : gagner un duel paie *et* fait monter. L'objet sert
quand on a de l'argent et pas d'occasion — plus de crédits, ou pas d'adversaire à sa hauteur.

Le garde-fou se mesure. Le plafond est le niveau 10, et dix niveaux valent **×1,45** en puissance.
Monter un exemplaire de 1 à 10 coûterait donc **2 700 ₽**, soit les trois quarts d'une saison de
revenu, pour un facteur et demi sur un seul Pokémon. Et ça ne franchit aucun palier : un commun au
niveau 10 pèse 367, un rare au niveau 1 pèse 581. Payer ne fait pas changer de catégorie.

### Œuf Chance — 250 ₽

La prochaine victoire fait gagner **deux fois plus de niveaux**.

L'effet canonique de l'Œuf Chance porte sur l'expérience, donc ici sur les niveaux et non sur
l'argent. Il pousse à jouer plutôt qu'à encaisser.

### Les cinq pierres — 400 ₽ chacune

| pierre | fait évoluer |
|---|---|
| Pierre Feu | Évoli → Pyroli |
| Pierre Eau | Évoli → Aquali |
| Pierre Foudre | Évoli → Voltali |
| Pierre Aube | Évoli → Mentali |
| Pierre Nuit | Évoli → Noctali |

Les cinq évoliens **sortent du vivier de tirage** — une entrée dans `NOT_DRAWABLE`, où Léviator se
trouve déjà pour exactement cette raison, et le commentaire du code le dit : « Léviator ne se tire
jamais : seul accès, faire évoluer Magicarpe. Exception ciblée, pas une règle générale sur les 3e
évolutions. »
Johto compris : Mentali et Noctali n'ont pas de pierre dans le jeu d'origine, mais la Pierre Aube et
la Pierre Nuit existent depuis la quatrième génération et portent la bonne sémantique — le jour et la
nuit, qui est la règle canonique de ces deux-là. La famille obéit alors à une règle unique.

**La pierre REMPLACE les bonbons, elle ne s'y ajoute pas.** Évoli coûte aujourd'hui 8 bonbons. Si la
pierre s'ajoutait, les cinq branches reviendraient à 2 000 ₽ *plus* 40 bonbons *plus* cinq exemplaires
d'Évoli — personne ne le ferait. C'est aussi fidèle : une évolution par pierre ne demande aucun niveau.

#### Évoli passe de rare à peu commun

Ce n'est pas un ajustement cosmétique, c'est la condition pour que la fonctionnalité existe. Mesuré
sur l'export du 14 octobre, 9 joueurs actifs, 1 894 captures sur 93 jours :

| espèce | joueurs qui la possèdent |
|---|---|
| **Évoli** | **2** |
| Aquali | 5 |
| Voltali | 3 |
| Pyroli | 1 |

Il existe **deux exemplaires d'Évoli dans toute l'équipe**, un chacun chez deux joueurs, après trois
mois de jeu. Or il en faut un par branche. Laisser Évoli en rare revient à vendre des pierres que
personne ne peut utiliser.

Les pierres, elles, servent encore : sur les 27 cases possibles — 9 joueurs × 3 évoliens de Kanto —
**18 restent à obtenir**, et quatre joueurs sur neuf n'en ont aucun. Un seul a les trois.

#### Le rayon, séparé

Les pierres sont les seuls articles de la boutique qui ne sont pas des plis. Un prix posé à côté d'un
pli de même prix, sans rien qui les distingue, se lit comme une erreur.

Le rayon est donc à part, sous les plis, avec **une ligne par pierre portant la transformation en
toutes lettres** — « Pierre Eau · Évoli → Aquali ». Les cinq ensemble se lisent comme un arbre, et le
joueur comprend du même coup pourquoi aucun évolien ne tombe plus au tirage.

En tête de rayon, la seule phrase qui compte : il faut un Évoli par branche, et Évoli ne s'achète pas.

## 4. Ce qui est écarté, et pourquoi

Ces propositions ont été étudiées et refusées. Elles n'ont pas à revenir sans élément nouveau.

### Bonbons de famille — écarté

Huit bonbons de la famille choisie, 500 ₽. C'est le seul objet qui laisse **l'argent remplacer le
travail** : on achèterait ses évolutions au lieu de les mériter. Un cheatcode.

### Charme Chroma — écarté

Cotes de chromatique de 1 sur 128 à 1 sur 64, en permanent. Deux formes possibles, aucune ne tient.

**Sur les captures de travail**, il casse l'ancrage externe. Un tirage se rejoue aujourd'hui depuis le
sha, qui vient de GitHub : c'est une vérité que l'application ne contrôle pas, et c'est elle qui fait
que personne ne peut contester un résultat. Avec le charme, il faudrait aussi connaître son état au
moment du merge — et cet état est écrit par le même programme qui fait le tirage. Le seul point
d'appui extérieur disparaît.

**Sur les plis achetés**, la vérifiabilité est sauve mais l'objet ne vaut rien. À 3 800 ₽ par saison on
achète une douzaine de plis ; passer de 1/128 à 1/64 sur douze tirages fait monter la chance d'un
chromatique de 9 % à 17 % par saison. Six mille pokédollars — une saison et demie — pour huit points
de pourcentage.

Et la place qu'il visait est déjà prise : `gen2-r-inedit` coûte 6 000 ₽ et garantit une espèce de Johto
qu'on n'a pas. Même prix, même horizon, et il donne quelque chose plutôt qu'une probabilité.

### Objet « chances de légendaire » — écarté

Fait doublon avec le pli légendaire garanti à 4 500 ₽. À +5 % sur dix tirages, l'espérance est d'un
demi-légendaire, soit 2 250 ₽ : au-dessus personne ne l'achète, en dessous il écrase le pli garanti.

### Encens — écarté

Revient à acheter un pli d'un palier au-dessus, ce que la boutique fait déjà.

### Pierres pour les autres lignées — écarté

Retirerait un choix au lieu d'en ajouter un. Les cinq évoliens sont un cas particulier : une espèce,
cinq sorties, et le joueur choisit laquelle. Partout ailleurs l'évolution est déterminée.

## 5. Repoussé, avec sa question

### Rappel — 600 ₽, repoussé

Ranime un exemplaire détruit à l'arène. C'est le seul objet qui touche à la règle la plus dure du jeu,
et sa question n'a pas de bonne réponse avant d'avoir joué : **à quel niveau revient-il ?**

À son niveau plein, la défaite est annulée et l'arène perd ses dents. Au niveau 1, personne ne paiera
600 ₽ pour un commun. La demi-mesure — la moitié de son niveau, un niveau 10 revient à 5 — garde une
perte réelle tout en sauvant le champion auquel on tient.

On ne sait pas encore combien il fait mal de perdre un champion. Une saison le dira.

## 6. Ce que l'implémentation demande

Rien de ceci n'existe.

- **Un type d'article** dans `arena_shop`. Aujourd'hui tout article est un pli, décrit par
  `gen, tier, fresh`. Il faut distinguer pli, consommable et pierre.
- **Un inventaire par joueur.** Les plis se matérialisent en cartes ; un consommable se garde jusqu'à
  son usage. C'est une table de plus, avec sa RLS.
- **Une consommation par effet.** La Potion s'applique en engageant, le Super Bonbon à un exemplaire
  choisi, la pierre à une évolution. Chacune est une RPC atomique : vérifier la possession, appliquer,
  décrémenter, dans la même transaction.
- **Le vivier de tirage**, pour les pierres : cinq entrées dans `NOT_DRAWABLE` et le palier d'Évoli.
  Les tests de `shared/draw.test.js` comptent les espèces tirables ; ils bougeront.
- **La simulation des prix**, qui n'a pas été faite.

Deux de ces points touchent à des propriétés que le projet défend : le vivier de tirage change ce que
« finir le Pokédex » veut dire, et l'inventaire ajoute un état de joueur que le tirage ne doit jamais
lire. À traiter avec la même discipline que la revente.
