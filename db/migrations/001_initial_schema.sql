CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE territories (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id BIGINT REFERENCES territories(id),
    geometry GEOMETRY(MultiPolygon, 4326),
    centroid GEOMETRY(Point, 4326),
    area_km2 NUMERIC,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (type, code)
);

CREATE INDEX territories_geometry_gix ON territories USING GIST (geometry);
CREATE INDEX territories_centroid_gix ON territories USING GIST (centroid);

CREATE TABLE data_sources (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    url TEXT,
    license TEXT,
    description TEXT,
    update_frequency TEXT,
    reliability_level TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE datasets (
    id BIGSERIAL PRIMARY KEY,
    source_id BIGINT NOT NULL REFERENCES data_sources(id),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    geography_level TEXT NOT NULL,
    temporal_coverage TEXT,
    spatial_coverage TEXT,
    schema_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    version TEXT NOT NULL,
    imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ingestion_runs (
    id BIGSERIAL PRIMARY KEY,
    dataset_id BIGINT NOT NULL REFERENCES datasets(id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    row_count BIGINT,
    error_message TEXT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    checksum TEXT
);

CREATE TABLE indicators (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    dataset_id BIGINT REFERENCES datasets(id),
    calculation_method TEXT,
    geography_level TEXT NOT NULL,
    temporal_resolution TEXT,
    default_direction TEXT CHECK (default_direction IN ('higher_better', 'lower_better', 'target', 'categorical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE indicator_values (
    id BIGSERIAL PRIMARY KEY,
    indicator_id BIGINT NOT NULL REFERENCES indicators(id),
    territory_id BIGINT NOT NULL REFERENCES territories(id),
    value_numeric DOUBLE PRECISION,
    value_text TEXT,
    value_json JSONB,
    year INTEGER,
    source_dataset_id BIGINT REFERENCES datasets(id),
    confidence_score DOUBLE PRECISION CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (indicator_id, territory_id, year, source_dataset_id)
);

CREATE INDEX indicator_values_lookup_idx ON indicator_values (indicator_id, territory_id, year);

CREATE TABLE criteria (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    indicator_key TEXT,
    default_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
    is_filterable BOOLEAN NOT NULL DEFAULT true,
    is_advanced BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    ui_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE criterion_rules (
    id BIGSERIAL PRIMARY KEY,
    criterion_id BIGINT NOT NULL REFERENCES criteria(id),
    version INTEGER NOT NULL,
    rule_type TEXT NOT NULL,
    rule_config JSONB NOT NULL,
    min_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_score DOUBLE PRECISION NOT NULL DEFAULT 100,
    exclusion_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (criterion_id, version)
);

CREATE TABLE scoring_profiles (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    weights JSONB NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE score_runs (
    id UUID PRIMARY KEY,
    profile_id BIGINT REFERENCES scoring_profiles(id),
    weights JSONB NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    territory_type TEXT NOT NULL DEFAULT 'commune',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE criterion_scores (
    score_run_id UUID NOT NULL REFERENCES score_runs(id),
    territory_id BIGINT NOT NULL REFERENCES territories(id),
    criterion_key TEXT NOT NULL,
    rule_version INTEGER NOT NULL,
    score DOUBLE PRECISION,
    raw_value JSONB,
    explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_excluded BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (score_run_id, territory_id, criterion_key)
);

CREATE TABLE computed_scores (
    score_run_id UUID NOT NULL REFERENCES score_runs(id),
    territory_id BIGINT NOT NULL REFERENCES territories(id),
    global_score DOUBLE PRECISION,
    category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (score_run_id, territory_id)
);
