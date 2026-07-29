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

## 2026-07-29 — PR-2 (slice S2): ingest -> validate -> DLQ -> TSDB [Claude, never-delegate]

Stop line: **none — Q0 fired** (migration + irreversible schema change; and the conservation
/ never-stall invariants have no cheap oracle). Claude implemented the whole slice. Per
g2-coding Phase 2c-ter the TDD standard still applied with no delegate: tests first, RED
observed, then implementation.

Delivered: 002_ingest_identity.sql; scripts/migrate.py (idempotent ordered runner +
  schema_migrations); api/app/{db,ingest,service}.py; routes/{pipeline,telemetry}.py;
  main.py rewiring (bounded queue, supervised consumer, pool lifecycle); compose gains
  one-shot migrate+seed as COMPLETION dependencies, MQTT_ENABLED=1, overridable host ports;
  mosquitto persistence on.

Live verification (not just tests): full stack from a clean volume — migrate applied
  001+002, seed loaded 238 devices, api reached connected/granted_qos=1; 147 published ->
  147 telemetry, 0 DLQ, ledger 147; FAULT_MODE=bad_asset -> 58 dead letters with the right
  reason and ingest continued; broker restart -> RECOVERED in 1.7s (budget 30s) with
  received climbing 570->579; final ledger 631 = telemetry 463 + dlq 168, holds = true.

QCHECK (g2-qcheck): Tier 1 = Claude (g2-check on the working tree). Tier 2 = Codex
  gpt-5.6-sol xhigh — MANDATORY here (core contract + schema/migration change). DeepSeek
  correctly excluded (scoped to code writing; it authored none of this).
  Tier 2 reported 0 CRITICAL, 4 HIGH, 4 MEDIUM, 2 LOW. Two findings were discovered
  independently by Claude first (JSONB unstorability, the three-snapshot conservation
  count) — one defect, two witnesses. Full report: docs/codex-review-s2.md.

  FIXED — HIGH:
  - #1 a transient DB failure stranded the delivery: MQTT only guarantees redelivery on
    RECONNECT, so an unacked message sits forever while the connection stays healthy and
    status still reads "connected". consume_once now retries with bounded backoff and
    records `unstored`; the old test passed while permanently losing its first message.
  - #2 valid wire input could fail BOTH telemetry and DLQ persistence. `1e10000` decodes
    to inf and json.dumps writes the bare token `Infinity`; `\u0000` in a string is
    likewise unstorable — PostgreSQL rejects both, so the row could never be written and
    the message was redelivered forever. Sub-finding Claude had NOT caught: a big enough
    integer makes float() raise OverflowError, escaping MessageRejected entirely.
    encode_raw now guarantees storability (base64 fallback) and validate catches Overflow.
  - #3 asyncio.Queue is not thread-safe and `full()`-then-`put_nowait` raced across the
    paho thread. Admission now happens entirely on the event loop; overflow is recorded
    there instead of being lost after submit() already claimed success.
  - #4 undecodable identity used topic+mid, and MQTT packet ids are reused after PUBACK,
    so a DISTINCT later malformed delivery would be swallowed as a redelivery — silent
    loss of exactly the evidence the DLQ exists to show. Now a per-process sequence, and
    malformed rows carry the subscriber run_id instead of NULL so they are attributable.
    (Claude had separately found and fixed the cross-SESSION half of this collision, via
    a test that passed alone and failed in the suite.)

  FIXED — MEDIUM/LOW:
  - #5 conservation_counts took three snapshots; now one statement. (Found independently.)
  - #6 disposition did not enforce that the ledger row and the telemetry row describe the
    SAME delivery; now raises on mismatch. One existing test WAS passing mismatched ids.
  - #8 the status endpoint advertised the API's run_id while rows carry the producer's —
    a judge following it would query zero rows. Renamed to `subscriber_run_id` and
    conservation is reported over all runs.
  - #9 run_consumer's supervision was never exercised (every injected failure was caught
    by a lower layer; mutation confirmed the try/except could be deleted). Now pinned by
    raising from consume_once itself.
  - Claude-found: `query_range` and `conservation_counts` were ORPHANS — tested but with
    no runtime caller. Both are now wired to endpoints, which also makes the invariant
    judge-visible. Compose hardcoded FAULT_MODE so the simulator's injectable faults were
    unreachable from outside the file. PipelineStatus fields were mutated outside its lock.

  RECORDED, NOT FIXED (with reason):
  - #7 the reconnect test restarts the broker immediately, so only the first backoff
    interval elapses; it would pass with paho's defaults too. Rather than imply otherwise,
    the docstring now states exactly what it does and does not prove, and the settings are
    pinned directly by test_reconnect_settings_are_inside_the_30s_budget. A discriminating
    test needs a ~20s outage plus a packet-level blackhole — owner: slice S-D, which owns
    rehearsed reconnect timing.
  - #10 the migration runner is not concurrent-safe. It runs as a single one-shot compose
    service, and current DDL is replay-tolerant. Owner: whoever adds a non-idempotent
    backfill. Recorded so it is not rediscovered.
  - Durable disk spool still deferred (DREP §9): messages now survive a broker restart
    (durable session + persistence) and a DB outage (retry, then unacked), but not
    simultaneous broker-and-process loss.
  - CI still absent repo-wide.
  - Codex could not append to this log (read-only sandbox); appended by Claude.

Mutation evidence: reverting the QoS-1 re-subscription fails the reconnect test; acking
  regardless of success fails the redelivery test; removing ALL containment layers fails
  the resilience tests (removing any ONE does not — they are genuine defense in depth, and
  the test pins the behaviour rather than an implementation detail).

Verified by Claude: ruff clean; mypy --strict clean (18 files); pytest 60 passed x3
  consecutive; simulator's 42 still green; AST check shows no function over 50 lines and
  no `# type: ignore` anywhere in either service.

## 2026-07-29 — PR-3 (slice S3): retrieval latency, DLQ browse, twin WebSocket [Mode A]

Stop line: **SL-3**, chosen via Q0-Q3 (Q0 no; Q1 YES — the fan-out hub is the one genuinely
concurrency-sensitive part, the endpoints are plumbing). Also consistent with the adaptation
rule: PR-1 needed 3 delegate rounds, so this comparable slice moved up one level from SL-2.

Delegate authored: `latest_reading`, `recent_dead_letters`, `telemetry_latest`,
  `list_dead_letters` (1 round). Claude authored: `app/ws.py`, `routes/twin.py`, the
  `Disposition` refactor in `service.py`, main.py wiring, `003_read_paths.sql`, and every test.

**Scope crossing, recorded honestly:** the delegate also edited `api/app/main.py`, which was
  on its do-not-touch list. The change was correct — the pool was created only inside
  `if settings.mqtt_enabled`, so every read returned 503 in exactly the configuration the
  latency demo runs in. Claude reviewed, adopted and hardened it (added the logging the
  original swallowed) rather than reverting a real fix.

QCHECK: Tier 1 = Claude (g2-check on the working tree). Tier 2 = Codex gpt-5.6-sol xhigh —
  mandatory (delegate-authored code). DeepSeek excluded as the implementer. Tier 2 returned
  0 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW. Full report: docs/codex-review-s3.md.

  Found by Claude BEFORE Tier 2 (from the plan review) and fixed:
  - broadcast fired for DLQ'd and redelivered messages, because dispose_message returned a
    bare bool meaning "stored" — a rejected bad asset stores just as successfully as a good
    reading. Replaced with a Disposition enum; only ACCEPTED broadcasts, ack stays
    independent of the WS so a socket problem cannot become a redelivery storm.
  - every database-backed handler was `async def` while calling synchronous psycopg, holding
    the single worker's event loop (which also runs ingest and fan-out) for each query.

  FIXED from Tier 2 — HIGH:
  - #1 an idle client that disconnected leaked its subscriber forever: a disconnect arrives
    as an ASGI *receive*, and a send-only handler never performs one. Now a sender task plus
    a receive-watcher, whichever finishes first cancels the other. Mutation-verified: the
    old send-only loop fails the new live test.
  - #2 broadcast is O(N) on the loop with no admission limit; leaked or hostile clients make
    every MQTT message O(N) (measured ~43ms at 100k subscribers). Admission now capped.
  - #3 DLQ offset paging unbounded — deep offsets still walk every preceding index entry.
    Offset ceiling added; cursor pagination deferred (offset only drifts under concurrent
    insert, acceptable for a demo browser) and recorded.
  - #4 the latency test is a steady-state local preflight, not judge-facing evidence. Said so
    explicitly in the test docstring instead of implying otherwise, and it now asserts the
    BODY too — a fast endpoint returning the wrong asset used to pass.

  FIXED from Tier 2 — MEDIUM/LOW:
  - #5 the hub kept the newest N frames globally, so 64 updates for other assets could evict
    a pending `P-1: critical` and the twin would show it healthy forever. Frames now coalesce
    per asset, and eviction prefers routine `normal` frames over notable ones.
  - #6 `latest_reading` had no total ordering; added a message_id tie-breaker.
  - #7 a valid non-object payload (`[1,2,3]`, a scalar, `null`) was stored as a bare JSON
    value and the reader invented a shape for it, making a genuine {"value": ...} payload
    indistinguishable from a wrapped scalar. The envelope is now decided at write time.
  - #8 the EXPLAIN assertions accepted any plan containing "Index" (including a bitmap scan
    plus sort) and any plan without "Sort" (including a seq scan). Now parses FORMAT JSON and
    asserts an ordered Index Scan on the expected index by name.
  - #9 the ACK matrix was untested — "ack only ACCEPTED" and "omit the final ack after retry"
    both survived. Two tests added.
  - #11 `max_queue=0` silently meant UNBOUNDED (asyncio.Queue semantics); now rejected.
  - #12 the DLQ route test only proved a 503; a broken 200 body stayed green. Real shape test
    added against a configured database.
  - #10 (LOW) NULL provenance mapped to "" — left as is, recorded; changing Reading.message_id
    to `str | None` ripples through S2's contract for no demo benefit.

**Flakiness:** the 3x loop caught a real 1-in-7 intermittent failure. It did not reproduce in
  12 further runs, and the specific test was not captured. Two live WS tests asserted after a
  fixed `sleep()`, which is the classic shape of exactly that flake, so both were rewritten to
  poll with a deadline. Recorded rather than dismissed: if it recurs, the fixed-sleep theory
  is wrong and the reconnect/latency timing tests are the next suspects.

Verified by Claude: ruff clean; mypy --strict clean (26 files); pytest 100 passed;
  no function over 50 lines; no `# type: ignore`. Live against the full Compose stack:
  5 WS frames received (event_version=1), /latest mean 1.1ms (budget 500ms) with
  Server-Timing db;dur=0.13, /api/dlq returning real rejects, migrate applied 001+002+003.

Deferred with owners: browser-measured latency + cold-start evidence -> S-D/PR-17; CORS and
  the Vite dev proxy -> PR-6; chunk-exclusion for latest-ever -> S-D; keyset pagination -> when
  the DLQ browser gains filters.

## 2026-07-29 — PR-4 (slice S5): predictive-maintenance model [Mode A, SL-3]

Stop line SL-3 via Q0-Q3 (Q1: the domain math — censoring semantics, local attribution,
leakage-free splits — is the judgment core; lifecycle generation and feature extraction are
plumbing). Delegate wrote lifecycle.py, features.py, train.py (2 rounds: implementation,
then a pure length refactor). Claude wrote datasets.py, predict.py, the censoring model, the
dataset generator and every test.

Delegate note: the first `pi` invocation timed out (this session had repeated transient
network failures — a git fetch and a pip install failed the same way). A single retry
succeeded; the Phase 0e fallback ladder was not needed.

Measured, not asserted: health MAE 0.150 vs DummyRegressor 17.025; PTTF MAE 31.2h vs
102.0h; 99.5 health-point separation between the two HELD-OUT demo lifecycles.

QCHECK: Tier 1 = Claude. Tier 2 = Codex gpt-5.6-sol xhigh (mandatory: delegate-authored +
domain/business semantics). Returned 1 CRITICAL, 5 HIGH, 2 MEDIUM. Full report:
docs/codex-review-s5.md. Note it reviewed a snapshot mid-edit and says so.

  Found by Claude first, via mutation testing:
  - training PTTF on censored windows as EXACT targets passed all 13 tests, because the
    output flag is computed at inference and says nothing about fitting. The card now
    records total/censored/pttf training window counts, which makes the policy checkable.
  - the committed demo CSVs had drifted from the generator. The delegate's "pure length
    refactor" changed the RNG draw order — power_kw matched but four other signals did not
    — so it was NOT behaviour-preserving despite the brief requiring it. No test pinned
    exact values, which is why the new drift test earns its place. Codex independently
    reported the same drift (two witnesses).
  - that drift test initially took 199s, because pytest renders a diff over 45KB of CSV on
    failure. Now compares digests: 0.07s.

  FIXED from Tier 2:
  - CRITICAL #1 the slice shipped NO artifact — train() had no entry point and everything
    was built inside pytest's tmpdir, so a fresh clone had nothing for load_bundle() to
    open while test_the_artifact_loads... still passed. Added `python -m pwa_ml`, committed
    the model card, and added tests that load the CANONICAL ml/artifacts/model.pkl.
  - HIGH #3 `pttf_censored` was not censoring. Censoring is a property of an OBSERVATION;
    nothing at inference knows whether a device's failure will be observed. Renamed to
    `pttf_out_of_range` and documented as an extrapolation warning. Training's censoring
    handling was already correct. Also removed a comment of mine claiming a linear model
    cannot extrapolate past its fitted target range — that is simply false.
  - HIGH #4 the whole anti-theatre suite read SELF-REPORTED card fields, so a fitter that
    trained on validation + the reserved demo pair while writing honest split ids passed
    everything. Confirmed by mutation. Comparing MAE cannot catch it either (a leaked model
    reports its own lower number). Now: perturb ONLY the held-out lifecycles, retrain, and
    require the fitted coefficients to be unchanged. The mutation now fails.
  - HIGH #5 the data hash covered only lifecycle id, hour and latent health — Codex shifted
    a training vibration value and the digest did not move. Now hashes every observable.
  - HIGH #6 RCA compared a CLIPPED actual health against UNCLIPPED counterfactuals, so at
    the boundary (raw 120 vs 110, both displayed 100) it reported a +10 contribution that
    did not exist. Now raw against raw.
  - MEDIUM #7 the RCA baseline was the mean of ALL training windows, i.e. a moderately worn
    machine. Now the mean of healthy windows — a nominal device.
  - MEDIUM #8 inference accepted any 8 rows; training used 24-hour contiguous windows.
    Minimum raised to 16 and reordered/gapped windows are rejected as `nodata`.
  - HIGH #2 (stale datasets) was the drift Claude had already found and fixed.

  NOT fixed, recorded with reasons:
  - Serving the model from the API image. The API container cannot see ml/ and does not
    install its dependencies. Packaging is DECIDED here (pwa_ml; artifact + card from
    train()); the image/compose wiring is PR-5's, the slice that adds the inference routes.
  - The live feature-window contract (resampling, freshness, per-asset isolation from a 5Hz
    stream) belongs with S6's score_all, the first code to build windows from live data.
  - Codex's remaining point on #7 — that model attribution is not causal root cause — is
    accepted as true and is a limitation of the technique, not a defect. The card's
    limitations section says so.

Environment note: numpy 2.2.1 on Apple Accelerate emits divide-by-zero/overflow/invalid
  RuntimeWarnings from EVERY matmul, reproduced with random data. Filtered in
  ml/pyproject.toml with that reasoning recorded; the property they might have hinted at is
  asserted positively by test_every_prediction_is_finite.

Verified by Claude: ruff clean; mypy --strict clean (13 files); ml 48 passed x3; api 100 and
  simulator 42 still green; no function over 50 lines; no `# type: ignore`.
