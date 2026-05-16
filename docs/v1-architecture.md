# Plan V1 robuste

## Objectif produit

La V1 doit transformer le prototype en outil fiable d'aide a la decision. L'utilisateur choisit des criteres, les pondere, applique des filtres d'exclusion, puis visualise sur une carte les territoires qui correspondent le mieux a son projet de residence secondaire.

Le point central de l'architecture est l'extensibilite: un nouveau critere doit pouvoir etre ajoute par configuration, import de donnees et regle d'evaluation, sans migration specifique ni modification du frontend.

## Principes structurants

1. **Separer la donnee brute de l'indicateur**
   - Une source fournit un dataset.
   - Un dataset alimente un ou plusieurs indicateurs.
   - Un indicateur represente une mesure territoriale reutilisable.

2. **Separer l'indicateur du critere utilisateur**
   - Un critere est une interpretation metier visible dans l'interface.
   - Plusieurs criteres peuvent reutiliser le meme indicateur avec des regles differentes.

3. **Rendre les regles declaratives**
   - Les transformations en score sont stockees en JSON.
   - Les types de regles sont limites et testes: `higher_is_better`, `lower_is_better`, `ideal_range`, `steps`, `categorical`, `weighted_composite`.
   - Les scripts avances peuvent importer des definitions JSON/YAML.

4. **Conserver la tracabilite**
   - Chaque valeur garde sa source, son millesime, sa version de dataset et un niveau de confiance.
   - Chaque score garde la version de regle utilisee.

5. **Precalculer ce qui est lourd**
   - Isochrones, distances routieres, agragations culturelles et donnees climatiques sont calculees en batch.
   - La requete utilisateur combine ensuite des scores deja normalises ou facilement recalculables.

## Architecture applicative

```text
Sources publiques / imports utilisateurs
      |
      v
Connecteurs d'ingestion
      |
      v
PostgreSQL + PostGIS
      |
      +--> valeurs d'indicateurs par territoire
      +--> catalogue criteres/regles
      |
      v
Moteur de scoring FastAPI
      |
      v
Frontend React + carte
```

## Sous-systemes V1

### 1. Catalogue de donnees

Le catalogue contient:

- sources: INSEE, DVF, SNCF, OSM, IGN, Georisques, Ministere de la Culture, Meteo-France, RPG, INAO ;
- datasets: millesime, couverture, licence, schema ;
- indicateurs: unite, niveau geographique, methode de calcul ;
- criteres: nom utilisateur, categorie UI, poids par defaut ;
- regles: transformation de valeur en score 0-100.

Le fichier `data/criteria/prototype_catalog.json` sert de premiere version declarative du catalogue.

### 2. Pipeline data

Pipeline recommande pour la V1:

1. telecharger ou importer les donnees ;
2. valider schema, licence et millesime ;
3. projeter en geometries compatibles PostGIS ;
4. agreger au niveau commune ;
5. calculer les indicateurs lourds ;
6. stocker les valeurs dans `indicator_values` ;
7. recalculer les scores selon les regles actives.

### 3. Moteur de scoring

Le moteur doit retourner:

- score global ;
- score par categorie ;
- score par critere ;
- raisons principales ;
- exclusions appliquees ;
- donnees manquantes ou faible confiance.

Les criteres composites, par exemple le potentiel viticole ou le rayonnement culturel, combinent plusieurs indicateurs deja normalises.

### 4. Frontend

Ecrans V1:

- carte principale avec score global ;
- panneau de criteres par categories ;
- sliders de ponderation ;
- filtres d'exclusion ;
- fiche territoire ;
- comparaison de communes ;
- mode avance pour importer ou editer un critere.

### 5. Mode avance

Deux chemins sont prevus:

- UI guidee pour choisir un indicateur, une categorie et une regle de scoring ;
- script `validate_catalog.py` puis import d'un fichier JSON/YAML pour utilisateurs techniques.

Pour la V1, l'execution de code arbitraire utilisateur est exclue. Les regles restent declaratives.

## Criteres V1 prioritaires

### Budget

- prix immobilier median au m2 ;
- volume de transactions ;
- tension du marche.

### Accessibilite

- temps total Paris en train + voiture ;
- temps voiture vers gare la plus proche ;
- temps voiture vers ville de plus de 30 000 habitants ;
- frequence ferroviaire.

### Cadre naturel et climat

- proximite littoral, montagne, foret ;
- temperature moyenne annuelle ;
- temperature moyenne ete/hiver ;
- jours de gel et jours tres chauds ;
- ensoleillement ;
- precipitations.

### Culture et vie locale

- festivals recurrents dans un rayon de 30 km ;
- lieux culturels ;
- monuments historiques ;
- musees, cinemas, theatres ;
- proximite d'un pole culturel.

### Agriculture et terroir

- presence de vignes ;
- zone AOC/AOP viticole ;
- surface agricole ;
- altitude, pente, exposition ;
- climat compatible viticulture.

### Risques

- inondation ;
- retrait-gonflement des argiles ;
- feux de foret ;
- secheresse ;
- sismicite.

## Sources candidates

| Domaine | Sources |
| --- | --- |
| Socio-economie | INSEE, BPE |
| Immobilier | DVF, Etalab |
| Transport | SNCF Open Data, GTFS, OSM, OSRM |
| Culture | Ministere de la Culture, OpenAgenda, Wikidata |
| Agriculture | RPG, INAO, Corine Land Cover |
| Climat | Meteo-France, Copernicus, Open-Meteo pour prototype |
| Risques | Georisques |
| Geographie | IGN Admin Express, BD Alti |

## Unite geographique

La V1 conserve la commune comme unite principale pour rester explicable et compatible avec les sources INSEE/DVF. Le schema prevoit cependant `territories.type` pour ajouter plus tard EPCI, departements ou carreaux de grille.

## Definition d'une regle

Exemple:

```json
{
  "type": "ideal_range",
  "indicator": "temperature_moyenne_annuelle",
  "min_ideal": 12,
  "max_ideal": 17,
  "min_acceptable": 7,
  "max_acceptable": 22
}
```

## Definition de pret pour prototype

Le prototype est pret quand:

- le catalogue declare les criteres prioritaires ;
- le moteur de scoring calcule des scores 0-100 ;
- l'interface expose les poids par criteres ;
- la base PostGIS est modelisee ;
- les scripts valident les nouveaux criteres ;
- les donnees peuvent etre remplacees par des sources reelles sans changer l'UI.
