# Coding Log — PWA Technical-Demonstration POC (ผนวก ๑๓)

Scored demo build: real-time data pipeline · SVG digital twin · AI predictive maintenance.
See POC_SPEC.md §4A for the 100-point checklist and docs/DREP-demo-poc.md for the plan.

## 2026-07-28 — Planning (g2-planning)
- Repo profiled greenfield; stack chosen (Python/FastAPI + TimescaleDB + Mosquitto + React/Vite + scikit-learn).
- DREP authored → docs/DREP-demo-poc.md.

## 2026-07-28 — PR-0 (slice S0): infra & scaffold [Claude, never-delegate]
Stop line: Q0 (no oracle until stack runs; irreversible infra) → Claude implements. No delegation.
Delivered: docker-compose (mosquitto 2.0.20, timescaledb 2.17.2-pg16, api, simulator[sim], web[ui]);
  001_init.sql (device, telemetry HYPERTABLE, ingress_ledger[Codex#2], dead_letter, pipe_edge,
  customer_service_point, health HYPERTABLE); FastAPI skeleton with paho-thread→asyncio.Queue
  bridge + single worker [Codex#11]; shared contracts (models.py); pinned requirements [Codex#12];
  Vite+React+TS scaffold + app.config.ts [begins 2.5]; scripts/seed_db.py [seeds in S0, Codex#10].
Verified: compose config valid; TimescaleDB healthy; 7 tables + 2 hypertables registered (catalog
  assertion, Codex#12); seed loaded 239 devices/4 pipes/5 customers incl. demo P-1/P-2/M-3/V-9;
  api gates green (pytest 2, mypy --strict, ruff); web gates green (tsc, eslint, vitest).
RED-proof: test_health.py fails at import without app/main.py (verified), passes with it.
Env note: OrbStack squats host 5432 (local Postgres) and leaks 5433 proxy on up/down churn;
  compose uses 5433; seed verified via no-port container IP. Local-env quirk, not a defect.
QCHECK: deferred to logic-bearing PRs (PR-2 DLQ, PR-4 model, PR-6 predictive) with rationale —
  PR-0 is pure scaffold, no algorithms; DREP already passed Codex adversarial review.

## 2026-07-29 — PR-1 (slice S1): telemetry simulator [Mode A, delegate = DeepSeek V4 Pro]

Stop line: **SL-2**, re-confirmed via the Q0-Q3 tree (Q0 no — no migration/secret/security
in the delegate's files and an oracle exists; Q1 no — no single hard function; Q2 YES —
new package surface, >3 functions, crosses to broker + compose + a shared contract artifact).
Matches DREP-S1-S2 section 8. No user override.

Delivered: simulator/app/{roster,models,config,publish}.py; contracts/telemetry-envelope.v1.schema.json
  (shared wire contract, validated by both S1 and S2 suites); simulator/pyproject.toml +
  requirements-dev.txt (the simulator had NO pytest/ruff/mypy config at baseline);
  scripts/seed_db.py now imports the roster instead of re-deriving it; compose mounts the
  curated CSV, adds RUN_ID/FAULT_MODE and restart: unless-stopped.

Authorship (honest): DeepSeek wrote the bodies of roster.py/publish.py and its own
  test_impl_*.py. Claude wrote all acceptance tests, models.py, config.py, the JSON Schema,
  seed_db.py, compose, and — after the Tier-2 review — the revised roster identity model,
  the CONNACK gating, the topic/payload fix and the test-quality repairs. Delegate fix
  rounds: **3**. Per the stop-line adaptation rule, 3 rounds is >=2, so the next comparable
  slice moves UP one stop line (SL-3). Recorded for S3/S6.

RED evidence: acceptance tests were authored first and failed with ModuleNotFoundError, then
  with NotImplementedError once seams landed — never on a missing fixture. Seams typechecked
  under mypy --strict with NotImplementedError bodies (the SL-2 criterion).
Mutation evidence: replacing make_signal's body with a constant mid-band value was used twice
  as an oracle — it initially PASSED the delegate's "different devices different values" test
  (proving that test vacuous) and after the fix it FAILS it, plus 2 anomaly tests.

QCHECK (g2-qcheck): Tier 1 = Claude (g2-check on the working tree; /code-review unavailable
  in this harness). Tier 2 = Codex gpt-5.6-sol at xhigh — MANDATORY here because the
  implementation was delegated. DeepSeek was barred from reviewing (implementer + scope rule).
  Tier 1 raised 2, Tier 2 raised 11; 1 was a duplicate across tiers (blank run_id), giving
  12 distinct findings. Dispositions:

  FIXED (Tier 1):
  - CRITICAL make_signal seeded from builtin hash() -> not reproducible across processes
    (PYTHONHASHSEED). Demo could not be replayed. Now zlib.crc32; pinned by a test running
    three interpreters with different hash seeds.
  - HIGH  delegate's own test asserted floats, not the per-device variation its name claimed.
    Proven vacuous by mutation; now asserts distinct values over 50 devices.

  FIXED (Tier 2):
  - CRITICAL #1 blank RUN_ID (compose wrote RUN_ID: "") -> pydantic treats "" as provided, so
    the uuid factory never fired; identical message_ids across restarts would be discarded by
    S2's ledger (message_id PK, ON CONFLICT DO NOTHING) -> silent zero-ingest. Found
    independently by Claude and Codex. Fixed with env_ignore_empty + a validator; tests added.
  - HIGH #3 roster identity was label-keyed. branch_code 5551014 was renamed
    บ้านนาสาร -> เวียงสระ, so the roster carried 235 branches for a dataset with 234 per
    month — a PHANTOM device for a defunct branch, presented as real geography (CLAUDE.md
    honesty violation). Re-modelled on branch_code with as-of-latest-month geography;
    asset_id is now PWA-{branch_code}-P1, stable under renames and insertions.
  - HIGH #4 CONNACK race + unbounded wait_for_publish. connect() does not await CONNACK;
    publication is now gated on the on_connect callback and every publish is bounded.
  - MEDIUM #5 BAD_ASSET published to the real device's topic while the payload carried the
    unknown id. Topic now follows the payload's asset_id.
  - MEDIUM #6 seed and simulator could read different CSVs; seed_db now resolves the path
    through the same CURATED_PATH setting.
  - MEDIUM #7 missing demo branch silently fabricated (3, "สมุทรสาคร"). Now raises. Added
    validation for blank identity fields, region range, and conflicting same-month geography.
  - MEDIUM #8 broker fixture skipped when docker existed but the broker failed to start,
    turning an infrastructure failure into a green gate. Now only skips when docker is absent.
  - MEDIUM #9 tests not testing their names: first-3-sequential-ids proved nothing about
    ordering; tz test accepted any aware offset; "all kinds" test sampled 40 devices that are
    all pumps. All three rewritten.
  - MEDIUM #10 non-positive rate_hz silently became "no delay" (broker flood). Now rejected.
  - LOW #11 a `# type: ignore` in a test and run() over the 50-line limit. Both removed; an
    AST check confirms no function in the slice exceeds 50 lines and no type: ignore remains.

  DEFERRED (1, with owner):
  - CRITICAL #2 "no seed-before-publish lifecycle; a fresh volume yields 100% unknown assets."
    Correct, and genuinely blocking for the pipeline — but the compose migrate/seed one-shot
    services are already scoped to **PR-2** (DREP-S1-S2 section 3, F2b/F2i). S1 has no DB
    dependency at all; it only publishes to MQTT. Owner: PR-2, which is next. NOT silently
    dropped — it is the first thing PR-2 must land.
  - Codex could not append its own review to this log (read-only sandbox); appended here by
    Claude instead.

Verified by Claude, not by delegate report: ruff clean; mypy --strict clean (13 files);
  pytest 42 passed x3 consecutive; integration tests run against a REAL Mosquitto container;
  full-roster coverage asserted as exact set equality; effective delivery QoS asserted == 1;
  simulator image builds with pytest correctly absent and pydantic_settings present;
  docker compose --profile sim config valid; end-to-end smoke of all four fault modes
  (normal in-band, anomaly out-of-band, bad_asset unknown id, malformed undecodable).

Residual / follow-up: CI is still absent repo-wide (Codex plan-review finding 9) — a
  Docker-capable workflow is its own slice, now meaningful since origin was created today.
