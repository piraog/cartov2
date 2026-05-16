import { Database, FlaskConical, Map, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

type Criterion = {
  key: string;
  name: string;
  category: string;
  defaultWeight: number;
};

type Territory = {
  code: string;
  name: string;
  summary: string;
  latitude: number;
  longitude: number;
  scores: Record<string, number>;
};

const criteria: Criterion[] = [
  { key: "budget_immobilier", name: "Budget immobilier", category: "Budget", defaultWeight: 1 },
  { key: "accessibilite_paris", name: "Isochrone train Paris", category: "Accessibilite", defaultWeight: 1 },
  { key: "acces_gare", name: "Acces a une gare", category: "Accessibilite", defaultWeight: 0.8 },
  {
    key: "proximite_ville_moyenne",
    name: "Ville > 30 000 habitants",
    category: "Accessibilite",
    defaultWeight: 0.7,
  },
  { key: "densite_equilibree", name: "Densite equilibree", category: "Cadre de vie", defaultWeight: 0.5 },
  {
    key: "residences_secondaires",
    name: "Residences secondaires",
    category: "Cadre de vie",
    defaultWeight: 0.4,
  },
  { key: "nature", name: "Proximite nature", category: "Nature", defaultWeight: 0.8 },
  { key: "risque_inondation", name: "Risque inondation", category: "Risques", defaultWeight: 0.9 },
  { key: "services", name: "Services et equipements", category: "Services", defaultWeight: 0.7 },
  { key: "rayonnement_culturel", name: "Rayonnement culturel", category: "Culture", defaultWeight: 0.7 },
  { key: "potentiel_viticole", name: "Potentiel viticole", category: "Agriculture", defaultWeight: 0.6 },
  { key: "climat_confortable", name: "Climat confortable", category: "Climat", defaultWeight: 0.7 },
];

const territories: Territory[] = [
  {
    code: "30202",
    name: "Uzes",
    summary: "Culture, terroir viticole et accessibilite correcte depuis le couloir rhodanien.",
    latitude: 44.01,
    longitude: 4.42,
    scores: {
      budget_immobilier: 55,
      accessibilite_paris: 52,
      acces_gare: 55,
      proximite_ville_moyenne: 100,
      densite_equilibree: 91,
      residences_secondaires: 23,
      nature: 78,
      risque_inondation: 45,
      services: 70,
      rayonnement_culturel: 73,
      potentiel_viticole: 79,
      climat_confortable: 86,
    },
  },
  {
    code: "21231",
    name: "Dijon",
    summary: "Excellente connexion train, services denses, mais profil urbain plus marque.",
    latitude: 47.32,
    longitude: 5.04,
    scores: {
      budget_immobilier: 64,
      accessibilite_paris: 85,
      acces_gare: 100,
      proximite_ville_moyenne: 0,
      densite_equilibree: 0,
      residences_secondaires: 2,
      nature: 62,
      risque_inondation: 85,
      services: 100,
      rayonnement_culturel: 89,
      potentiel_viticole: 61,
      climat_confortable: 59,
    },
  },
  {
    code: "64122",
    name: "Cambo-les-Bains",
    summary: "Cadre naturel fort et climat agreable, avec un temps Paris plus long.",
    latitude: 43.36,
    longitude: -1.4,
    scores: {
      budget_immobilier: 42,
      accessibilite_paris: 10,
      acces_gare: 80,
      proximite_ville_moyenne: 100,
      densite_equilibree: 88,
      residences_secondaires: 21,
      nature: 92,
      risque_inondation: 45,
      services: 83,
      rayonnement_culturel: 74,
      potentiel_viticole: 45,
      climat_confortable: 73,
    },
  },
];

export function App() {
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(criteria.map((criterion) => [criterion.key, criterion.defaultWeight])),
  );
  const [selectedCode, setSelectedCode] = useState(territories[0].code);

  const rankedTerritories = useMemo(
    () =>
      territories
        .map((territory) => ({
          ...territory,
          globalScore: computeGlobalScore(territory, weights),
        }))
        .sort((a, b) => b.globalScore - a.globalScore),
    [weights],
  );

  const selectedTerritory = rankedTerritories.find((territory) => territory.code === selectedCode) ?? rankedTerritories[0];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Map size={22} />
          </div>
          <div>
            <p className="eyebrow">Prototype V1</p>
            <h1>Carto Residence</h1>
          </div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <h2>Criteres ponderables</h2>
          </div>
          <div className="criteria-list">
            {criteria.map((criterion) => (
              <label className="criterion" key={criterion.key}>
                <span>
                  <strong>{criterion.name}</strong>
                  <small>{criterion.category}</small>
                </span>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={weights[criterion.key]}
                  onChange={(event) =>
                    setWeights((current) => ({
                      ...current,
                      [criterion.key]: Number(event.target.value),
                    }))
                  }
                />
                <em>{weights[criterion.key].toFixed(1)}</em>
              </label>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">Decision multi-criteres</p>
            <h2>Identifier des territoires pour une residence secondaire</h2>
            <p>
              Cette premiere implementation pose le socle: catalogue declaratif, scoring extensible, modele PostGIS et UI
              de ponderation. Les donnees ci-dessous sont des echantillons de demonstration.
            </p>
          </div>
          <div className="hero-cards">
            <InfoCard icon={<Database size={18} />} value="20" label="indicateurs declares" />
            <InfoCard icon={<FlaskConical size={18} />} value="6" label="types de regles" />
          </div>
        </header>

        <div className="content-grid">
          <section className="map-panel">
            <div className="map-header">
              <div>
                <p className="eyebrow">Carte de score</p>
                <h3>Communes candidates</h3>
              </div>
              <span className="legend">
                <i /> Score global pondere
              </span>
            </div>
            <div className="map-placeholder">
              {rankedTerritories.map((territory) => (
                <button
                  className="territory-marker"
                  key={territory.code}
                  style={{
                    left: `${toMapX(territory.longitude)}%`,
                    top: `${toMapY(territory.latitude)}%`,
                    backgroundColor: scoreColor(territory.globalScore),
                  }}
                  onClick={() => setSelectedCode(territory.code)}
                >
                  <strong>{Math.round(territory.globalScore)}</strong>
                  <span>{territory.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="detail-panel">
            <p className="eyebrow">Fiche territoire</p>
            <h3>{selectedTerritory.name}</h3>
            <div className="score-ring">{Math.round(selectedTerritory.globalScore)}</div>
            <p>{selectedTerritory.summary}</p>
            <div className="rank-list">
              {criteria
                .map((criterion) => ({
                  ...criterion,
                  score: selectedTerritory.scores[criterion.key],
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 6)
                .map((criterion) => (
                  <div className="rank-row" key={criterion.key}>
                    <span>{criterion.name}</span>
                    <strong>{criterion.score}</strong>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="info-card">
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function computeGlobalScore(territory: Territory, weights: Record<string, number>) {
  let weightedScore = 0;
  let totalWeight = 0;
  for (const criterion of criteria) {
    const weight = weights[criterion.key] ?? criterion.defaultWeight;
    weightedScore += territory.scores[criterion.key] * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weightedScore / totalWeight;
}

function toMapX(longitude: number) {
  return ((longitude + 5.5) / 15.5) * 100;
}

function toMapY(latitude: number) {
  return ((51.5 - latitude) / 10) * 100;
}

function scoreColor(score: number) {
  if (score >= 75) {
    return "#15803d";
  }
  if (score >= 55) {
    return "#ca8a04";
  }
  return "#dc2626";
}
