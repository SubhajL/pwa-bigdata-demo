-- PWA demo POC — twin topology: identity, geometry and traversal indexes (slice S4a).
--
-- WHY THIS EXISTS
-- ---------------
-- The twin needs a runtime chain: telemetry asset -> topology node/pipe -> WS event ->
-- impact query -> rendered pipe. Three links were missing before this migration:
--
--   1. A device could not be LOCATED. `device` had no topology node, and neither `device`
--      nor `pipe_edge` carried any geometry, so the SVG schematic (scored item 2.1) had no
--      ground truth to draw from. Worse, the seed named the demo pump `P-2` while the
--      topology named its node `P2`, so even a hand-written join returned nothing.
--   2. Downstream traversal (scored item 2.4) walked `pipe_edge.from_node` and joined
--      `customer_service_point.node`, and NEITHER column was indexed — only the
--      three-column primary key and the customer primary key existed.
--   3. Specific Energy Consumption (scored item 2.3) needs the newest `power_kw` AND the
--      newest `flow_m3h` for one asset. `telemetry_asset_ts_idx (asset_id, ts DESC)` gives
--      the newest row overall, NOT the newest per signal, so that query would sort history.
--
-- Every column is added nullable with no default: this runs against volumes that already
-- carry telemetry, and a rewrite of the hypertable is not acceptable. `scripts/migrate.py`
-- skips already-applied filenames, so this is the upgrade path for an existing demo volume
-- and is exercised by `api/tests/test_topology.py::test_006_forward_applies`.

-- ── device -> topology node, and render geometry ────────────────────────────
-- `node` is the join to `pipe_edge.from_node` / `to_node`. It is deliberately NOT a foreign
-- key: `pipe_edge` is keyed by (pipe_id, from_node, to_node), so there is no unique node
-- table to reference, and adding one would restructure a schema three slices already build
-- on. The join being non-empty is asserted by a test instead.
ALTER TABLE device ADD COLUMN IF NOT EXISTS node TEXT;
ALTER TABLE device ADD COLUMN IF NOT EXISTS x    DOUBLE PRECISION;
ALTER TABLE device ADD COLUMN IF NOT EXISTS y    DOUBLE PRECISION;

-- ── pipe geometry, in the same unitless schematic space as device x/y ───────
-- Schematic coordinates, not GIS. The twin is a process diagram; a map is a different
-- screen with a different (real) coordinate source.
ALTER TABLE pipe_edge ADD COLUMN IF NOT EXISTS x1 DOUBLE PRECISION;
ALTER TABLE pipe_edge ADD COLUMN IF NOT EXISTS y1 DOUBLE PRECISION;
ALTER TABLE pipe_edge ADD COLUMN IF NOT EXISTS x2 DOUBLE PRECISION;
ALTER TABLE pipe_edge ADD COLUMN IF NOT EXISTS y2 DOUBLE PRECISION;

-- ── traversal indexes (scored item 2.4) ─────────────────────────────────────
-- BFS reads `WHERE from_node = ANY(...)` once per level; the customer join reads
-- `WHERE node = ANY(...)` once. Both were unindexed.
CREATE INDEX IF NOT EXISTS pipe_edge_from_node_idx ON pipe_edge (from_node);
CREATE INDEX IF NOT EXISTS customer_service_point_node_idx ON customer_service_point (node);

-- ── latest-per-signal (scored item 2.3) ─────────────────────────────────────
-- SEC needs the newest power_kw and the newest flow_m3h SEPARATELY: telemetry stores one
-- signal per row and the simulator cycles signals, so the two readings normally have
-- different timestamps. `(asset_id, ts DESC)` cannot serve an ordered latest-per-signal
-- lookup — it would return the newest row of ANY signal.
--
-- INCLUDE keeps the query index-only. `api/tests/test_latency.py` asserts the existing
-- latest-reading query stays an index seek; the new query gets its own EXPLAIN assertion,
-- because a green suite there would say nothing about this one.
CREATE INDEX IF NOT EXISTS telemetry_asset_signal_ts_idx
    ON telemetry (asset_id, signal, ts DESC) INCLUDE (value);
