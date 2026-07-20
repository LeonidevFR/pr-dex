# PR-DEX — brief design

## Le produit en une phrase

Un pokédex personnel qui se remplit tout seul : chaque pull request mergée sur mes repos GitHub
donne un Pokémon, que je viens « ouvrir » dans l'app comme un booster.

Usage strictement personnel, un seul utilisateur (moi), pas de comptes, pas de social, pas de
monétisation. Le but n'est pas de me faire travailler plus : c'est un susucre après un travail
bien fait. Aucune mécanique ne doit récompenser le volume, l'heure ou le jour de travail.

## L'audience

Un développeur, seul, qui ouvre l'app une à trois fois par semaine, sur desktop principalement et
sur mobile de temps en temps. Il connaît Pokémon rouge/bleu par cœur. Il n'a pas besoin qu'on lui
explique ce qu'est un pokédex.

## Point de départ

Une V1 fonctionnelle existe : `pr-dex.html` (Vue 3, un seul fichier, tout est câblé — grille,
fiche, bonbons, rituel, données de démo). **Partez de ce fichier, pas d'une page blanche.**
La logique de jeu est finie et testée ; c'est la couche visuelle et le rythme qui doivent monter
d'un cran.

---

## Contraintes techniques (non négociables)

- **Vue 3**, Composition API. Actuellement en CDN sans build ; passer en SFC/Vite est OK si utile.
- **Le repo GitHub privé est la base de données.** Pas de backend, pas de serveur. Le front lit et
  écrit les fichiers JSON du repo via l'API REST GitHub (`/repos/{owner}/{repo}/contents/{path}`),
  authentifié par un PAT fine-grained scopé sur ce seul repo (`contents: read/write`), sans
  expiration, saisi une fois et gardé en local. Un seul utilisateur, son propre repo : les
  objections habituelles sur un token côté client ne s'appliquent pas ici.
- **Hébergement** : le build ne contient aucune donnée, seulement la coquille de l'app — tout
  arrive de l'API au runtime. Donc le site peut être public sans rien exposer. Ne jamais
  builder de données dans le bundle.
- **Sprites** : `PokeAPI/sprites` sur GitHub (raw), gen 1, versions normale et shiny. Pixel art
  ~96×96 — le rendu doit être `image-rendering: pixelated`, jamais lissé, jamais upscalé en flou.
- Pas de localStorage (ça vit dans le JSON). L'état bonbons dépensés devra y être aussi à terme.
- Doit rester lisible sur mobile, focus clavier visible, `prefers-reduced-motion` respecté.

## Le modèle de données

**Deux fichiers, un seul écrivain chacun.** C'est la règle structurante : l'Action ajoute les
captures, le navigateur enregistre les décisions. S'ils écrivaient le même fichier ils se
marcheraient dessus.

`catches.json` — écrit **uniquement par la GitHub Action**, en append. Jamais modifié.

```json
{
  "sha": "a3f8c21...", "pr": 142, "repo": "moi/atlas",
  "title": "fix: race condition à l'upload de fichiers",
  "date": "2026-02-03", "species": 25, "shiny": false
}
```

`state.json` — écrit **uniquement par le navigateur**.

```json
{
  "claimed": ["a3f8c21...", "b71d0e4..."],
  "spent": { "1": 8, "129": 40 },
  "evolutions": [{ "species": 130, "from": 129, "date": "2026-07-14" }]
}
```

`species` et `shiny` sont **dérivés du SHA** par un hash déterministe, mais **stockés** : si la
logique de tirage change un jour, la collection existante ne doit pas se réécrire. Une PR déjà
capturée reste liée au même Pokémon pour toujours.

L'écriture passe par un PUT qui exige le blob SHA du fichier courant : la concurrence optimiste
est donc gratuite. Un 409 ne peut arriver qu'entre deux de mes propres appareils (j'ouvre un
booster sur le téléphone, le laptop a une version périmée) — dans ce cas : refetch, rejoue,
réécris. Ce n'est pas un cas d'erreur à afficher, c'est un retry silencieux.

## Les règles de jeu (figées, ne pas rediscuter)

| Palier | Espèces | Poids du tirage | Proba par espèce |
|---|---|---|---|
| Commun | 22 | 45 % | 2,05 % |
| Peu commun | 78 | 42 % | 0,54 % |
| Rare | 46 | 12,5 % | 0,27 % |
| Légendaire | 5 | 0,5 % | 0,10 % |

- **Les 151 sont draftables**, formes évoluées comprises. Rien n'est réservé aux bonbons.
- **Rien dans la PR n'influence le tirage.** Ni la taille, ni le type, ni l'heure, ni le repo.
  Une PR est une PR. Seul le SHA entre dans le hash.
- **Shiny : 1/128**, tiré d'un autre segment du hash, indépendant de tout contexte.
- **Bonbons** : 3 par capture, crédités à la famille (Herbizarre → bonbons Bulbizarre).
  Évoluer coûte 8 bonbons (1er palier) et 16 (2e). Magicarpe → Léviator coûte 40, exprès.
- Volume réel attendu : **~300 PR/an**. Courbe simulée : 113/151 après un an, 144 après deux,
  148 après trois. La fin de dex, ce sont les légendaires.

---

## Les quatre états à designer

### 1. Le tiroir (écran d'accueil, 90 % du temps passé)
La grille des 151. Capturés en sprite couleur, non-capturés en silhouette. C'est le hero :
pas de bandeau au-dessus, on ouvre directement dessus. Doit donner envie d'être regardée
alors qu'elle sera vide à 90 % le premier mois et pleine à 95 % dans deux ans — **les deux
extrêmes doivent être beaux**, c'est le vrai exercice.

### 2. La fiche
Au clic sur une case. Le sprite en grand, le palier, et surtout **le journal des captures** :
la ou les PR qui ont donné ce Pokémon, avec titre, date et lien GitHub cliquable.
C'est le cœur émotionnel du produit : le sprite est une madeleine (« ah oui, Magicarpe, c'était
le rename de variables de mars »). La grille est le décor, la fiche est le produit.
La fiche porte aussi la jauge de bonbons et le bouton d'évolution quand l'espèce en a une.

### 3. Le rituel (le morceau de bravoure)
Une PR mergée non encore ouverte attend dans une file. Cliquer « Ouvrir » lance le rituel :
un objet fermé qui porte le titre de la PR → un geste pour l'ouvrir → révélation du Pokémon,
avec une intensité qui monte avec le palier, et un traitement à part pour les shinies.
Puis « Suivant » s'il en reste, sinon retour au tiroir.

**C'est le moment le plus important de l'app** et c'est là que la V1 est la plus faible (un packet
foil correct, sans plus). Il doit être très rewarding, tenir la répétition (~300 fois par an,
donc pas d'animation de 6 secondes qu'on va vouloir skipper au bout d'une semaine), et faire
sentir la différence entre un Rattata de plus et un Sulfura. Une échelle d'intensité en quatre
crans, pas un effet unique. C'est ici qu'il faut dépenser l'audace.

### 4. L'évolution
Déclenchée depuis la fiche quand les bonbons suffisent. Mérite son propre petit moment — c'est
la seule chose de l'app que le joueur *décide*, tout le reste lui tombe dessus. Cas particulier :
Évoli propose un choix entre trois évolutions.

### 5. Pas encore connecté
L'app a besoin d'un PAT pour lire quoi que ce soit. Au premier lancement — et si le token est
révoqué — il n'y a rien à afficher : ni collection, ni silhouettes, rien.

C'est un écran vu deux fois dans une vie et il ne mérite aucune sophistication, mais il ne doit
pas ressembler à une erreur ni à un mur de login SaaS. Il dit quoi coller, où le fabriquer, et
avec quelles permissions exactement (`contents: read/write`, ce repo uniquement, sans expiration).
Un écran de réglages minimal derrière, pour remplacer le token et voir le repo pointé.
Les états d'échec à couvrir : token invalide, token révoqué, repo introuvable. Chacun dit ce qui
s'est passé et comment le réparer — pas « une erreur est survenue ».

---

## Direction actuelle (à challenger)

La V1 pose : **un tiroir de spécimens de muséum indexé comme un repo**. Fond encre froid, cuivre
oxydé et lapis, typo IBM Plex sur trois rôles (serif pour les noms d'espèce, condensed pour les
étiquettes, mono pour tout ce qui est git). Volontairement pas un fan-site Pokémon rouge et bleu.
La signature actuelle : **au survol d'une case, le numéro de catalogue se change en short SHA**.

Cette direction est un point de départ défendable, pas un dogme. Ce qui compte :
- **le pixel art gen 1 doit rester le sujet** — ne pas le noyer sous des effets ;
- la collision catalogue naturaliste / outil de dev est l'idée à garder, sa forme est ouverte ;
- éviter le fan-site officiel Nintendo autant que le dashboard SaaS.

Si vous avez une meilleure direction, proposez-la — mais montrez le tiroir vide ET le tiroir
plein avant qu'on tranche.

## Questions ouvertes (à instruire, pas à trancher seul)

1. **Les bonbons morts.** ~30 espèces n'ont aucune évolution (Ronflex, Kangourex, Métamorph,
   les 5 légendaires…). Leurs doublons produisent des bonbons inutilisables : 51 après un an,
   255 après cinq. Options envisagées, aucune retenue : une monnaie générique type poussière
   étoilée, un mur d'échange, ou simplement afficher les doublons comme une statistique
   assumée sans les convertir. Le problème n'est pas mécanique, il est ressenti : « j'ai encore
   tiré Ronflex » doit rester agréable.
2. **La silhouette.** Le classique gris est efficace mais générique. Y a-t-il un traitement plus
   à nous pour dire « pas encore » sans spoiler le sprite ?
3. **La file d'attente.** Trois PR mergées d'affilée = trois rituels à la suite. Faut-il un mode
   groupé, un enchaînement plus rapide, ou surtout pas ?

Note d'infra, sans impact sur le design : Pages depuis un repo privé demande un plan Pro. Comme
le build ne contient aucune donnée, l'alternative gratuite est de servir la coquille depuis un
repo public et de garder les données dans le repo privé. Les deux marchent, ça ne change rien
à ce qui est demandé ici.

## Livrable attendu

Le `pr-dex.html` retravaillé, fonctionnel, avec les données de démo en place (40 fausses PR dont
3 en attente d'ouverture) pour que tout soit cliquable immédiatement. Plus une note courte sur
les partis pris et ce qui a été écarté.

## Hors périmètre

Comptes, partage, classements, échange, combats, gen 2+, notifications.
Ne pas ajouter de mécanique de jeu non demandée.

**La GitHub Action est hors périmètre mais n'existe pas encore** — elle est écrite en parallèle.
Ne pas supposer que le pipeline tourne : travailler sur les données de démo. Le contrat entre les
deux, c'est `catches.json` tel que décrit plus haut, et rien d'autre.
