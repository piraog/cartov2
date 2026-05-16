# Carto Residence

Prototype d'aide a la decision cartographique pour identifier des lieux d'implantation de residence secondaire en France selon une approche multi-criteres.

Le projet est structure pour permettre l'ajout progressif de nouvelles sources de donnees, de nouveaux indicateurs et de nouvelles regles de transformation en score sans recoder le coeur applicatif.

## Architecture cible V1

```text
apps/web              Interface React cartographique et panneau de criteres
services/api          API FastAPI et moteur de scoring
data/criteria         Catalogue declaratif des sources, indicateurs, criteres et regles
db/migrations         Modele PostgreSQL/PostGIS
docs                  Cadrage V1 et conventions d'extension
scripts               Outils de validation/import pour utilisateurs avances
tests                 Tests du moteur de scoring
```

## Demarrage local

### Interface web

```bash
npm install
npm run dev --workspace apps/web
```

### API

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e services/api
uvicorn app.main:app --reload --app-dir services/api
```

### Validation du catalogue et tests

```bash
python3 scripts/validate_catalog.py data/criteria/prototype_catalog.json
python3 -m unittest discover -s tests
```

## Criteres presents dans le prototype

- prix immobilier median ;
- temps total Paris en train + voiture ;
- temps voiture vers la gare la plus proche ;
- temps voiture vers la ville de plus de 30 000 habitants la plus proche ;
- densite de population ;
- part de residences secondaires ;
- proximite mer / montagne / foret ;
- risque inondation ;
- equipements de services ;
- rayonnement culturel et festivals ;
- potentiel agricole / viticole ;
- climat et temperatures moyennes.

Voir `docs/v1-architecture.md` pour le plan V1 robuste.

## Tester depuis un telephone

Le prototype web peut etre publie sans serveur via GitHub Pages. Voir `docs/mobile-testing.md`.