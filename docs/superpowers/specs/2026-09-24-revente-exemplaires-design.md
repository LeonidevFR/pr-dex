# Revente des exemplaires en trop — design

## Le problème

Un tirage donne **3 bonbons ET un exemplaire**, indépendamment. Les bonbons sont encaissés au
tirage : garder ou non l'exemplaire n'y change rien. Une évolution ne consomme qu'**un**
exemplaire, pas la pile. Le surplus est donc du poids mort — et il s'accumule : quinze Nidoran
dont on ne sait rien faire.

L'arène ne résout pas ce problème. Engager quinze exemplaires l'un après l'autre n'est pas un
usage, c'est une corvée : un puits qui demande quinze actions pour absorber quinze doublons ne
vaut rien.

## Ce qu'on construit

La revente d'un exemplaire contre des pokédollars, **à la maison** — prix fixe, calculé, pas de
négociation. Vendable par lot, pour que douze Nidoran partent en un geste.

**Hors périmètre, délibérément : la place de marché entre joueurs.** Elle répond à un autre
besoin (« je veux le Pokémon de quelqu'un d'autre ») et ne tient pas à six joueurs — un marché
sans volume est soit vide, soit un canal de services entre collègues où le prix ne veut plus
rien dire. À reconsidérer si l'usage le réclame.

## Le prix

```
prix = base(palier) × (1 + (niveau − 1) / 6) × (shiny ? 4 : 1)
```

La base est **2 % du prix du pli du même palier** : elle ancre la revente sur la boutique au
lieu de la laisser flotter à côté.

| palier | pli | niv. 1 | niv. 3 | niv. 5 | niv. 10 | victoire en duel |
|---|---|---|---|---|---|---|
| commun | 250 $ | 5 $ | 7 $ | 8 $ | 13 $ | 50 $ |
| peu commun | 500 $ | 10 $ | 13 $ | 17 $ | 25 $ | 100 $ |
| rare | 1200 $ | 25 $ | 33 $ | 42 $ | 63 $ | 250 $ |
| légendaire | 4500 $ | 90 $ | 120 $ | 150 $ | 225 $ | 600 $ |

Le niveau plafonne à 10 (`LEVEL_MAX`), donc le prix aussi : ×2,5 au maximum.

### Les trois invariants, chacun testable

1. **Jouer rapporte bien plus que vendre.** Un exemplaire au niveau maximum vaut le quart du
   gain d'une victoire de son palier (13/50, 25/100, 63/250). La revente est la sortie de secours
   du surplus, jamais une stratégie de revenu.
2. **Racheter ne rembourse jamais le pli.** Il faut revendre **vingt exemplaires** d'un palier,
   au niveau maximum, pour racheter un seul pli de ce palier. Énoncé en pourcentage, l'invariant se
   briserait sur l'arrondi de la base rare (50 $ au lieu des 48 $ exacts) ; énoncé en nombre de
   cartes, il dit la même chose sans dépendre d'un arrondi — et il dit ce qui compte à qui
   voudrait grinder. La boucle est fermée par construction, quel que soit le débit de PR.
3. **Le palier prime sur le niveau.** Un Nidoran niveau 3 vaut 7 $ contre 25 $ pour un rare
   neuf. Seule bavure assumée : un commun niveau 10 (13 $) dépasse de 3 $ un peu commun neuf
   (10 $) — dix victoires valent bien 3 $.

Le facteur shiny (×4) est arbitraire et se règle seul ; un shiny n'est jamais présélectionné à
la vente.

### Le calibrage, mesuré sur la production

Mesuré le 25 septembre 2026 sur un export réel : **24 captures par joueur et par semaine**
(9 joueurs actifs), **49 % du stock en doublons**, prix moyen d'un exemplaire en trop **7,7 $**.

La revente rapporte donc **~790 $ par saison de deux mois**, soit **26 % du revenu d'arène**
(`SEASON_INCOME` = 3 000 $).

La première grille — base à 4 % — donnait 1 570 $, soit 52 %. C'était trop, et l'asymétrie était
le vrai problème : le revenu d'arène est **plafonné par les crédits**, un par jour ouvré, tandis
que la revente suit le **volume de PR**, qui n'a pas de plafond et grandit avec l'équipe. Un
joueur qui merge beaucoup et joue peu aurait gagné davantage en vendant qu'en se battant —
exactement l'inverse de ce que la boutique doit récompenser.

Le réglage tient dans une seule constante, `SALE_BASE`, et se recalibre de la même façon : un
export, deux requêtes, le rapport au `SEASON_INCOME`.

**À la mise en service**, chacun liquidera d'un coup ses doublons accumulés : environ 1 500 $
pour le joueur le plus avancé, rien pour le dernier arrivé. C'est un moment de lancement, et il
récompense ceux qui ont le plus travaillé.

## Données

Tout vit dans une migration à part, `20260924000000_revente.sql` : l'arène et les évolutions ont
déjà passé la répétition générale sur une copie de la production comme un bloc, et la revente doit
pouvoir se relire — et se retirer — seule.

`arena_exemplars` porte déjà `destroyed_at`. On ajoute :

```sql
alter table public.arena_exemplars
  add column sold_at timestamptz,
  add column sold_price int check (sold_price is null or sold_price >= 0);
```

Plus une contrainte : un exemplaire ne peut pas être à la fois détruit et vendu. Ce sont deux
sorties exclusives, et la base doit le dire plutôt que de s'en remettre à l'ordre des contrôles
applicatifs.

Une vente et une destruction sont deux façons de quitter le stock : même ligne, pas deux
mécaniques parallèles qui finiraient par diverger. Le prix est consigné parce qu'il dépend du
niveau au jour de la vente — sans lui l'historique n'est pas relisible.

Un exemplaire jamais passé par l'arène n'a pas de ligne : la vente en crée une (`upsert` sur la
clé primaire `(user_id, entry_key)`).

## La RPC

`dex_sell(p_keys text[]) returns table (sold int, total int, balance int)`, `security definer`.

Le prix est **calculé par le serveur**, jamais reçu du client — sinon le prix est un champ de
formulaire.

Elle verrouille les lignes visées (`for update`) avant toute lecture, comme `arena_accept` :
deux onglets qui vendent le même Nidoran ne doivent pas l'encaisser deux fois.

Refus nommés, en français, dans le style des autres RPC du lot :

- `dex : on ne vend pas son dernier exemplaire d'une espèce.`
- `dex : cet exemplaire est engagé dans un défi ouvert.`
- `dex : cet exemplaire a déjà quitté ta collection.`
- `dex : cet exemplaire a servi à une évolution.`

Un lot est atomique : un seul refus annule la vente entière.

## Parité JS ↔ SQL

La formule vit deux fois — en SQL pour débiter, en JS pour afficher le prix avant de cliquer —
avec un test de parité qui les aligne, comme `fnv1a`, les saisons et la résolution des duels.
`shared/arena-economy.js` porte `salePrice(tier, level, shiny)` ; le SQL porte
`public.dex_sale_price(species int, level int, shiny boolean)`.

## Ce que la vente ne touche pas

- **Les bonbons.** Ils sont encaissés au tirage et se recalculent depuis les lignes `catches`.
  Une vente qui supprimerait la capture retirerait 3 bonbons rétroactivement — peut-être déjà
  dépensés, donc solde négatif. La ligne `catches` reste intacte.
- **L'espèce au Pokédex.** Acquise pour toujours, même sans exemplaire en stock.
- **Les points de saison.** Zéro : le classement reste le produit des seuls duels.

## Interface

**Une section « Revente » dans `/shop`** : la sortie juste à côté de l'entrée — on vend douze
Nidoran, on voit immédiatement ce que ça achète.

Le surplus est **groupé par espèce**, pas listé exemplaire par exemplaire : « Nidoran ♂ × 12 en
trop · 120 $ », avec un dépliant pour choisir à la main. Un total qui court, une confirmation,
c'est fait.

La sélection par défaut est la réponse au problème en un geste : **tout le surplus, moins un
exemplaire par espèce**, en **excluant d'office les shinies et les exemplaires de niveau ≥ 5** —
ce sont des investissements, pas du déchet.

**Et un « Vendre » sur chaque ligne de la fiche d'espèce**, pour larguer un exemplaire précis
quand on est déjà en train de le regarder.

## Intégration front

`useDex` reçoit aujourd'hui un ensemble de clés — les exemplaires perdus à l'arène — et
`availableEntries` filtre dessus. Cet ensemble devient « les exemplaires **partis** », quelle
qu'en soit la raison. Tout en hérite d'un coup : la planche, le compteur ×N, la fiche d'espèce,
le profil, et ce qui est engageable à l'arène.

Le profil garde deux compteurs distincts : « Perdus à l'arène » (destruction) et « Revendus »
(vente, avec le total encaissé). Les confondre effacerait la différence entre une défaite et une
décision.

## Démo

Tout rejouable sans backend, y compris les refus — contrainte transverse du projet depuis le
début.

## Le calendrier

La saison 1 ouvre le **1er décembre 2026** et court jusqu'au **31 janvier 2027**. Le découpage des
saisons a été décalé d'un mois pour cela (`déc-janv, févr-mars, avril-mai…`) : calé sur les mois
impairs, il n'offrait plus, après le report du lancement, qu'un départ au 1er novembre — en
pleines vacances — ou au 1er janvier.

La revente part donc avec l'arène, dans un seul déploiement fin novembre, plutôt que d'ajouter du
SQL en production une seconde fois.

**Ordre de déploiement :** `20260811000000_arena.sql`, `20260814000000_evolutions.sql`,
`20260924000000_revente.sql`, puis `supabase/seed.sql`.
