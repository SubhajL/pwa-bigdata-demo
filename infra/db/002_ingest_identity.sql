-- PWA demo POC — ingest identity (slice S2)
--
-- 001_init.sql gave the ledger a message_id but gave telemetry and dead_letter no
-- identity at all. The conservation invariant S2 must prove —
--   published == ledger  AND  ledger == telemetry + dead_letter
-- — cannot be expressed without one, and cannot be scoped to a single run without a
-- run_id, so two demo runs against the same volume would contaminate each other's counts.
--
-- Idempotent: every statement is IF NOT EXISTS, so the runner may re-apply it safely.

ALTER TABLE telemetry      ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE telemetry      ADD COLUMN IF NOT EXISTS run_id     TEXT;
ALTER TABLE ingress_ledger ADD COLUMN IF NOT EXISTS run_id     TEXT;
ALTER TABLE dead_letter    ADD COLUMN IF NOT EXISTS run_id     TEXT;

-- Conservation counting is always run-scoped.
CREATE INDEX IF NOT EXISTS telemetry_run_idx      ON telemetry      (run_id, ts DESC);
CREATE INDEX IF NOT EXISTS ingress_ledger_run_idx ON ingress_ledger (run_id);
CREATE INDEX IF NOT EXISTS dead_letter_run_idx    ON dead_letter    (run_id);

-- Idempotency is enforced by the ledger's message_id PRIMARY KEY: the disposition
-- transaction inserts the ledger row first with ON CONFLICT DO NOTHING RETURNING, and
-- only writes telemetry or dead_letter when a row actually came back. A UNIQUE index on
-- telemetry(message_id) is deliberately NOT used — TimescaleDB requires every unique
-- index to contain the time partition key, so UNIQUE(message_id, ts) would still admit
-- the same message at a different ts and would give false assurance.
CREATE INDEX IF NOT EXISTS telemetry_message_id_idx ON telemetry (message_id);
