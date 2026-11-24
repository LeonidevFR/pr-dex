# PR-DEX — feuille de route

État au 24 novembre 2026. Une ligne par lot. Le détail de chaque lot est dans sa spec : ce document
dit seulement **quoi, quand et dans quel ordre**.

## Daté

| date | lot | où en est-il | spec |
|---|---|---|---|
| 1er décembre 2026 | **Arène, saison 1** — duels et leur historique, saisons, profils, boutique de plis (Gen 1), revente | PR #10, à merger **avant** le 1er (SQL d'abord) : l'arène s'ouvre seule le 1er à minuit, heure de Paris, verrouillée en base jusque-là | PR #10 |
| 15 décembre 2026 → 6 janvier 2027 | **Édition Noël** — cartes équipe, booster du 25 | PR #33, empilée sur #10 | PR #33 |
| 1er février 2027 (saison 2) | **Socle des exemplaires + fusion + objets de la boutique** | arbitré, rien d'implémenté | `spec-fusion-echange.md`, `spec-objets-boutique.md` |
| 1er février 2027 (saison 2) | **Gen 2** — tirée par les PR et vendue en boutique, son étagère, ses 6 succès | PR #38, brouillon empilé sur #33 | PR #38 |
| saison 2, après la fusion | **Échange entre joueurs** | arbitré, rien d'implémenté | `spec-fusion-echange.md` |

### Pourquoi cet ordre

- **Les objets de la boutique attendent une saison de chiffres** (Potions, Super Bonbon, Œuf Chance,
  pierres ; la boutique de plis, elle, ouvre avec l'arène) : leurs prix dérivent du revenu réel d'un
  joueur, que la saison 1 mesure.
- **La fusion sort avec les objets**, au changement de saison : elle consomme le surplus et fait
  baisser la revente, donc les prix se fixent après l'avoir simulée sur les stocks réels de fin de
  saison 1. Le changement de saison remet les points à zéro : la vague de fusions ne fausse aucun
  classement en cours.
- **L'échange vient après la fusion** : il repose sur le même socle (une table unique des sorties de
  stock et une vue des exemplaires possédés), et la fusion lui donne sa raison d'être.
- **La fusion s'annonce à sa sortie**, pour que la revente mesurée en saison 1 reste fidèle.
- **La Gen 2 arrive d'un bloc en saison 2**, en boutique et au tirage des PR à la fois. Vendue seule
  en saison 1, elle aurait été payée par ceux qui la recevraient ensuite sans payer. Ses prix et la
  revente de ses doublons se fixent avec ceux de la fusion, sur les chiffres de fin de saison 1, et
  la fusion doit couvrir ses familles (`species_evo`).

### Avant le 1er février

- Simuler la fusion sur les stocks réels de fin de saison 1, Gen 2 comprise, puis recalculer revente et prix.
- Écrire la migration de reprise du socle et la rejouer sur une copie de la base.

## Pistes, sans date

Retenues en principe, ni spécifiées ni ordonnées :

- **Des stats ludiques** : le Pokémon préféré (choisi ou calculé), la némésis en duel, la victoire la
  plus improbable, la plus longue série sans rare, un récap annuel. Les stats visibles par les autres
  restent des agrégats : ni titre ni lien de PR ne sort de la base pour un autre joueur.
- **Des events spéciaux génériques**, sur le modèle de l'édition Noël — **deux par an au plus**, Noël
  compris, pour qu'ils restent spéciaux. Le plafond se fait respecter par la base, pas par convention.

Non arbitrées :

- **Les notifications Slack** : défi reçu, légendaire retourné, podium de fin de saison.
- **Le nom des saisons.**
- **Le Rappel** (ranimer un exemplaire détruit) : repoussé jusqu'à une saison de chiffres
  (`spec-objets-boutique.md` § 5).
