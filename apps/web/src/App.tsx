import "maplibre-gl/dist/maplibre-gl.css";

import { Database, FlaskConical, Info, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import catalog from "../../../data/criteria/prototype_catalog.json";

type Indicator = {
  key: string;
  name: string;
  unit: string;
  source: string;
};

type Source = {
  key: string;
  name: string;
  provider: string;
};

type Rule = {
  type: string;
  indicator?: string;
  min_value?: number;
  max_value?: number;
  clamp?: boolean;
  min_ideal?: number;
  max_ideal?: number;
  min_acceptable?: number;
  max_acceptable?: number;
  steps?: Array<{ max?: number; score: number }>;
  mapping?: Record<string, number>;
  exclude_if?: string[];
  components?: Array<{
    indicator: string;
    weight: number;
    rule: Rule;
  }>;
};

type Criterion = {
  key: string;
  name: string;
  category: string;
  description: string;
  default_weight: number;
  rule: Rule;
};

type TerritorySample = {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  summary: string;
  values: Record<string, string | number>;
};

type ScoreResult = {
  score: number | null;
  indicator?: string;
  value?: string | number | null;
  missing: boolean;
  excluded: boolean;
  children?: ScoreResult[];
};

type TerritoryScore = TerritorySample & {
  globalScore: number;
  categoryScores: Record<string, number>;
  criterionScores: Array<{
    criterion: Criterion;
    score: number | null;
    weight: number;
    missing: boolean;
    excluded: boolean;
    result: ScoreResult;
  }>;
};

const criteria = catalog.criteria as Criterion[];
const indicators = catalog.indicators as Indicator[];
const sources = catalog.sources as Source[];
const territories = catalog.sample_territories as TerritorySample[];

const indicatorByKey = new Map(indicators.map((indicator) => [indicator.key, indicator]));
const sourceByKey = new Map(sources.map((source) => [source.key, source]));

export function App() {
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(criteria.map((criterion) => [criterion.key, criterion.default_weight])),
  );
  const [selectedCode, setSelectedCode] = useState(territories[0].code);

  const rankedTerritories = useMemo(
    () =>
      territories
        .map((territory) => scoreTerritory(territory, weights))
        .sort((a, b) => b.globalScore - a.globalScore),
    [weights],
  );

  const selectedTerritory = rankedTerritories.find((territory) => territory.code === selectedCode) ?? rankedTerritories[0];
  const topCriteria = [...selectedTerritory.criterionScores]
    .filter((criterionScore) => criterionScore.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 7);
  const selectedDetails = selectedTerritory.criterionScores.find(
    (criterionScore) => criterionScore.criterion.key === topCriteria[0]?.criterion.key,
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <MapIcon size={22} />
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
                <em>poids {weights[criterion.key].toFixed(1)}</em>
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
              Les scores affiches sont calcules dans le navigateur a partir du catalogue JSON: indicateurs, sources et
              regles de transformation sont les memes objets que ceux prevus pour l'API.
            </p>
          </div>
          <div className="hero-cards">
            <InfoCard icon={<Database size={18} />} value={String(indicators.length)} label="indicateurs" />
            <InfoCard icon={<FlaskConical size={18} />} value={String(criteria.length)} label="criteres calcules" />
          </div>
        </header>

        <div className="content-grid">
          <section className="map-panel">
            <div className="map-header">
              <div>
                <p className="eyebrow">Carte interactive</p>
                <h3>Communes candidates</h3>
              </div>
              <span className="legend">
                <i /> Score global
              </span>
            </div>
            <CandidateMap
              territories={rankedTerritories}
              selectedCode={selectedTerritory.code}
              onSelect={setSelectedCode}
            />
          </section>

          <section className="detail-panel">
            <p className="eyebrow">Fiche territoire</p>
            <h3>{selectedTerritory.name}</h3>
            <div className="score-summary">
              <div className="score-ring">{Math.round(selectedTerritory.globalScore)}</div>
              <div>
                <strong>Score pondere</strong>
                <span>Calcule sur {selectedTerritory.criterionScores.length} criteres actifs</span>
              </div>
            </div>
            <p>{selectedTerritory.summary}</p>

            <div className="rank-list">
              {topCriteria.map((criterionScore) => (
                <button
                  className="rank-row"
                  key={criterionScore.criterion.key}
                  onClick={() => scrollToCriterion(criterionScore.criterion.key)}
                >
                  <span>{criterionScore.criterion.name}</span>
                  <strong>{Math.round(criterionScore.score ?? 0)}</strong>
                </button>
              ))}
            </div>

            {selectedDetails ? <CriterionExplanation score={selectedDetails} values={selectedTerritory.values} /> : null}
          </section>
        </div>

        <section className="criteria-table">
          <div className="panel-title">
            <Info size={18} />
            <h2>Transparence des criteres</h2>
          </div>
          <div className="criterion-cards">
            {selectedTerritory.criterionScores.map((criterionScore) => (
              <article className="criterion-card" id={`criterion-${criterionScore.criterion.key}`} key={criterionScore.criterion.key}>
                <div>
                  <p className="eyebrow">{criterionScore.criterion.category}</p>
                  <h3>{criterionScore.criterion.name}</h3>
                  <p>{criterionScore.criterion.description}</p>
                </div>
                <strong>{criterionScore.score === null ? "n/a" : Math.round(criterionScore.score)}</strong>
                <ul>
                  {extractIndicators(criterionScore.result).map((indicatorKey) => (
                    <li key={indicatorKey}>
                      <span>{indicatorByKey.get(indicatorKey)?.name ?? indicatorKey}</span>
                      <em>
                        {formatValue(selectedTerritory.values[indicatorKey], indicatorByKey.get(indicatorKey)?.unit)}
                        {" - "}
                        {sourceName(indicatorKey)}
                      </em>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function CandidateMap({
  territories,
  selectedCode,
  onSelect,
}: {
  territories: TerritoryScore[];
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);

  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
        ],
      },
      center: [2.35, 46.6],
      zoom: 4.6,
      attributionControl: false,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }));

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = territories.map((territory) => {
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = `map-marker ${territory.code === selectedCode ? "is-selected" : ""}`;
      markerElement.style.backgroundColor = scoreColor(territory.globalScore);
      markerElement.innerHTML = `<strong>${Math.round(territory.globalScore)}</strong><span>${territory.name}</span>`;
      markerElement.addEventListener("click", () => onSelectRef.current(territory.code));

      return new maplibregl.Marker({ element: markerElement, anchor: "bottom" })
        .setLngLat([territory.longitude, territory.latitude])
        .addTo(map);
    });
  }, [territories, selectedCode]);

  useEffect(() => {
    const selected = territories.find((territory) => territory.code === selectedCode);
    if (selected) {
      mapRef.current?.easeTo({
        center: [selected.longitude, selected.latitude],
        zoom: window.innerWidth < 720 ? 6 : 5.6,
        duration: 450,
      });
    }
  }, [selectedCode, territories]);

  return <div className="map-container" ref={containerRef} />;
}

function CriterionExplanation({ score, values }: { score: TerritoryScore["criterionScores"][number]; values: TerritorySample["values"] }) {
  const indicatorKeys = extractIndicators(score.result);

  return (
    <div className="explanation-card">
      <p className="eyebrow">Calcul du meilleur critere</p>
      <h4>{score.criterion.name}</h4>
      <p>{score.criterion.description}</p>
      <ul>
        {indicatorKeys.map((indicatorKey) => (
          <li key={indicatorKey}>
            <span>{indicatorByKey.get(indicatorKey)?.name ?? indicatorKey}</span>
            <strong>{formatValue(values[indicatorKey], indicatorByKey.get(indicatorKey)?.unit)}</strong>
          </li>
        ))}
      </ul>
    </div>
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

function scoreTerritory(territory: TerritorySample, weights: Record<string, number>): TerritoryScore {
  const criterionScores = criteria.map((criterion) => {
    const result = scoreRule(criterion.rule, territory.values);
    return {
      criterion,
      score: result.score,
      weight: weights[criterion.key] ?? criterion.default_weight,
      missing: result.missing,
      excluded: result.excluded,
      result,
    };
  });

  let weightedTotal = 0;
  let totalWeight = 0;
  const categoryTotals = new Map<string, number>();
  const categoryWeights = new Map<string, number>();

  for (const criterionScore of criterionScores) {
    if (criterionScore.score === null || criterionScore.weight <= 0) {
      continue;
    }
    weightedTotal += criterionScore.score * criterionScore.weight;
    totalWeight += criterionScore.weight;
    categoryTotals.set(
      criterionScore.criterion.category,
      (categoryTotals.get(criterionScore.criterion.category) ?? 0) + criterionScore.score * criterionScore.weight,
    );
    categoryWeights.set(
      criterionScore.criterion.category,
      (categoryWeights.get(criterionScore.criterion.category) ?? 0) + criterionScore.weight,
    );
  }

  const categoryScores = Object.fromEntries(
    [...categoryTotals.entries()].map(([category, score]) => [
      category,
      round(score / (categoryWeights.get(category) ?? 1)),
    ]),
  );

  return {
    ...territory,
    globalScore: totalWeight === 0 ? 0 : round(weightedTotal / totalWeight),
    categoryScores,
    criterionScores,
  };
}

function scoreRule(rule: Rule, values: TerritorySample["values"]): ScoreResult {
  if (rule.type === "higher_is_better" || rule.type === "lower_is_better") {
    const indicator = requireRuleField(rule.indicator, rule.type, "indicator");
    const minValue = requireRuleField(rule.min_value, rule.type, "min_value");
    const maxValue = requireRuleField(rule.max_value, rule.type, "max_value");
    const value = numberValue(values[indicator]);
    if (value === null) {
      return missing(indicator);
    }
    const ratio =
      rule.type === "higher_is_better"
        ? (value - minValue) / (maxValue - minValue)
        : (maxValue - value) / (maxValue - minValue);
    const score = (rule.clamp ?? true) ? clamp(ratio * 100) : ratio * 100;
    return scored(score, indicator, value);
  }

  if (rule.type === "ideal_range") {
    const indicator = requireRuleField(rule.indicator, rule.type, "indicator");
    const minIdeal = requireRuleField(rule.min_ideal, rule.type, "min_ideal");
    const maxIdeal = requireRuleField(rule.max_ideal, rule.type, "max_ideal");
    const minAcceptable = requireRuleField(rule.min_acceptable, rule.type, "min_acceptable");
    const maxAcceptable = requireRuleField(rule.max_acceptable, rule.type, "max_acceptable");
    const value = numberValue(values[indicator]);
    if (value === null) {
      return missing(indicator);
    }
    if (value >= minIdeal && value <= maxIdeal) {
      return scored(100, indicator, value);
    }
    const score =
      value < minIdeal
        ? ((value - minAcceptable) / (minIdeal - minAcceptable)) * 100
        : ((maxAcceptable - value) / (maxAcceptable - maxIdeal)) * 100;
    return scored(clamp(score), indicator, value);
  }

  if (rule.type === "steps") {
    const indicator = requireRuleField(rule.indicator, rule.type, "indicator");
    const steps = requireRuleField(rule.steps, rule.type, "steps");
    const value = numberValue(values[indicator]);
    if (value === null) {
      return missing(indicator);
    }
    const step = steps.find((candidate) => candidate.max === undefined || value <= candidate.max);
    return scored(step?.score ?? 0, indicator, value);
  }

  if (rule.type === "categorical") {
    const indicator = requireRuleField(rule.indicator, rule.type, "indicator");
    const mapping = requireRuleField(rule.mapping, rule.type, "mapping");
    const rawValue = values[indicator];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return missing(indicator);
    }
    const valueKey = String(rawValue).toLowerCase();
    const excluded = (rule.exclude_if ?? []).map((value) => value.toLowerCase()).includes(valueKey);
    return {
      ...scored(clamp(mapping[valueKey] ?? 0), indicator, rawValue),
      excluded,
    };
  }

  const components = requireRuleField(rule.components, rule.type, "components");
  const children = components.map((component) =>
    scoreRule({ ...component.rule, indicator: component.indicator } as Rule, values),
  );
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const [index, child] of children.entries()) {
    if (child.score === null) {
      continue;
    }
    const weight = components[index].weight;
    weightedTotal += child.score * weight;
    totalWeight += weight;
  }
  return {
    score: totalWeight === 0 ? null : clamp(weightedTotal / totalWeight),
    missing: totalWeight === 0,
    excluded: children.some((child) => child.excluded),
    children,
  };
}

function requireRuleField<T>(value: T | undefined, ruleType: string, field: string): T {
  if (value === undefined) {
    throw new Error(`Rule ${ruleType} is missing field ${field}`);
  }
  return value;
}

function extractIndicators(result: ScoreResult): string[] {
  if (result.children) {
    return Array.from(new Set(result.children.flatMap(extractIndicators)));
  }
  return result.indicator ? [result.indicator] : [];
}

function sourceName(indicatorKey: string) {
  const indicator = indicatorByKey.get(indicatorKey);
  if (!indicator) {
    return "source inconnue";
  }
  return sourceByKey.get(indicator.source)?.name ?? indicator.source;
}

function formatValue(value: string | number | undefined, unit?: string) {
  if (value === undefined || value === null || value === "") {
    return "n/a";
  }
  if (unit === "eur_m2") {
    return `${Number(value).toLocaleString("fr-FR")} €/m2`;
  }
  if (unit === "minutes") {
    return `${value} min`;
  }
  if (unit === "percent") {
    return `${value} %`;
  }
  if (unit === "hab_km2") {
    return `${Number(value).toLocaleString("fr-FR")} hab/km2`;
  }
  if (unit === "celsius") {
    return `${value} deg C`;
  }
  if (unit === "hours") {
    return `${Number(value).toLocaleString("fr-FR")} h`;
  }
  if (unit === "days") {
    return `${value} j/an`;
  }
  if (unit === "meters") {
    return `${value} m`;
  }
  return String(value);
}

function scrollToCriterion(key: string) {
  document.getElementById(`criterion-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function numberValue(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function missing(indicator: string): ScoreResult {
  return { score: null, indicator, value: null, missing: true, excluded: false };
}

function scored(score: number, indicator: string, value: string | number): ScoreResult {
  return { score: round(clamp(score)), indicator, value, missing: false, excluded: false };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, lower = 0, upper = 100) {
  return Math.max(lower, Math.min(upper, value));
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
