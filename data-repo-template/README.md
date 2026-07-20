# Gabarit du repo de données

Ce dossier n'est **pas** utilisé par l'application. Il contient ce qu'il faut copier dans
le repo de données privé, celui qui contient `data/` et fait tourner l'Action.

`catch.yml` est délibérément rangé ici plutôt que dans `.github/workflows/` : GitHub
planifie tout workflow présent sous ce chemin sur la branche par défaut. Laissé dans le
repo de l'application, il s'exécuterait toutes les 30 minutes sans jeton ni variables et
échouerait à chaque passage.

## Contenu à copier dans le repo de données

```
data-repo-template/catch.yml  →  .github/workflows/catch.yml
scripts/catch.mjs             →  scripts/catch.mjs
shared/                       →  shared/
```

`shared/` est nécessaire : `catch.mjs` importe `drawFromSha` depuis `shared/draw.js`, qui
lui-même importe la table des espèces. C'est le même module que celui utilisé par le front
— l'Action et le navigateur doivent tirer le même Pokémon pour un SHA donné, sans quoi le
contrat de données se brise.

## Réglages à poser dans le repo de données

**Settings → Secrets and variables → Actions**

| | Nom | Valeur |
|---|---|---|
| Secret | `CATCH_TOKEN` | PAT fine-grained, owner = l'organisation surveillée, `Pull requests: Read` |
| Variable | `WATCH_USER` | le login GitHub dont on capture les PR |
| Variable | `WATCH_REPOS` | liste séparée par des virgules, ex. `orga/api,orga/front` |
| Variable | `BOOTSTRAP_SINCE` | optionnelle, `AAAA-MM-JJ`, défaut `2026-01-01` |

Le push des captures utilise le `GITHUB_TOKEN` fourni automatiquement par
`actions/checkout`, adossé au `permissions: contents: write` du workflow. Rien à créer
pour l'écriture.

Voir le `README.md` à la racine pour le détail des portées de jetons.
