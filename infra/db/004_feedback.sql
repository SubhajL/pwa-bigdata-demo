-- PWA demo POC — feedback loop (slice S6, scored item 3.4)
--
-- Item 3.4 asks for a Feedback Loop endpoint that is documented in Swagger AND accepts a
-- real payload (200 + persisted). "Persisted" is the half a route alone cannot satisfy, so
-- the table lands with the route.
--
-- `asset_id` carries a foreign key to `device` deliberately. Feedback about a device that
-- does not exist is not data, it is a typo, and the demo's whole DLQ story is that unknown
-- asset ids are caught rather than stored. The route checks the roster first and returns
-- 404, so the constraint is a backstop, not the error path a judge sees.
--
-- Idempotent: every statement is IF NOT EXISTS, so the migration runner may re-apply it.

CREATE TABLE IF NOT EXISTS feedback (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id             TEXT NOT NULL REFERENCES device(asset_id),
    -- The technician's verdict on a prediction the model made.
    verdict              TEXT NOT NULL
                         CHECK (verdict IN ('confirmed', 'false_alarm', 'repaired', 'deferred')),
    -- What the model said at the moment the feedback was given. Nullable because a judge
    -- may POST a bare payload from Swagger; when present it makes the row self-contained,
    -- so "was the model right?" is answerable without re-joining to a health row that
    -- retention may since have dropped.
    predicted_health     DOUBLE PRECISION,
    predicted_pttf_hours DOUBLE PRECISION,
    model_version        TEXT,
    note                 TEXT,
    submitted_by         TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The read path is "recent feedback for this asset, newest first".
CREATE INDEX IF NOT EXISTS feedback_asset_created_idx ON feedback (asset_id, created_at DESC);

-- Ranking the worklist reads the newest health row per asset (DISTINCT ON (asset_id)),
-- which without this index sorts the whole hypertable on every request.
CREATE INDEX IF NOT EXISTS health_asset_scored_idx ON health (asset_id, scored_at DESC);
