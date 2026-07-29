-- PWA demo POC — row provenance (slice S6)
--
-- The backfill has to be able to find and remove exactly the rows IT wrote, and it was
-- identifying them by a `backfill-` prefix on `message_id`. That identifier comes off the
-- wire: `service._classify` copies `payload["message_id"]` verbatim for accepted and
-- rejected messages alike, so any publisher can place rows inside that namespace.
--
-- Two ways that breaks the conservation invariant `ledger == telemetry + dead_letter`,
-- which `/api/pipeline/status` publishes live to a judge:
--
--   1. A REJECTED message named `backfill-x` writes a ledger row AND a dead_letter row.
--      Deleting the ledger row by prefix orphans the dead letter.
--   2. An ACCEPTED message named `backfill-x` is worse, because the two DELETEs run as
--      separate statements under READ COMMITTED: if the message commits between them, the
--      telemetry DELETE never saw it but the ledger DELETE does — leaving a telemetry row
--      with no ledger row.
--
-- Provenance fixes both by construction: the column is set by the writer, never by the
-- payload, so a wire message cannot claim to be a backfill row however it is named.
--
-- Idempotent: every statement is IF NOT EXISTS, so the runner may re-apply it.

ALTER TABLE telemetry      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'MQTT';
ALTER TABLE ingress_ledger ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'MQTT';

-- Partial: virtually every row is 'MQTT', so indexing only the exceptions keeps these tiny
-- while still making the backfill's own cleanup a lookup rather than a hypertable scan.
CREATE INDEX IF NOT EXISTS telemetry_source_idx
    ON telemetry (source) WHERE source <> 'MQTT';
CREATE INDEX IF NOT EXISTS ingress_ledger_source_idx
    ON ingress_ledger (source) WHERE source <> 'MQTT';
