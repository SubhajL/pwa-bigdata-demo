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
  database. Scenario specs reset to `normal` and use **delta counters**, so residual state can't
  make a later spec pass or fail spuriously.
- Scenarios are the real mechanism, not fixtures: specs shell out to `scripts/demo-*.sh` /
  `docker compose` to restart the broker (item 1.2) and inject faults (item 1.5).

## Coverage & one honest caveat

`tests/topic1-pipeline.spec.ts` (1.1–1.5), `topic2-twin.spec.ts` (2.1–2.5),
`topic3-predictive.spec.ts` (3.1–3.6 + a global SIMULATED-marker check) — see the trigger→evidence
mapping in `docs/demo-runbook.md`.

Twin items **2.2** (socket status update) and **2.4** (pressure-drop impact panel) are asserted here
as *wired live surfaces / data paths*, not as timed live transitions: with the current seeded data
the demo pump P-2 sits at health ≈ 64 (warning) and the simulator's `pressure_drop` value stays
inside the twin's band, so no clean normal→critical transition occurs. That is a **demo-data tuning
owned by PR-7** (flagged in `docs/demo-runbook.md`); the socket push and impact panel themselves are
unit/integration-verified in `web/src/features/twin/useTwinSocket.test.tsx` and
`api/tests/test_twin_*.py`.
