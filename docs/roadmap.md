# PR-DEX — feuille de route

État au 24 novembre 2026. Une ligne par lot. Le détail de chaque lot est dans sa spec : ce document
dit seulement **quoi, quand et dans quel ordre**.

## Daté

| date | lot | où en est-il | spec |
|---|---|---|---|
| 1er décembre 2026 | **Arène, saison 1** — duels, saisons, profils, revente | PR #10, en draft | PR #10 |
| 15 décembre 2026 → 6 janvier 2027 | **Édition Noël** — cartes équipe, booster du 25 | PR #33, empilée sur #10 | PR #33 |
| 1er février 2027 (saison 2) | **Socle des exemplaires + fusion + boutique** | arbitré, rien d'implémenté | `spec-fusion-echange.md`, `spec-objets-boutique.md` |
| saison 2, après la fusion | **Échange entre joueurs** | arbitré, rien d'implémenté | `spec-fusion-echange.md` |

### Pourquoi cet ordre

- **La boutique attend une saison de chiffres** : ses prix dérivent du revenu réel d'un joueur, que la
  saison 1 mesure.
- **La fusion sort avec la boutique**, au changement de saison : elle consomme le surplus et fait
  baisser la revente, donc les prix se fixent après l'avoir simulée sur les stocks réels de fin de
  saison 1. Le changement de saison remet les points à zéro : la vague de fusions ne fausse aucun
  classement en cours.
- **L'échange vient après la fusion** : il repose sur le même socle (une table unique des sorties de
  stock et une vue des exemplaires possédés), et la fusion lui donne sa raison d'être.
- **La fusion s'annonce à sa sortie**, pour que la revente mesurée en saison 1 reste fidèle.

### Avant le 1er février

- Simuler la fusion sur les stocks réels de fin de saison 1, puis recalculer revente et prix.
- Écrire la migration de reprise du socle et la rejouer sur une copie de la base.

## Pistes, sans date

Retenues en principe, ni spécifiées ni ordonnées :

- **Des stats ludiques** : le Pokémon préféré (choisi ou calculé), la némésis en duel, la victoire la
  plus improbable, la plus longue série sans rare, un récap annuel. Les stats visibles par les autres
  restent des agrégats : ni titre ni lien de PR ne sort de la base pour un autre joueur.
- **Des events spéciaux génériques**, sur le modèle de l'édition Noël — **deux par an au plus**, Noël
  compris, pour qu'ils restent spéciaux. Le plafond se fait respecter par la base, pas par convention.

Non arbitrées :

- **La forme du jour à l'heure de Paris** : le front la calcule sur la date du navigateur, le serveur
  en heure de Paris (PR #10, « ce qui reste ouvert »).
- **Les notifications Slack** : défi reçu, légendaire retourné, podium de fin de saison.
- **Le nom des saisons.**
- **Le Rappel** (ranimer un exemplaire détruit) : repoussé jusqu'à une saison de chiffres
  (`spec-objets-boutique.md` § 5).
