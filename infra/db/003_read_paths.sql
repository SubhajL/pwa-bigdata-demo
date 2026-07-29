-- PWA demo POC — indexes for the S3 read paths.
--
-- 001 indexed telemetry by (asset_id, ts DESC), which is what makes the scored-item-1.3
-- "latest reading" query an index seek rather than a scan over every chunk. The DLQ had
-- no ordering index at all: 002 added one on run_id only, so browsing the dead-letter
-- queue newest-first sorted the whole table on every page.
--
-- Idempotent: safe for the migration runner to re-apply.

CREATE INDEX IF NOT EXISTS dead_letter_created_idx ON dead_letter (created_at DESC, id DESC);
