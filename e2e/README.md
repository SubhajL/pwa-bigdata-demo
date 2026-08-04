# e2e — the 16-item score gate (Playwright)

Real-browser E2E over every scored ผนวก ๑๓ item, driven against the **live** compose stack. It is
the "score gate" of slice S-D: green here means a judge can see each scored behaviour.

## Run it

```bash
# one-time
make e2e-setup                       # installs Playwright + chromium

# every time
make demo-e2e                        # preflight the stack, then run all 16 items (resets the sim on exit)
# or, if the stack is already up:
cd e2e && pnpm test
cd e2e && pnpm test tests/topic1-pipeline.spec.ts   # one topic
cd e2e && pnpm report                # open the HTML report
```

Override the targets with `API_BASE` / `WEB_BASE` env vars (defaults `http://localhost:8000` and
`http://localhost:5173`).

## What it drives

- **Serialized** (`workers: 1`): the specs share one mutable simulator (`FAULT_MODE`) and one
  database. Specs use **delta counters** where residual state could mislead, and the scenario
  suite deliberately ENDS on `pressure_drop` — P-2 is left degraded, the warm state the later
  topic2/topic3 specs expect (the header of `scenario-transitions.spec.ts` explains why).
- Scenarios are the real mechanism, not fixtures: specs run `docker compose` directly to
  restart the broker (item 1.2) and switch `FAULT_MODE` (item 1.5), and drive the demo
  director over HTTP (`POST /api/demo/scenario`).

## Coverage

`tests/topic1-pipeline.spec.ts` (1.1–1.5), `topic2-twin.spec.ts` (2.1–2.5),
`topic3-predictive.spec.ts` (3.1–3.6 + a global SIMULATED-marker check), and
`scenario-transitions.spec.ts` (the PR #30 demo-director transitions) — see the trigger→evidence
mapping in `docs/demo-runbook.md`.

Twin items **2.2** (socket status update), **2.4** (pressure-drop impact panel), and the item-3.3
clock are proven as *timed live transitions* in `tests/scenario-transitions.spec.ts`: the demo
director (`POST /api/demo/scenario`) steers demo pump P-2 on cue. One unreloaded DOM observes the
band-stage `warning` then the model-path `critical`, polled against the 30 s budget measured from
the injection; a **second** unreloaded DOM observes the recovery back to `normal`; run-id
traceability is asserted API-side and on screen in a third spec. (P-2's backfill is tuned to score
`critical` pre-failure — PR-7 — and `pressure_drop` drives pressure below the 2.0 low band, so
both attributable stages are genuine band/model behaviour, not fixtures. Strict fail-past-30.000 s
enforcement for critical *and* recovery is planned hardening — roadmap PR-C.)
