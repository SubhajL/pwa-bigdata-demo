-- PWA demo POC — schema (slice S0)
-- TimescaleDB: telemetry is a hypertable; everything else relational.
-- Codex #12: extension + create_hypertable are explicit and catalog-assertable.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── device roster (seeded from data/curated) ────────────────────────────────
CREATE TABLE IF NOT EXISTS device (
    asset_id     TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,              -- pump | motor | valve | sensor
    branch       TEXT NOT NULL,
    province     TEXT NOT NULL,
    region       INT  NOT NULL,
    dma          TEXT,                        -- e.g. DMA-03
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── telemetry: the hypertable (Codex #4/#12) ────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry (
    ts           TIMESTAMPTZ NOT NULL,
    asset_id     TEXT        NOT NULL REFERENCES device(asset_id),
    signal       TEXT        NOT NULL,        -- pressure_bar | flow_m3h | power_kw | ...
    value        DOUBLE PRECISION NOT NULL
);
SELECT create_hypertable('telemetry', 'ts', if_not_exists => TRUE);
-- unique index MUST include the time partition key (Timescale constraint)
CREATE INDEX IF NOT EXISTS telemetry_asset_ts_idx ON telemetry (asset_id, ts DESC);

-- ── ingress ledger: conservation over unique deliveries (Codex #2) ──────────
CREATE TABLE IF NOT EXISTS ingress_ledger (
    message_id   TEXT PRIMARY KEY,           -- immutable per delivery
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    outcome      TEXT NOT NULL CHECK (outcome IN ('TELEMETRY','DLQ')),
    raw          JSONB NOT NULL
);

-- ── dead letter queue (ผนวก ๒ §3.1.5 error table) ───────────────────────────
CREATE TABLE IF NOT EXISTS dead_letter (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message_id   TEXT NOT NULL,
    asset_id     TEXT,                        -- may be null / unknown
    reason       TEXT NOT NULL,
    raw          JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── topology + customers (twin: pressure → affected customers, Codex #4) ─────
CREATE TABLE IF NOT EXISTS pipe_edge (
    pipe_id      TEXT NOT NULL,
    from_node    TEXT NOT NULL,
    to_node      TEXT NOT NULL,
    dma          TEXT,
    PRIMARY KEY (pipe_id, from_node, to_node)
);
CREATE TABLE IF NOT EXISTS customer_service_point (
    customer_id  TEXT PRIMARY KEY,
    node         TEXT NOT NULL,               -- attaches downstream of a pipe node
    area         TEXT NOT NULL,
    branch       TEXT NOT NULL
);

-- ── predictive health (score_all writes here; S6) ───────────────────────────
CREATE TABLE IF NOT EXISTS health (
    asset_id      TEXT NOT NULL,
    scored_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    observed_at   TIMESTAMPTZ,
    health_score  DOUBLE PRECISION NOT NULL,  -- 0..100
    pttf_hours    DOUBLE PRECISION,           -- >= 0
    model_version TEXT NOT NULL,
    PRIMARY KEY (asset_id, scored_at)
);
SELECT create_hypertable('health', 'scored_at', if_not_exists => TRUE);
