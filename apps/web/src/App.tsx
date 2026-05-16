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

type PreciseControlSpec =
  | {
      mode: "max" | "min";
      label: string;
      indicator: string;
      min: number;
      max: number;
      step: number;
      defaultValue: number;
      helper: string;
    }
  | {
      mode: "range";
      label: string;
      indicator: string;
      min: number;
      max: number;
      step: number;
      defaultMin: number;
      defaultMax: number;
      helper: string;
    }
  | {
      mode: "categoryMax";
      label: string;
      indicator: string;
      categories: string[];
      defaultValue: string;
      helper: string;
    };

type CriterionSetting = {
  enabled: boolean;
  priority: number;
  value?: number;
  minValue?: number;
  maxValue?: number;
  categoryValue?: string;
};

type CriterionScore = {
  criterion: Criterion;
  score: number | null;
  score10: number | null;
  priority: number;
  enabled: boolean;
  missing: boolean;
  excluded: boolean;
  outsidePreciseInterval: boolean;
  preciseIndicator?: string;
  preciseValue?: string | number;
  result: ScoreResult;
};

type TerritoryScore = TerritorySample & {
  globalScore: number;
  globalScore10: number;
  inInterestingInterval: boolean;
  categoryScores: Record<string, number>;
  criterionScores: CriterionScore[];
};

const criteria = catalog.criteria as Criterion[];
const indicators = catalog.indicators as Indicator[];
const sources = catalog.sources as Source[];
const territories = catalog.sample_territories as TerritorySample[];

const indicatorByKey = new Map(indicators.map((indicator) => [indicator.key, indicator]));
const sourceByKey = new Map(sources.map((source) => [source.key, source]));

const preciseControls: Record<string, PreciseControlSpec> = {
  budget_immobilier: {
    mode: "max",
    label: "Prix maximum",
    indicator: "prix_m2_median",
    min: 1200,
    max: 8000,
    step: 100,
    defaultValue: 4500,
    helper: "Les communes sous ce plafond restent dans l'intervalle interessant.",
  },
  accessibilite_paris: {
    mode: "max",
    label: "Temps maximum Paris",
    indicator: "temps_total_paris_train_voiture_min",
    min: 60,
    max: 420,
    step: 15,
    defaultValue: 300,
    helper: "Temps total train depuis Paris plus voiture jusqu'a la commune.",
  },
  acces_gare: {
    mode: "max",
    label: "Temps max vers gare",
    indicator: "temps_voiture_gare_plus_proche_min",
    min: 5,
    max: 90,
    step: 5,
    defaultValue: 35,
    helper: "Trajet voiture depuis la commune vers la gare la plus proche.",
  },
  proximite_ville_moyenne: {
    mode: "range",
    label: "Temps ideal vers ville > 30k",
    indicator: "temps_voiture_ville_30000_min",
    min: 0,
    max: 90,
    step: 5,
    defaultMin: 15,
    defaultMax: 45,
    helper: "Intervalle cible pour rester proche des services sans etre trop urbain.",
  },
  densite_equilibree: {
    mode: "range",
    label: "Densite cible",
    indicator: "densite_population",
    min: 5,
    max: 1200,
    step: 5,
    defaultMin: 30,
    defaultMax: 180,
    helper: "Habitants par km2: ni trop isole, ni trop dense.",
  },
  residences_secondaires: {
    mode: "min",
    label: "Part minimale",
    indicator: "part_residences_secondaires",
    min: 0,
    max: 50,
    step: 1,
    defaultValue: 8,
    helper: "Repere une attractivite deja visible pour les residences secondaires.",
  },
  nature: {
    mode: "min",
    label: "Score nature minimum",
    indicator: "proximite_nature_score",
    min: 0,
    max: 100,
    step: 5,
    defaultValue: 55,
    helper: "Proxy de proximite mer, montagne, foret ou espaces naturels.",
  },
  risque_inondation: {
    mode: "categoryMax",
    label: "Risque maximum accepte",
    indicator: "risque_inondation_niveau",
    categories: ["aucun", "faible", "moyen", "fort"],
    defaultValue: "moyen",
    helper: "Les niveaux au-dessus du seuil deviennent defavorables.",
  },
  services: {
    mode: "min",
    label: "Services minimum a 30 km",
    indicator: "equipements_services_30km",
    min: 0,
    max: 300,
    step: 10,
    defaultValue: 100,
    helper: "Nombre d'equipements et services accessibles dans l'environnement proche.",
  },
  rayonnement_culturel: {
    mode: "min",
    label: "Festivals minimum",
    indicator: "festivals_30km",
    min: 0,
    max: 10,
    step: 1,
    defaultValue: 3,
    helper: "Evenements recurrents dans un rayon de 30 km.",
  },
  potentiel_viticole: {
    mode: "min",
    label: "Surface viticole minimale",
    indicator: "surface_vigne_pct",
    min: 0,
    max: 30,
    step: 1,
    defaultValue: 5,
    helper: "Part de surfaces viticoles: proxy simple de terroir viticole.",
  },
  climat_confortable: {
    mode: "range",
    label: "Temperature moyenne cible",
    indicator: "temperature_moyenne_annuelle",
    min: 7,
    max: 22,
    step: 0.5,
    defaultMin: 12,
    defaultMax: 17,
    helper: "Temperature moyenne annuelle souhaitee.",
  },
};

export function App() {
  const [settings, setSettings] = useState<Record<string, CriterionSetting>>(() =>
    Object.fromEntries(criteria.map((criterion) => [criterion.key, createInitialSetting(criterion)])),
  );
  const [selectedCode, setSelectedCode] = useState(territories[0].code);

  const rankedTerritories = useMemo(
    () =>
      territories
        .map((territory) => scoreTerritory(territory, settings))
        .sort((a, b) => b.globalScore - a.globalScore),
    [settings],
  );

  const selectedTerritory = rankedTerritories.find((territory) => territory.code === selectedCode) ?? rankedTerritories[0];
  const activeCriteria = selectedTerritory.criterionScores.filter((criterionScore) => criterionScore.enabled);
  const topCriteria = [...activeCriteria]
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
            <h2>Criteres precis</h2>
          </div>
          <p className="panel-help">
            Active les sous-options, donne une importance de 1 a 10, puis traduis le critere en valeur concrete.
          </p>
          <div className="criteria-list">
            {criteria.map((criterion) => (
              <CriterionControl
                criterion={criterion}
                key={criterion.key}
                setting={settings[criterion.key]}
                onChange={(nextSetting) =>
                  setSettings((current) => ({
                    ...current,
                    [criterion.key]: nextSetting,
                  }))
                }
              />
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">Decision multi-criteres</p>
            <h2>Shader de favorabilite et villes candidates</h2>
            <p>
              La carte affiche un shader vert/rouge calcule avec les criteres selectionnes. Vert indique les zones les
              plus favorables dans l'intervalle choisi; rouge signale les zones les moins adaptees ou hors seuil.
            </p>
          </div>
          <div className="hero-cards">
            <InfoCard icon={<Database size={18} />} value={String(indicators.length)} label="indicateurs" />
            <InfoCard icon={<FlaskConical size={18} />} value={String(activeCriteria.length)} label="criteres actifs" />
          </div>
        </header>

        <div className="content-grid">
          <section className="map-panel">
            <div className="map-header">
              <div>
                <p className="eyebrow">Carte shader</p>
                <h3>Zones favorables et villes candidates</h3>
              </div>
              <span className="legend">
                <i /> Rouge defavorable - vert favorable
              </span>
            </div>

            <CityRankingStrip
              territories={rankedTerritories}
              selectedCode={selectedTerritory.code}
              onSelect={setSelectedCode}
            />

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
              <div className="score-ring">{selectedTerritory.globalScore10}/10</div>
              <div>
                <strong>Score pondere</strong>
                <span>
                  {selectedTerritory.inInterestingInterval ? "Dans l'intervalle interessant" : "Hors d'au moins un seuil"}
                </span>
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
                  <strong>{criterionScore.score10}/10</strong>
                </button>
              ))}
            </div>

            {selectedDetails ? <CriterionExplanation score={selectedDetails} values={selectedTerritory.values} /> : null}
          </section>
        </div>

        <section className="criteria-table">
          <div className="panel-title">
            <Info size={18} />
            <h2>Traduction des criteres en valeurs</h2>
          </div>
          <div className="criterion-cards">
            {activeCriteria.map((criterionScore) => (
              <article className="criterion-card" id={`criterion-${criterionScore.criterion.key}`} key={criterionScore.criterion.key}>
                <div>
                  <p className="eyebrow">{criterionScore.criterion.category}</p>
                  <h3>{criterionScore.criterion.name}</h3>
                  <p>{criterionScore.criterion.description}</p>
                </div>
                <strong>{criterionScore.score10 === null ? "n/a" : `${criterionScore.score10}/10`}</strong>
                <p className={criterionScore.outsidePreciseInterval ? "interval-warning" : "interval-ok"}>
                  {describeIntervalStatus(criterionScore)}
                </p>
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

function CriterionControl({
  criterion,
  setting,
  onChange,
}: {
  criterion: Criterion;
  setting: CriterionSetting;
  onChange: (setting: CriterionSetting) => void;
}) {
  const spec = preciseControls[criterion.key];

  return (
    <article className={`criterion-control ${setting.enabled ? "" : "is-disabled"}`}>
      <label className="criterion-toggle">
        <input
          checked={setting.enabled}
          type="checkbox"
          onChange={(event) => onChange({ ...setting, enabled: event.target.checked })}
        />
        <span>
          <strong>{criterion.name}</strong>
          <small>{criterion.category}</small>
        </span>
      </label>

      {setting.enabled ? (
        <div className="criterion-settings">
          <label className="precision-control">
            <span>Importance</span>
            <input
              max="10"
              min="1"
              step="1"
              type="range"
              value={setting.priority}
              onChange={(event) => onChange({ ...setting, priority: Number(event.target.value) })}
            />
            <em>{setting.priority}/10</em>
          </label>

          {spec ? <PreciseControl spec={spec} setting={setting} onChange={onChange} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function PreciseControl({
  spec,
  setting,
  onChange,
}: {
  spec: PreciseControlSpec;
  setting: CriterionSetting;
  onChange: (setting: CriterionSetting) => void;
}) {
  const indicator = indicatorByKey.get(spec.indicator);

  if (spec.mode === "categoryMax") {
    return (
      <label className="precision-control">
        <span>{spec.label}</span>
        <select
          value={setting.categoryValue ?? spec.defaultValue}
          onChange={(event) => onChange({ ...setting, categoryValue: event.target.value })}
        >
          {spec.categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <small>{spec.helper}</small>
      </label>
    );
  }

  if (spec.mode === "range") {
    return (
      <div className="precision-control">
        <span>{spec.label}</span>
        <div className="range-pair">
          <label>
            min
            <input
              max={setting.maxValue ?? spec.defaultMax}
              min={spec.min}
              step={spec.step}
              type="number"
              value={setting.minValue ?? spec.defaultMin}
              onChange={(event) => onChange({ ...setting, minValue: Number(event.target.value) })}
            />
          </label>
          <label>
            max
            <input
              max={spec.max}
              min={setting.minValue ?? spec.defaultMin}
              step={spec.step}
              type="number"
              value={setting.maxValue ?? spec.defaultMax}
              onChange={(event) => onChange({ ...setting, maxValue: Number(event.target.value) })}
            />
          </label>
        </div>
        <em>
          {formatValue(setting.minValue ?? spec.defaultMin, indicator?.unit)} -{" "}
          {formatValue(setting.maxValue ?? spec.defaultMax, indicator?.unit)}
        </em>
        <small>{spec.helper}</small>
      </div>
    );
  }

  return (
    <label className="precision-control">
      <span>{spec.label}</span>
      <input
        max={spec.max}
        min={spec.min}
        step={spec.step}
        type="range"
        value={setting.value ?? spec.defaultValue}
        onChange={(event) => onChange({ ...setting, value: Number(event.target.value) })}
      />
      <em>{formatValue(setting.value ?? spec.defaultValue, indicator?.unit)}</em>
      <small>{spec.helper}</small>
    </label>
  );
}

function CityRankingStrip({
  territories,
  selectedCode,
  onSelect,
}: {
  territories: TerritoryScore[];
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="city-strip" aria-label="Classement des villes candidates">
      {territories.slice(0, 5).map((territory, index) => (
        <button
          className={`city-pill ${territory.code === selectedCode ? "is-selected" : ""}`}
          key={territory.code}
          onClick={() => onSelect(territory.code)}
        >
          <span>#{index + 1}</span>
          <strong>{territory.name}</strong>
          <em>{territory.globalScore10}/10</em>
        </button>
      ))}
    </div>
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

    const map = new maplibregl.Map({
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

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.on("load", () => {
      ensureSuitabilityShader(map);
      updateSuitabilityShader(map, territories);
    });
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    if (map.isStyleLoaded()) {
      ensureSuitabilityShader(map);
      updateSuitabilityShader(map, territories);
    } else {
      map.once("load", () => updateSuitabilityShader(map, territories));
    }
  }, [territories]);

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
      markerElement.innerHTML = `<strong>${territory.globalScore10}/10</strong><span>${territory.name}</span>`;
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

function CriterionExplanation({ score, values }: { score: CriterionScore; values: TerritorySample["values"] }) {
  const indicatorKeys = extractIndicators(score.result);

  return (
    <div className="explanation-card">
      <p className="eyebrow">Calcul du meilleur critere</p>
      <h4>{score.criterion.name}</h4>
      <p>{describeIntervalStatus(score)}</p>
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

function createInitialSetting(criterion: Criterion): CriterionSetting {
  const spec = preciseControls[criterion.key];
  const base = {
    enabled: true,
    priority: clamp(Math.round(criterion.default_weight * 5), 1, 10),
  };

  if (!spec) {
    return base;
  }
  if (spec.mode === "range") {
    return {
      ...base,
      minValue: spec.defaultMin,
      maxValue: spec.defaultMax,
    };
  }
  if (spec.mode === "categoryMax") {
    return {
      ...base,
      categoryValue: spec.defaultValue,
    };
  }
  return {
    ...base,
    value: spec.defaultValue,
  };
}

function scoreTerritory(territory: TerritorySample, settings: Record<string, CriterionSetting>): TerritoryScore {
  const criterionScores = criteria.map((criterion) => {
    const setting = settings[criterion.key] ?? createInitialSetting(criterion);
    const result = scoreRule(criterion.rule, territory.values);
    const preciseScore = scorePreciseInterval(criterion, territory.values, setting);
    const rawScore = preciseScore ? preciseScore.score : result.score;
    const score = setting.enabled ? rawScore : null;

    return {
      criterion,
      score,
      score10: score === null ? null : toTenPointScore(score),
      priority: setting.priority,
      enabled: setting.enabled,
      missing: result.missing,
      excluded: result.excluded,
      outsidePreciseInterval: preciseScore ? !preciseScore.inInterval : false,
      preciseIndicator: preciseScore?.indicator,
      preciseValue: preciseScore?.value,
      result,
    };
  });

  let weightedTotal = 0;
  let totalWeight = 0;
  const categoryTotals = new Map<string, number>();
  const categoryWeights = new Map<string, number>();

  for (const criterionScore of criterionScores) {
    if (!criterionScore.enabled || criterionScore.score === null || criterionScore.priority <= 0) {
      continue;
    }
    weightedTotal += criterionScore.score * criterionScore.priority;
    totalWeight += criterionScore.priority;
    categoryTotals.set(
      criterionScore.criterion.category,
      (categoryTotals.get(criterionScore.criterion.category) ?? 0) + criterionScore.score * criterionScore.priority,
    );
    categoryWeights.set(
      criterionScore.criterion.category,
      (categoryWeights.get(criterionScore.criterion.category) ?? 0) + criterionScore.priority,
    );
  }

  const categoryScores = Object.fromEntries(
    [...categoryTotals.entries()].map(([category, score]) => [
      category,
      round(score / (categoryWeights.get(category) ?? 1)),
    ]),
  );
  const globalScore = totalWeight === 0 ? 0 : round(weightedTotal / totalWeight);

  return {
    ...territory,
    globalScore,
    globalScore10: toTenPointScore(globalScore),
    inInterestingInterval: criterionScores
      .filter((criterionScore) => criterionScore.enabled)
      .every((criterionScore) => !criterionScore.outsidePreciseInterval),
    categoryScores,
    criterionScores,
  };
}

function scorePreciseInterval(
  criterion: Criterion,
  values: TerritorySample["values"],
  setting: CriterionSetting,
): { score: number; inInterval: boolean; indicator: string; value: string | number } | null {
  const spec = preciseControls[criterion.key];
  if (!spec) {
    return null;
  }

  const rawValue = values[spec.indicator];
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return {
      score: 0,
      inInterval: false,
      indicator: spec.indicator,
      value: "n/a",
    };
  }

  if (spec.mode === "categoryMax") {
    const value = String(rawValue).toLowerCase();
    const currentRank = spec.categories.indexOf(value);
    const maxRank = spec.categories.indexOf(setting.categoryValue ?? spec.defaultValue);
    const inInterval = currentRank >= 0 && currentRank <= maxRank;
    return {
      score: inInterval ? clamp(100 - currentRank * 22) : 10,
      inInterval,
      indicator: spec.indicator,
      value: rawValue,
    };
  }

  const numericValue = numberValue(rawValue);
  if (numericValue === null) {
    return {
      score: 0,
      inInterval: false,
      indicator: spec.indicator,
      value: rawValue,
    };
  }

  if (spec.mode === "max") {
    const maxValue = setting.value ?? spec.defaultValue;
    return {
      score: clamp(((maxValue - numericValue) / (maxValue - spec.min)) * 100),
      inInterval: numericValue <= maxValue,
      indicator: spec.indicator,
      value: numericValue,
    };
  }

  if (spec.mode === "min") {
    const minValue = setting.value ?? spec.defaultValue;
    return {
      score: clamp(((numericValue - minValue) / (spec.max - minValue)) * 100),
      inInterval: numericValue >= minValue,
      indicator: spec.indicator,
      value: numericValue,
    };
  }

  if (spec.mode === "range") {
    const minValue = setting.minValue ?? spec.defaultMin;
    const maxValue = setting.maxValue ?? spec.defaultMax;
    const inInterval = numericValue >= minValue && numericValue <= maxValue;
    const score = inInterval
      ? 100
      : numericValue < minValue
        ? ((numericValue - spec.min) / (minValue - spec.min)) * 100
        : ((spec.max - numericValue) / (spec.max - maxValue)) * 100;

    return {
      score: clamp(score),
      inInterval,
      indicator: spec.indicator,
      value: numericValue,
    };
  }

  return null;
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

function ensureSuitabilityShader(map: maplibregl.Map) {
  if (!map.getSource("suitability")) {
    map.addSource("suitability", {
      type: "geojson",
      data: createSuitabilityGeoJson([]),
    });
  }

  if (!map.getLayer("suitability-shader")) {
    map.addLayer({
      id: "suitability-shader",
      type: "circle",
      source: "suitability",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 58, 7, 145],
        "circle-color": [
          "interpolate",
          ["linear"],
          ["get", "score"],
          0,
          "#dc2626",
          35,
          "#f97316",
          55,
          "#facc15",
          75,
          "#22c55e",
          100,
          "#15803d",
        ],
        "circle-opacity": ["case", ["==", ["get", "inInterval"], true], 0.58, 0.25],
        "circle-blur": 0.72,
      },
    });
  }

  if (!map.getLayer("candidate-islands")) {
    map.addLayer({
      id: "candidate-islands",
      type: "circle",
      source: "suitability",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 8, 7, 18],
        "circle-color": [
          "interpolate",
          ["linear"],
          ["get", "score"],
          0,
          "#dc2626",
          55,
          "#facc15",
          100,
          "#15803d",
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.88,
      },
    });
  }
}

function updateSuitabilityShader(map: maplibregl.Map, scores: TerritoryScore[]) {
  const source = map.getSource("suitability") as maplibregl.GeoJSONSource | undefined;
  source?.setData(createSuitabilityGeoJson(scores));
}

function createSuitabilityGeoJson(scores: TerritoryScore[]) {
  return {
    type: "FeatureCollection",
    features: scores.map((territory) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [territory.longitude, territory.latitude],
      },
      properties: {
        code: territory.code,
        name: territory.name,
        score: territory.globalScore,
        score10: territory.globalScore10,
        inInterval: territory.inInterestingInterval,
      },
    })),
  } as GeoJSON.FeatureCollection;
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

function describeIntervalStatus(score: CriterionScore) {
  if (!score.preciseIndicator) {
    return "Score calcule avec la regle declarative du catalogue.";
  }
  const indicator = indicatorByKey.get(score.preciseIndicator);
  const formatted = formatValue(score.preciseValue, indicator?.unit);
  return score.outsidePreciseInterval
    ? `Valeur mesuree ${formatted}: hors intervalle selectionne.`
    : `Valeur mesuree ${formatted}: dans l'intervalle selectionne.`;
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

function toTenPointScore(score: number) {
  return clamp(Math.round(score / 10), 1, 10);
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
