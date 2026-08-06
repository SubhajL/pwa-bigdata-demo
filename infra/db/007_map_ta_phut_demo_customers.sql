-- PWA demo POC — Map Ta Phut 200-customer low-pressure impact schema (PR-I, scored item 2.4).
--
-- WHY THIS EXISTS
-- ---------------
-- Criterion 2.4 shows "who loses water when this pipe fails". Before this migration the answer
-- was five hand-written Samut Sakhon service points. This adds the two demo-only tables behind a
-- realistic, privacy-safe, exactly-200-account Map Ta Phut incident: profiles and their monthly
-- meter history. `scripts/seed_db.py` fills them from the deterministic generator
-- (`scripts/map_ta_phut_customer_profile.py`) and retires the five legacy rows.
--
-- ADDITIVE & IDEMPOTENT: every statement is IF NOT EXISTS, so this is the upgrade path an
-- existing 006 volume takes (`scripts/migrate.py` skips already-applied files) AND part of the
-- fresh initdb bundle. It only adds tables; it never rewrites `customer_service_point` or any
-- hypertable. Exercised forward-from-006 by test_mtp_migration_seed.py::test_upgrade_from_006_*.
--
-- NOT A HYPERTABLE — deliberate. CLAUDE.md routes TIME-SERIES writes to a hypertable, and
-- `telemetry` (001_init.sql) is exactly that: unbounded, append-heavy, time-partitioned device
-- signals. `demo_customer_meter_reading` is the opposite: a bounded, closed reference set of
-- exactly 12 monthly periods per account (2,400 rows total), written once by the seed and read by
-- a per-customer key lookup. Partitioning 2,400 fixed rows by time buys nothing and would misapply
-- the rule; a plain relational table with a composite primary key is the honest model.
--
-- ALL SIMULATED. These CHECK constraints are prefix/marker TRIPWIRES — identifiers must be
-- `SIM-MTP-*`, the address must contain `จำลอง`, `simulated` must be TRUE — so a clearly-real row
-- is refused at write time. They are NOT a full-content PII filter. The airtight no-PII guarantee
-- is the generator's `validate_demo_customer_profile`, which enforces an ALLOWLIST (every field
-- must match its exact synthetic shape), so no arbitrary text — including a name, which no
-- blocklist could catch — can pass before seeding (PWA privacy policy — see
-- docs/data/map-ta-phut-customer-profile.md).

-- ── one simulated Map Ta Phut service account per customer_service_point ─────────────────────
CREATE TABLE IF NOT EXISTS demo_customer_profile (
    customer_id      TEXT PRIMARY KEY REFERENCES customer_service_point(customer_id),
    account_no       TEXT NOT NULL UNIQUE,
    meter_no         TEXT NOT NULL UNIQUE,
    type_code        SMALLINT NOT NULL,
    subtype_code     SMALLINT NOT NULL,
    meter_size       TEXT NOT NULL,
    pressure_zone_id TEXT NOT NULL,
    address_label    TEXT NOT NULL,
    profile_version  TEXT NOT NULL,
    simulated        BOOLEAN NOT NULL DEFAULT TRUE,
    -- Named so a test can assert the SPECIFIC guard fired, not just "some IntegrityError".
    CONSTRAINT demo_customer_profile_customer_id_synthetic CHECK (customer_id LIKE 'SIM-MTP-%'),
    CONSTRAINT demo_customer_profile_account_no_synthetic  CHECK (account_no  LIKE 'SIM-MTP-%'),
    CONSTRAINT demo_customer_profile_meter_no_synthetic    CHECK (meter_no    LIKE 'SIM-MTP-%'),
    CONSTRAINT demo_customer_profile_address_simulated     CHECK (address_label LIKE '%จำลอง%'),
    CONSTRAINT demo_customer_profile_is_simulated          CHECK (simulated = TRUE),
    CONSTRAINT demo_customer_profile_type_code_valid       CHECK (type_code IN (1, 2, 3))
);

-- ── twelve closed monthly meter periods per account ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demo_customer_meter_reading (
    customer_id         TEXT NOT NULL REFERENCES demo_customer_profile(customer_id),
    period              TEXT NOT NULL,       -- 'YYYY-MM', a closed monthly billing period
    previous_reading_m3 INTEGER NOT NULL,
    reading_m3          INTEGER NOT NULL,
    usage_m3            INTEGER NOT NULL,
    PRIMARY KEY (customer_id, period),
    -- Shape AND a real calendar month (01-12): '2026-13' / '2026-00' are refused, not just
    -- non-numeric junk (g2-qcheck round 1, Codex).
    CONSTRAINT demo_customer_meter_reading_period_format
        CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    -- Per-row arithmetic integrity: a stored usage that does not reconcile with the registers,
    -- or a register that went backwards, is refused at write time.
    CONSTRAINT demo_customer_meter_reading_arithmetic
        CHECK (usage_m3 = reading_m3 - previous_reading_m3 AND reading_m3 >= previous_reading_m3)
);

-- The enriched impact query filters profiles by the active `MTP_CUSTOMER_PROFILE` version.
CREATE INDEX IF NOT EXISTS demo_customer_profile_version_idx
    ON demo_customer_profile (profile_version);
