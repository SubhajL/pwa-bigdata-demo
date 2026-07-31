-- Scored item 1.4 — proof that telemetry lives in a TimescaleDB HYPERTABLE and that a
-- time-range read returns ordered rows. Run it against the demo database:
--
--   docker compose -f infra/docker-compose.yml exec -T timescaledb \
--       psql -U pwa -d pwa -f - < scripts/show-hypertable.sql
--
-- (or, inside psql:  \i scripts/show-hypertable.sql)

\echo ''
\echo '── 1. telemetry IS a hypertable (TimescaleDB catalog, not a plain table) ──'
SELECT hypertable_name, num_dimensions, num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'telemetry';

\echo ''
\echo '── 2. its time chunks (the partitioning is real) ──'
SELECT show_chunks('telemetry') AS chunk
ORDER BY chunk DESC
LIMIT 5;

\echo ''
\echo '── 3. a bounded time-range retrieval returns rows, newest first (item 1.4) ──'
SELECT asset_id, signal, round(value::numeric, 3) AS value, ts
FROM telemetry
WHERE ts > now() - interval '15 minutes'
ORDER BY ts DESC
LIMIT 10;

\echo ''
\echo '── 4. row count written in the last 15 minutes (the write half of 1.4) ──'
SELECT count(*) AS rows_last_15m
FROM telemetry
WHERE ts > now() - interval '15 minutes';
