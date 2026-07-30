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

---

## PR-5 / slice S6 — predictive-maintenance API (2026-07-29)

Scored items 3.3 (twin health event ≤30s), 3.4 (Swagger feedback loop, 200 + persisted),
3.5 (risk-ranked worklist), plus the `GET /api/rca/{asset_id}` surface for 3.6. 15 points.
Also lands the two things PR-4 deferred to this slice by name: serving the model from the
API image, and the live feature-window contract.

**Stop line: SL-3, by user override.** The Q0–Q3 tree would have said SL-3 anyway (Q1: one
genuinely hard part — the live feature window — surrounded by plumbing), and the adaptation
rule agreed: DREP §8 planned S6 at SL-2, but the previous delegated slice needed fix rounds
and silently changed RNG ordering, so this one moved up one.

Authorship, honestly:
  - **Claude**: migration 004 + 005, `api/app/features.py` (the hard function),
    `health_store.py`, `model.py`, `models.py` additions, `main.py` wiring, `config.py`,
    `api/app/__init__.py`, `scripts/backfill_history.py`, Dockerfile, compose, requirements,
    and EVERY test.
  - **DeepSeek V4 Pro via `pi`** (one round, no fix rounds): the bodies of `score_all` and
    `run_scoring_loop`, and the four route bodies. Nothing else. Diff audit clean on the
    first pass — spec byte-identical, scope respected, no fabricated data, no test weakened.
  - **Claude took over the delegate's files afterwards** rather than running a fix round.
    Reason: the review findings in `scoring.py` traced to MY contract, not to the delegate's
    execution — the brief explicitly told it to broadcast from inside the blocking function,
    which is the cross-thread defect below. Handing back my own design error to be re-fixed
    would have been dishonest attribution and a wasted round.

Delegate cost: one `pi` run, ~30 lines of report. Claude spent the tokens on the contract,
the tests, and four review rounds — which is where they belonged.

### The window contract (the decision this slice existed to make)

The model wants ≥16 contiguous HOURLY rows carrying all five signals. The hypertable holds
one row per reading, each with ONE signal, and the simulator cycles 238 devices at 5 Hz — so
a device is heard from every ~48s and needs ~4 minutes to report five signals once, 16 hours
to fill a window. Live-only scoring cannot produce a number during a demo.

User chose: **backfilled hourly history + a live newest bucket**. Real clock hours, no
compressed time unit, so `pttf_hours` means what the model card says. `scripts/backfill_history.py`
lays 30 hourly buckets per pump ending at `now`; live readings land in the newest one.

### Review — g2-qcheck, 4 rounds, 2 reviewers

Tier 1 `/code-review` was unavailable, so per the skill's own fallback an independent Opus
agent ran it. Tier 2 was Codex `gpt-5.6-sol` at `xhigh` (model read from config, smoke-tested
before use). Tier 2 was MANDATORY here on four separate triggers: domain math, a core API
contract, a schema migration, and delegated implementation.

Round 1 — Tier 1 returned **BLOCK**: 2 CRITICAL, 4 HIGH. Tier 2 independently returned 5 HIGH.
Both were real. De-duplicated and dispositioned:

  - **CRITICAL, fixed** — `backfill_history.py`'s `sys.path` guard was inverted for the
    container layout. Python puts the SCRIPT'S directory on `sys.path` for a path
    invocation, never the cwd, so `/srv` was unreachable exactly where `pwa_ml` sat.
    `docker compose up` died there, and `api` waits on `backfill` completing — the entire
    demo stack was dead on a clean bring-up. Reproduced in the real image before fixing.
  - **CRITICAL, fixed** — the predictive half went dark ~6 minutes after boot: one-shot
    backfill + `MAX_STALENESS_S=300` + `simulator` behind `profiles: ["sim"]`, so a plain
    `docker compose up` had no publisher. Profile removed; the comment in `main.py` claiming
    immunity to a stopped broker was false and is corrected.
  - **HIGH, fixed** (Tier 2) — `score_all` called `TwinHub.broadcast` from inside an
    `asyncio.to_thread` worker. `broadcast` ends in `asyncio.Event.set()`, which is not
    thread-safe: the frame is queued while an already-awaiting socket task stays asleep,
    missing exactly the 30s deadline item 3.3 is scored on. MY contract specified this.
    `score_all` now returns `ScoringResult(rows, events)`; `run_scoring_loop` broadcasts on
    the loop. The 3.3 test was rewritten to drive `run_scoring_loop` with a subscriber
    already awaiting and asyncio debug on — the old shape could not see the bug.
  - **HIGH, fixed** (both tiers) — LOCF admitted a confident 24-hour window from six
    readings. `_too_thin` adds bucket-coverage and per-signal-age guards.
  - **HIGH, fixed** — `scoreable_assets` shared `MAX_WORKLIST=200`, silently truncating a
    238-device fleet. Separate `MAX_SCOREABLE`, LIMIT in SQL, truncation logged.
  - **HIGH, fixed** (both tiers) — no per-asset containment: one poison device discarded the
    whole cycle, and deterministic ordering meant the next cycle died at the same device.
    `_score_one` contains failures per asset.
  - **HIGH, fixed** — two guards were untested with SURVIVING MUTANTS (the `nodata` skip and
    the recovery-transition edge, the only path that clears a red symbol off the twin).
  - **HIGH, fixed** — banding thresholds were copied literals while the docstring claimed
    they came from the model module. Now imported, with a test pinning the equality.

Rounds 2–4 — conservation took THREE attempts, each caught by Tier 2:
  1. delete by `run_id LIKE 'backfill-%'` — orphaned a dead letter's ledger row.
  2. delete by `message_id LIKE` — same hole, since `message_id` is wire-supplied for
     rejected messages too.
  3. `+ AND outcome = 'TELEMETRY'` — still wrong: an ACCEPTED message can forge the prefix,
     and the two DELETEs are separate statements under READ COMMITTED, so a message
     committing between them loses its ledger row while its telemetry row survives.
  Fixed properly by **`005_row_provenance.sql`**: a `source` column defaulting to `'MQTT'`,
  set by the writer and never by the payload. Wire messages cannot claim it however named.
  Lesson recorded: I twice fixed the symptom shown to me instead of the property that
  mattered — reasoning about who would plausibly send an id, not about what the schema
  guarantees.

Tier 1's re-review **stalled twice** on the agent watchdog and was NOT recorded as a pass.
Substituted per the ladder with a third Codex pass plus Claude's own verification. Flagged
here so the substitution is visible rather than implied.

### Flakiness — the 3× check earned its keep

`test_latency.py::test_latest_query_uses_the_index_and_does_not_scan` (guards scored item
1.3) failed ~1 run in 4. Attribution was MEASURED, not assumed: `main` is 4/4 clean, so the
regression was this slice's. Two wrong theories first — stale statistics (an `ANALYZE`-in-test
"fix" made it fail 4/4, disproving it) and fixture pollution (real, fixed, but not the cause;
collection is alphabetical so backfill rows do not exist yet when `test_latency` runs).
Root cause: S6's scoring loop starts whenever a pool and artifact exist — `MQTT_ENABLED=0`
does not disable it — so a `GROUP BY ... HAVING count(DISTINCT date_trunc('hour', ts))` over
24h of the hypertable ran every 10s against the database the latency test measures. The
harness now sets `SCORING_ENABLED=0`. A second failure mode surfaced underneath it: the
`purge_backfill` helper did not mirror the script's delete predicate, breaking conservation
for a whole session and surfacing three files away in `test_pipeline_e2e`. Both fixed;
5/5 clean afterwards.

Non-vacuity: `features.build_window` was written seams-first, so it has NO RED signal and is
**mutation-verified instead** — 5 mutations, each killed by its named test. The density guard
needed a 6th test: the first one passed with the coverage branch deleted because the
per-signal-age branch was killing it, so the two branches are now pinned independently. The
`__init__.py` bootstrap fix and the provenance fix are also mutation-verified. Recorded here
because a green suite is not evidence for code that never had a RED.

### Deferred, with owners (NOT silently dropped)

  - **MEDIUM — scoring load vs the item-1.3 latency budget.** `scoreable_assets` is an
    unindexable GROUP BY over 24h of a hypertable running every 10s, and it grows with the
    table (~432k rows/day at 5 Hz). Tier 2's verdict, asked directly: legitimate to isolate
    in the harness, "need not block this PR; must close before final item-1.3/demo
    acceptance." → **S-D (demo director)**: a scoring-enabled, full-Compose latency gate.
  - **LOW** — no `.dockerignore` now that the build context is the repo root
    (`api/.mypy_cache` alone is 58 MB); `health_asset_scored_idx` duplicates the existing
    PRIMARY KEY; `model.py:27` comment says "four parents" where the code is three.

### Verified by Claude, under Claude's own hand

ruff clean; mypy --strict clean (35 files); **152 tests passed, 5 consecutive runs, no
flakiness** (baseline was 100); every new export has a non-test import AND a runtime call
site; the image builds and `get_bundle("")` loads the artifact INSIDE the container
(`Ridge`, `pwa-health-pttf-v1`); and a clean-volume `docker compose up` was driven
end-to-end — 5 migrations applied, backfill exit 0 with 1800 rows, worklist ranked
28.3→96.0 monotonic with wear, PTTF ramping 0→505h, RCA naming vibration/bearing-temp/power,
feedback persisted with Thai text intact, `/docs` serving the verdict enum, conservation
`holds: true`.

---

## PR-6 — frontend foundation from Stitch (2026-07-29) [Mode A, **SL-3**]

Phase B of `docs/PR-PLAN.md`. Plan: `docs/DREP-PR6-foundation.md`.
Delegate: DeepSeek V4 Pro via `pi`, session `pr6-frontend-foundation`. **1 fix round.**

### Stop line: SL-3, chosen by the Q0–Q3 tree, not by feel

- **Q0** — no security/auth boundary, no tenant isolation, **no migration** (the curated
  API reads CSV; 001–005 exist and this PR adds none), no secrets, spec not fuzzy, every
  slice has an oracle → delegation permitted.
- **Q1 — YES.** `web/src/styles/globals.css` is the one genuinely hard piece: the hex→OKLCH
  conversion plus `light-dark()` *is* the token contract, and a silent error there
  invalidates the CVD-validated palette `design/tokens.map.md` certifies. Everything else
  is plumbing. → **SL-3.**
- Q2 was also YES (new routes, new exports, ≥2 files, crosses Python↔TS). Q1∧Q2 is still
  SL-3, which strictly includes the SL-2 seams.
- **Adaptation:** S1 SL-2 needed 3 rounds → S3/S5/S6 ran SL-3. This was additionally the
  delegate's first frontend slice. Torn → take the higher. It paid: **one** fix round.

**Claude authored:** `globals.css`, all 10 acceptance-test files, every type signature, all
wiring (nav registry, route tree, router, FastAPI middleware + router include, lifespan
store), and all infrastructure (compose, `.dockerignore`, `env.sample`, Dockerfile).
**Delegate authored:** the implementation bodies only — components, `lib/format.ts`,
`api/client.ts`, `mocks/extremes.ts`, `api/app/curated.py`, `api/app/routes/curated.py`.

### RED / mutation evidence

The token contract was written before its test (seams-first), so it has **no RED signal and
is mutation-verified instead** — 6 mutations, each killed by its named test: a 5% lightness
shift on `--primary`, deleting `color-scheme: light dark`, deleting `animation-duration`
from the reduced-motion block, dropping a font import, deleting `--anim-medium`, and adding
a dark media block that overrides a token.

**One mutation SURVIVED on the first pass and that is the point of doing it:** deleting
`color-scheme: light dark` left the suite green, because the assertion scanned the raw file
and matched the *explanatory comment* above the declaration. Every structural CSS assertion
now runs on comment-stripped text and requires the declaration inside `:root`. Prose is not
code. The same bug class had already bitten the `prefers-color-scheme` check.

The RED proof for T1 also caught a **broken harness rather than a real RED**: under vitest's
jsdom environment `import.meta.url` is not a `file:` URL, so `fileURLToPath` threw before a
single assertion ran — indistinguishable from a failing implementation. Paths now derive
from `process.cwd()`, with a `T0` guard that fails loudly if the cwd ever moves.

CORS middleware was also written before its test → mutation-verified (3 mutations: remove
the middleware, drop `Server-Timing` from `expose_headers`, switch to a wildcard).

### The test-isolation regression I introduced, found by running the gates properly

`test_cors.py` must re-import `app.main` (middleware attaches to the module-level singleton
at import time, so setting the env afterwards cannot reconfigure it). The first version
popped `app.main`/`app.config` from `sys.modules` and **never put them back**. Result:
`test_latency.py::test_latest_query_uses_the_index_and_does_not_scan` failed in the full
suite while passing in isolation — bisected by running the suite with each new file removed
(without them: 152 pass; with either alone: pass; with both: fail). Now a fixture snapshots
and restores `sys.modules`. Cross-file interference is indistinguishable from a real
regression, which is exactly why this was worth chasing rather than retrying.

### QCHECK — Tier 1 Claude, Tier 2 Codex `gpt-5.6-sol` @ xhigh. Verdict: **BLOCK**, 6 HIGH.

All fixed. The ones worth remembering:

- **`text-white` was an accessibility defect, not a style nit.** The delegate used Tailwind's
  built-in white on `--primary` and `--simulated` because **the token table had no *on-*
  colours**. Correct in light mode; in dark mode `--primary` is a light blue and
  `--simulated` a light violet, giving **2.55:1** and **2.72:1** — below AA, and invisible
  to anyone testing only in light mode. Fixed at the source: `--on-primary` and
  `--on-simulated` added to `design/tokens.map.md` (with measured ratios and a footnote
  explaining why they exist) and to `globals.css`. `tokens.test.ts` now fails on ANY
  built-in Tailwind palette utility, which literal-scanning could never see.
- **Motion tokens existed but were never used.** `transition-colors` silently takes
  Tailwind's 150ms default and `animate-pulse` is 2s. T12 only proved the tokens were
  *defined*. It now requires every file using a `transition*` utility to name an `--anim-*`
  token, and bans `duration-\d+` and `animate-*`.
- **`test_wildcard_is_never_configured` was vacuous.** It configured the *safe* origin and
  asserted `*` was absent — true by construction, and it would have passed while
  `CORS_ORIGINS=*` produced `allow_origins=["*"]` alongside `allow_credentials=True`.
  `Settings.cors_origin_list` now raises on `*`, and the test configures the dangerous value
  and asserts the refusal.
- **`getJson` called `fetch(path)`, bypassing `apiUrl`** — so `VITE_API_BASE` was honoured
  by the helper and ignored by every actual request. Took **three attempts to pin**: the
  obvious URL assertion is vacuous because with the shipped empty base `apiUrl(p) === p`,
  and a leading-slash-validation assertion also survived mutation once `apiUrl` moved out
  of the `try`. Only re-importing the module over a mocked config makes the broken and
  correct versions differ. Mutation-verified.
- **The `SIMULATED` badge was decorating every unbuilt placeholder.** That was *my* spec
  error, not the delegate's. A placeholder shows no values, so the marker's accessible claim
  ("this value is synthetic") is simply false — and three of those routes will later show
  REAL curated data. Removed; the `StatusChip kind="nodata"` stays, because it is true.
- Non-finite CSV volumes (`nan`/`inf`) flowed into roll-ups and would 500 on JSON
  serialisation → `math.isfinite` guard. `_normalise_month` accepted `2025-02-30` → real
  calendar validation. Equal-volume ranks depended on CSV row order → `branch_code`
  tie-break. `asChild` dropped everything but `className` → Radix `Slot`.

**Claude tail patch (attributed honestly):** `getJson` now resolves `apiUrl(path)` *outside*
its `try`, so a malformed path surfaces as `TypeError` instead of being re-reported as
`ApiError(0, …)` — "the network failed" sends a debugger to the wrong place.

### Environment defect worth knowing about

Under Node 26 + jsdom, undici's `Request` brand-checks `signal` and rejects jsdom's
`AbortSignal`. react-router 7 builds a `Request` on **every** navigation, so
`router.navigate()` threw internally and silently did nothing — verified with a minimal
two-route probe, so it is not specific to our routes. `web/src/test-setup.ts` carries a
narrowly-scoped `Request` shim with the reasoning. A browser has one realm and is unaffected;
no production code was changed to accommodate it.

### Deferred, with owners (NOT silently dropped)

- **Everything needing a real rendering engine** — computed contrast, focus-ring visibility,
  60-char truncation, skeleton geometry, FOUT, glyph coverage, and a live
  browser→proxy→FastAPI→WebSocket check. jsdom cannot see any of it. **Owner: PR-17**, which
  already owns the Playwright pass. Declared as a Non-Goal in DREP §1, and `a11y.test.tsx` /
  T18 state their limits in the file rather than implying more coverage than they have.
- **Shared `pwa_curated` package.** `api/app/curated.py` re-implements the CSV read because
  `api/app` and `simulator/app` are both top-level `app` packages and must never share an
  interpreter. Mitigated by a **drift test** that obtains the roster out-of-process and
  asserts both derive the same 234 branch codes. Owner: whichever PR next needs curated data
  server-side.
- **Declared seams with no runtime consumer yet:** `wsUrl`, `Num`, `Skeleton`, `formatMonthTh`,
  `mocks/extremes.ts`, `navItemByPath`, `CardFooter`. Tier 2 accepted this disposition. PR-7
  consumes `wsUrl` and `Num` on day one; `Num` in particular ships now *with its test* so no
  later screen can render a numeral without `tabular-nums`.
- CI still does not exist. `--admin` bypasses nothing today, but that is luck, not design.

### Verified by Claude, under Claude's own hand

`web`: **148 tests, 3 consecutive runs**, typecheck 0, eslint 0, `vite build` succeeds (fonts
bundled locally — no CDN). `api`: **193 tests, 3 consecutive runs** (baseline was 152), ruff
clean, mypy `--strict` clean across 39 files. Diff audit clean every round: acceptance tests
byte-identical, no Claude-owned seam touched, no fabricated/mocked/randomised data, no test
weakened or skipped, no out-of-tree writes.

Ground truth for the curated tests was **measured, not remembered**: 9 126 rows, 234 distinct
`branch_code`, 235 labels (one branch renamed), 39 months, regions 1–10, and a 2025-12 total
of **120 999 833.55 m³** — which is the figure printed on the Stitch mockup, so it is an
external anchor rather than a self-consistency check.

---

## PR-7a — digital-twin data chain (2026-07-29) [Mode A, **SL-3**]

Plan: `docs/DREP-PR7-twin.md`. Delegate: DeepSeek V4 Pro via `pi`, session `pr7a-twin-chain`.
**0 delegate fix rounds** (all review findings landed in Claude-owned files).

### The planning pass is what earned its keep here

My first PR-7 draft scoped the slice as "build the SVG twin screen". The Codex adversarial
pass killed it, and it was right: **the fatal gap was never the SVG, it was a missing runtime
identity chain** — `telemetry asset → topology node/pipe → WS event → impact query → rendered
pipe`. Three links did not exist:

1. **No device could be located on the schematic.** The roster publishes the demo pump as
   `P-2` (`simulator/app/roster.py:40`) while the topology seeded its node as `P2`
   (`scripts/seed_db.py`). No join returned anything, and nothing failed — there was simply
   no result. Neither `device` nor `pipe_edge` carried any coordinate either, so **scored
   item 2.1 had no ground truth at all**.
2. **Ingest cannot report an anomaly.** `_emit_twin_event` hardcodes `status="normal"` and
   discards `signal`/`value`, so a pump going critical is invisible to the twin.
3. **A pressure drop cannot name a pipe.** `TwinEvent` has no `pipe_id`, and the simulator
   has no `pressure_drop` mode.

Building the screen first would have produced a convincing picture wired to nothing — worse
than no screen under a judge's questions. **PR-7 therefore split into three**: 7a the data
chain (this), 7b the event chain, 7c the screen. Nothing was dropped; the split is landing
order, and `docs/DREP-PR7-twin.md` records which PR owns each scored item.

### What landed

`006_twin_topology.sql` (device node + x/y, pipe geometry, `pipe_edge(from_node)` and
`customer_service_point(node)` indexes, and `(asset_id, signal, ts DESC) INCLUDE (value)`);
the seed identity + geometry fix; `topology.py`; `latest_signal_pair`; and
`GET /api/twin/{topology,sec/{asset_id},impact/{pipe_id}}`.

**Claude:** the migration and the seed (Q0 — a migration is never delegated, and the seed
must agree with it), every test, all models and signatures, and all review fixes.
**Delegate:** the six function bodies.

### Mutation evidence

- **T1 (the identity defect)** was green when written, because Claude had already fixed the
  seed — so it was mutation-verified: re-orphaning the device's node from `pipe_edge` yields
  `assert [('P-2', 'P-2')] == []`, exactly the shape the original bug produced.
- **The seed upgrade path** — see below — mutation-verified against the `pipe_id`-only
  DELETE it replaced.
- **The SEC skew guard** — disabling it fails `test_widely_separated_readings_...`.

### QCHECK — Tier 1 Claude, Tier 2 Codex `gpt-5.6-sol` @ xhigh. Verdict **BLOCK**, 3 HIGH.

The HIGH that mattered was **mine, in the seed, and it only breaks upgraded volumes**:

> Re-seeding deleted retired edges with `WHERE dma='DMA-03' AND pipe_id <> ALL(...)`. The
> legacy rows share their `pipe_id` with the new ones (`PIPE-INTAKE`, `PIPE-P2-TANK`) and
> differ only in the node, so that filter **matched the new rows and missed the legacy
> ones** — which then survived with NULL geometry, and `float(None)` in `load_topology`
> would 500 `/api/twin/topology`. Fresh volumes were unaffected, so every test passed. The
> same statement would also have deleted any DMA-03 edge an operator added by hand.

Fixed by retiring an explicit list of exact `(pipe_id, from_node, to_node)` triples — a seed
may retire what it wrote, never what it does not own — and covered by
`test_reseed_retires_legacy_edges_and_keeps_operator_edges`, which stages a pre-S4a volume
plus an operator edge and is mutation-verified.

Also fixed: **the skew test did not test skew** (its hour-old reading exited through the
staleness guard first, so deleting the skew guard left it green — now a 200 s gap, inside
staleness and above the 120 s budget); and `load_topology`'s docstring promised a "latest
known status" the code does not read.

### Declared gaps (not silently dropped)

- **`/api/twin/topology` returns `status: "nodata"` for every device, permanently.** Nothing
  persists a per-device twin status yet — ingest still emits a hardcoded `normal`. That is
  **PR-7b**'s job. `nodata` is the honest answer to a question we cannot yet answer, and it
  must never default to `normal`: an unknown device must not render healthy in a control room.
- `MAX_TRAVERSAL_DEPTH` is defined but unused — `downstream_customers` loads the whole edge
  graph in one query, which is right for five edges and wrong for a large one. Owner: PR-7b.
- The EXPLAIN assertion accepts a plan containing one index scan; a multi-chunk plan with
  sequential-scan siblings would pass. Owner: PR-17, with the rest of the performance work.
- **The Stitch mockup shows "1,204 ราย" affected customers; the real topology has five.**
  `design/manifest.json` already flags S4 as `fabricated-values`. PR-7c must render the real
  count from `/api/twin/impact`.
- **Item 2.5 is not closed by any of 7a/7b/7c alone** — the checklist wants the source
  structure shown in the IDE, which is a demo action PR-17 owns.

### Verified by Claude, under Claude's own hand

`api`: **215 tests, 3 consecutive runs** (baseline 193 after PR-6), ruff clean, mypy
`--strict` clean across 42 files. Diff audit clean: the delegate touched only its three
files, no fabricated data, no test weakened. The delegate reported "1 pre-existing
`test_latency` failure" — **that was wrong; the full suite is green**, which is exactly why
the gates are re-run rather than trusted.

---

## PR-7b — digital-twin event chain (2026-07-30) [Mode A, mostly Claude / DeepSeek for the simulator]

Plan: `docs/DREP-PR7b-events.md`. Delegate: DeepSeek V4 Pro via `pi` (simulator slice only,
~10 lines). **1 delegate fix round (0; the simulator change was clean); Claude took 1 QCHECK
fix round covering a HIGH + 4 MEDIUM.**

The middle layer of the three-way PR-7 split: 7a gave the twin its data, 7b makes the live
channel carry the truth. Ingest published a hardcoded `status="normal"` and dropped the
reading; the hub coalesced by `asset_id` alone so a persistent pressure warning flickered.

### What landed
- `api/app/bands.py` + `classify_signal` — band-based status, drift-tested against BOTH the
  simulator's `SIGNAL_BANDS` and ingest's `VALID_SIGNALS` (so ingest can't accept a signal
  with no band → post-ack KeyError).
- `_emit_twin_event` now emits the reading's real signal/value/observed_at + classified
  status, threading the validated `Reading` via a private `_dispose` (no second decode; the
  public `dispose_message` enum contract is preserved). The emitter is explicitly total.
- `TwinHub` **two-tier buffer** — see below.
- `/api/twin/bands` so 7c distinguishes a pressure DROP from a spike without hardcoding.
- topology status from persisted health (deadlock-safe, scoring's own thresholds).
- simulator `FAULT_MODE=pressure_drop` — a **targeted** fault (non-pressure signals
  byte-identical to NORMAL), advertised in compose + env.sample.

### The planning pass earned its keep (twice), and so did QCHECK

The plan's first draft proposed a composite `(asset,kind,signal)` hub key; the **planning-pass
Codex** showed it weakened the per-asset capacity guarantee, so I **dropped the hub change**
and argued the frontend (7c) would hold per-signal state. **The QCHECK Codex proved that wrong**:
it reproduced a flash-red race a prompt client cannot fix — `scoring` (health) and `ingest`
(status) can both broadcast for one asset in a single event-loop turn, so `status:normal`
overwrote a pending `health:critical` **before the drainer woke**, and the client never
received the critical at all.

The resolution is the design BOTH Codex passes actually pointed at: a **two-tier buffer**,
`asset_id -> {(kind,signal) -> latest frame}`. Capacity still counts ASSETS (the 64-asset
guarantee and every verbatim `test_twin_ws.py` case survive), but within an asset a health
frame and each per-signal status frame coexist instead of clobbering. Mutation-verified:
collapsing the `(kind,signal)` key to a constant fails the flash-red test.

Lesson recorded: I under-scoped by trusting a design argument ("the frontend will handle it")
over a demonstrated race. The second adversarial pass is not redundant with the first.

### The test-isolation bug I introduced, found by the gates

`test_twin_status_emit` originally drove the full DB accept path, inserting P-2 telemetry
rows. That reliably broke `test_latency`'s index-seek assertion in the full suite (Timescale
autoanalyze flipped the planner onto the time-only chunk index) — 3/3 fail on my branch, 215/215
on main. Bisected file-by-file to that test. **Fix: the emitter's contract (classify +
broadcast) needs no DB, so the test now calls `_emit_twin_event` with a constructed `Reading`
and a real hub — zero DB churn.** The accept→emit wiring stays covered by the existing
`test_twin_emission.py`. After the rewrite: `test_latency` stable, full suite 243×3.

### QCHECK — Tier 1 Claude, Tier 2 Codex gpt-5.6-sol @ xhigh. Verdict BLOCK: 1 HIGH, 4 MEDIUM.
All fixed: HIGH (two-tier hub, above); pressure_drop made a targeted fault + equality test;
emitter totality now tested (exploding hub); T5b exercises the full `_next_message` wire path;
topology threshold test uses a warning-band score to pin the exact `pwa_ml.predict` constants;
observed_at asserted `== reading.ts` and `!= published_at`; finiteness asserted with
`math.isfinite`. Also updated `test_consumer_resilience` to patch the new `_dispose` seam
(same intent — the drain loop survives an escaping exception).

### Declared, carried to 7c (the wire contract 7c consumes)
- A device's symbol status = max severity across its live per-signal `status` frames AND its
  `health` frame; 7c keeps `Map<asset,{perSignal,health}>`.
- The affected pipe on a pressure event = the pipe whose `from_node` == the dropping device's
  `node`; 7c calls `/api/twin/impact` (and uses `/api/twin/bands` to confirm `value < low`).
- Render the REAL 5 affected customers, never the mockup's "1,204".
- Ingest band status reaches at most `warning` for the simulator's modes; `critical` comes
  from the scoring/health path. PR-17 must not claim these modes show `critical`.

### Verified by Claude, under Claude's own hand
`api` **243 tests, 3 consecutive runs** (baseline 215), ruff + mypy `--strict` clean (48 files);
`simulator` 48 tests, ruff + mypy clean. `TwinEvent`, conservation, DLQ, latency and every
existing twin/ws/scoring test green — the hub change preserves them verbatim. Diff audit clean;
the delegate touched only its two simulator files, no fabricated data.

---

## PR-7c — SVG digital-twin screen (2026-07-30) [Claude-authored, no delegate]

Plan: `docs/DREP-PR7c-screen.md`. The final layer of the PR-7 split: 7a data, 7b events, 7c the
screen. Scored items 2.1–2.5 (35 pts) become visible. Entirely Claude-authored: the WS
lifecycle, the zoom math, the drop→impact flow and the baseline merge are correctness-dense
enough that a delegate round would have cost more than it saved (Q1 across the whole slice).

### What landed
A twin feature module (`web/src/features/twin/`): `twin.config.ts` (the item-2.5 config file),
`types.ts` (mirroring the 7a/7b API exactly), `twinClient.ts` (pure reducers: deriveStatus,
isPressureDrop, outgoingPipes, zoomViewBox), `useTwinSocket.ts` (the live WS hook), and five
components — `ProcessSchematic` (SVG viewBox zoom), `DeviceSymbol` (status→shape), `PipeEdge`,
`SecTooltip`, `ImpactPanel`, `StatusCounters`. `OperationsTwinScreen` composes them; `routes.tsx`
gained a built→screen mapping (NAV_ITEMS stays the sole registry) and `nav.operations.built=true`.
`getJson`/`wsUrl` — declared orphans since PR-6 — finally have runtime callers. `formatDecimal`
added to `lib/format.ts` because `Num` renders a real SEC 0.25 as "0".

### Three adversarial passes; the QCHECK earned its keep again
The plan-review Codex corrected the API shapes (BandsResponse is nested), the control frames
(`disabled`/`busy`), and the `Num`-can't-do-decimals trap. The QCHECK Codex then found three
HIGH the plan-review missed, all real and all fixed + mutation-verified:
- **Generation ownership was per-mount, not per-socket** — a reconnect reused the mount
  generation, so a retained stale callback could still pass the ownership check. Fixed: bump the
  generation on every `connect()`. Test retains socket-1's handler across a reconnect and proves
  it's rejected. (Mutation: removing the per-connect bump fails it.)
- **A recovery missed while disconnected stayed critical forever** — the live health frame
  overrode the fresh topology baseline on reconnect. Fixed: the hook clears `byAsset` on reopen,
  so the screen resyncs from the refetched topology (persisted health).
- **Concurrent drops were selected by topology order, not recency** — a later drop never became
  active. Fixed: the screen picks the active drop by the pressure frame's `observed_at`. The
  first version of this test was VACUOUS (the impact stub returned the same affected set for
  every pipe); mutation caught it, and a pipe-specific stub now discriminates.

MEDIUMs also fixed: parseFrame validates event_version/status/signal/types; PipeEdge exposes its
affected state to assistive tech; a branching node's pipe_ids are deduped before impact requests;
`nodata` got its own symbol (a dashed ring) so all four statuses read without colour; the
SimulatedBadge is gated on the API `simulated` flags; `resyncPollMs` is now wired to a periodic
topology refetch.

### Declared limits (stated in-file, not pretended)
jsdom proves the reducers, the lifecycle, the drop→impact wiring and the structure/attributes;
it cannot prove visual zoom sharpness, the live browser→proxy→FastAPI flow, or real anomaly
rendering. Those, and item 2.5's "repo shown in the IDE", are **PR-17's Playwright pass**. The
affected-customer count is the API's real value (5 upstream / 2 for the last leg), never the
mockup's fabricated 1,204.

### Verified by Claude, under Claude's own hand
`web` **202 tests, 3 consecutive runs** (baseline 148), typecheck 0, eslint 0 (incl. the
React-Compiler-strict `set-state-in-effect`/`immutability`/`globals` rules — the effects were
restructured to derive from render and only setState in async callbacks), `vite build` succeeds,
token contract clean (no raw hex/palette/duration), axe clean on the loaded twin. Every existing
PR-6 test (router, a11y, tokens) stays green with the built screen wired in.
