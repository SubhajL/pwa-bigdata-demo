# Session handoff — 2026-07-29

Baseline: `main` @ **8697a2e**, local == `origin/main`, tree clean.
Remote: https://github.com/SubhajL/pwa-bigdata-demo (**public**).

Read this first, then `docs/PR-PLAN.md` for the build order and the relevant DREP
(`DREP-demo-poc.md` → `DREP-S1-S2.md` → `DREP-S3-S5.md`) for the slice you are picking up.

---

## 1. What is landed

| PR | Slice | Scored items | State |
|---|---|---|---|
| #1 | S1 — MQTT telemetry simulator | feeds 1.1 | merged `bd6ef82` |
| #2 | S2 — ingest → validate → DLQ → TSDB | **1.1, 1.2, 1.4, 1.5** (25) | merged `d55b8c2` |
| #3 | S3 — retrieval latency, DLQ browse, `WS /ws/twin` | **1.3** (5) | merged `d442812` |
| #4 | S5 — model, Health/PTTF/RCA, SEC | **3.1, 3.2, 3.6** (15) | merged `8697a2e` |

**Backend behaviour for 45 of the 100 points now exists and is tested.** Points are only
*scored* when a judge sees them, which is slice S-D's job (PR-17), not ours yet.

Gates on `main`: `api` 100 passed · `simulator` 42 passed · `ml` 45 passed + 3 skipped
(see §4) · ruff clean · mypy `--strict` clean across all three packages.

### Verified live, not only in tests

Full `docker compose` stack from a clean volume:

```
migrate → applied 001, 002, 003        seed → 238 devices, 4 pipes, 5 customers
147 published → 147 telemetry / 0 DLQ / ledger 147      conservation holds
FAULT_MODE=bad_asset → 58 dead letters, ingest continued
broker restart → RECOVERED in 1.7s (budget 30s), received kept climbing 570→579
WS /ws/twin → 5 frames (event_version=1)
GET /latest → mean 1.1ms (budget 500ms), Server-Timing: db;dur=0.13
model → health MAE 0.150 vs DummyRegressor 17.025; PTTF 31.2h vs 102.0h
```

---

## 2. Conventions this session established (keep these)

- **Lifecycle:** `g2-planning` → `g2-coding` (Mode A) → `g2-qcheck` → PR → `gh pr merge
  --squash --admin` → `git pull` on local `main`. One PR per slice.
- **Delegation:** DeepSeek V4 Pro via `pi` writes implementation bodies only. Claude owns
  recon, the contract, all acceptance tests, seams, gates, review, and every git command.
  The git/gh shim (`$SCRATCH/shim`) must be on `PATH` for every `pi` invocation.
- **Stop lines so far:** S1 SL-2 (3 fix rounds) → S3 SL-3 → S5 SL-3. The adaptation rule
  moved S3 up after S1 needed 3 rounds. **S6 should start at SL-3.**
- **Review:** Tier 1 Claude, Tier 2 Codex `gpt-5.6-sol` at `xhigh`, always in a background
  Bash with a Monitor. Reviews took 25–45 min each this session — launch them early and
  keep working.
- **Mutation testing is where the value was.** Every slice had at least one test that
  passed while the behaviour it named was broken. Do not skip it.

---

## 3. Open work, in the order the PR-PLAN wants it

### PR-5 (S6) — predictive API · items **3.3, 3.4, 3.5** (15 pts) ← next
`/api/worklist`, `POST /api/feedback` (must appear in Swagger and persist),
`/api/rca/{asset_id}`, plus `score_all` emitting a twin event within 30s of a health drop.

**Three things are already scoped to this PR and must land in it:**
1. **Serving the model from the API image.** The API container cannot see `ml/` and does
   not install its dependencies. Packaging is *decided* (`pwa_ml`; artifact + card from
   `python -m pwa_ml`); the Dockerfile/compose wiring was deliberately deferred here
   because this is the slice that adds inference routes. Prove it *inside* the container.
2. **The live feature-window contract.** `pwa_ml` trains on hourly windows; the simulator
   publishes ~1 message per asset per 47s at 5 Hz. Resampling, freshness, per-asset
   isolation and a missing-signal policy are undefined and belong with `score_all`.
3. **`infra/db/004_feedback.sql`** for the feedback table. Note the original DREP said
   `002_feedback.sql`; 002 and 003 are taken, so **use 004**.

`TwinEvent` already carries `health_score`, `pttf_hours`, `model_version` and
`event_version` — S3 widened it precisely so S6 would not need a breaking WS change.

### PR-6 — frontend foundation (Stitch)
Also owns **CORS + the Vite dev proxy**: `web/src/config/app.config.ts` has `wsTwin` as a
relative path and Vite has no proxy, so a browser on :5173 would send the WS to Vite, not
FastAPI. The API has no CORS middleware either. Nothing can connect until this lands.

### PR-7/8/9 — demo screens · topic ๒ is **35 unclaimed points** (items 2.1–2.5)
The largest single block still outstanding. PR-7 (the SVG twin) is where it lives.
`specific_energy_consumption` already exists in `pwa_ml.features` for item 2.3's tooltip.

### PR-17 (S-D) — the demo director
Owns everything judge-facing that was deliberately not faked earlier: browser-measured
latency with DevTools evidence, cold-start timing, a reconnect test with a long enough
outage to discriminate the backoff cap, and the rehearsed walkthrough.

### Unowned, worth doing early
**CI does not exist anywhere in the repo.** Every `--admin` merge so far bypassed zero
checks because there are none. Now that `origin` exists, a Docker-capable workflow
(TimescaleDB + Mosquitto services) is worth its own small PR — it would have caught the
1-in-7 flake noted below on someone else's machine, not just mine.

---

## 4. Known state a new session will trip over

- **`ml` shows 3 skipped.** `ml/artifacts/model.pkl` is git-ignored as a build output, so
  the shipped-artifact tests skip on a fresh clone with an actionable message. Run
  `cd ml && python -m pwa_ml`. The model *card* is committed, so the record of what was
  trained survives a clone. If item 3.1 should need zero steps at demo time, commit the
  3 KB pickle — a one-line `.gitignore` change.
- **numpy 2.2.1 on Apple Accelerate** emits `divide by zero` / `overflow` / `invalid
  value` from *every* matmul, reproduced on pure random data. Filtered in
  `ml/pyproject.toml` with that reasoning recorded; `test_every_prediction_is_finite`
  asserts the property positively instead. Do not chase these as a real bug.
- **A 1-in-7 flake appeared once** in the PR-3 suite and never reproduced in 15 further
  runs. Two live WS tests asserted after a fixed `sleep()` and were rewritten to poll. If
  it recurs, that theory is wrong — look at the reconnect and latency timing tests next.
- **OrbStack leaks host port proxies** after `compose down`. Host ports are now
  parameterised (`TSDB_PORT`, `MQTT_PORT`, `API_PORT`, `WEB_PORT`); pick a fresh one
  rather than fighting it.
- **`api/app` and `simulator/app` are both top-level `app` packages.** Never import the
  simulator's package inside an API test process — shell out instead (see
  `api/tests/conftest.py`). `ml` is `pwa_ml` precisely to avoid making this worse.
- **`pi` timed out once** mid-session (network was flaky: a `git fetch` and a `pip
  install` failed the same way). A single retry worked; the fallback ladder was not needed.

## 5. Accepted limitations, recorded not hidden

- No disk-backed durable spool. Messages survive a broker restart (durable session +
  persistence) and a DB outage (retry, then left unacked), but not simultaneous
  broker-and-process loss.
- DLQ paging is offset-based; it can drift under concurrent insert. Offset is capped.
  Keyset pagination when the browser gains filters.
- `latest_reading` has no chunk-exclusion predicate — fine at current data volume, revisit
  when history spans many Timescale chunks (owner: S-D, which sets the demo's data horizon).
- RCA is *local model attribution*, not causal root cause. The model card says so.
