# Coding Log — PR-D1 (Path D) · `/api/curated/trust` + national data-trust strip

Baseline `main` @ 84874d4. Branch `feat/pr-d1-curated-trust`. Lifecycle: g-coding. First Path D polish
item (documented follow-up "national data-trust strip + `/api/curated/trust`"). Full-stack.

## Scope
Certify on screen which national figures are REAL PWA data. A new read endpoint over the curated store
returning measured provenance, and a provenance band on the National dashboard — the HONEST counterpart
to the SIMULATED marker.

## Backend
`GET /api/curated/trust` → `CuratedTrust` (new model): `source`, `record_count` (9126 = 234×39, a
complete grid), `branch_count` (234), `region_count` (10), `month_count` (39), `first_month`/`last_month`
(2022-10 … 2025-12), `skipped_rows` (0). New `CuratedStore.trust()` counts every field from loaded data
(nothing synthesised); `store.source` set at load. Literal path — cannot collide with `/national` or
`/regions/{region}`; 503 when unmounted (shared `_store`).

## Frontend
`DataTrustStrip` — a compact green "ข้อมูลจริงของ กปภ." band at the top of National. REAL data → NO
SimulatedBadge. It fetches `/trust` on its OWN via `useOwnedAsync`, INDEPENDENTLY of the dashboard's
primary load, so neither a failure nor a hang of `/trust` can gate first paint (it just stays absent).

## Files
Backend: `api/app/models.py` (`CuratedTrust`), `api/app/curated.py` (`source` + `trust()`),
`api/app/routes/curated.py` (`/trust`), `api/tests/test_curated.py`. Frontend:
`web/src/features/national/{types.ts,nationalClient.ts,DataTrustStrip.tsx(+test)}`,
`web/src/screens/NationalExecutiveScreen.tsx(+test)`.

## Gates
Backend: `ruff` · `mypy` clean · `pytest` 43 curated (full suite 268) pass. Frontend: `typecheck` ·
`lint` clean · `pnpm test` 467 (3× no-flake) · `build` green. **Verified LIVE**: `GET /api/curated/trust`
→ `{source:"water_sold_by_branch.csv", record_count:9126, branch_count:234, region_count:10,
month_count:39, first_month:"2022-10", last_month:"2025-12", skipped_rows:0}`; national screenshot in
scratchpad shows the strip above the SIMULATED-badged KPI tiles (contrast: WATER SOLD + strip real, NRW
/ ENERGY simulated). (Live boot hit a leaked-port stale process — killed it; ran clean on :8010.)

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **SHIP**. No CRITICAL/HIGH. **M1 (MEDIUM) FIXED**: trust was fetched inside `useNational`'s task
— `.catch(()=>null)` neutralises a rejection but NOT a hang (`getJson` has no timeout), so a stalled
`/trust` would leave the dashboard skeleton forever, contradicting the stated guarantee. Refactored the
strip to fetch on its OWN (`useOwnedAsync`), fully decoupling it from the primary load; added a test that
the strip stays absent (and the page is not blanked) when the fetch fails. LOW/NIT also addressed: L1
`record_count` pinned to `234×39`; N1 frontend assertions made specific (`"10 เขต"`, not a `"2022-10"`
substring); L2 `/trust` added to the OpenAPI-declaration acceptance test; L3 `/trust` 503 asserted.
Honesty (inverted): the strip carries no SimulatedBadge and every number is measured — verified. Tier-2
Codex not run: the endpoint is a trivial in-memory count; no physics/security/contract-semantics risk
beyond what Tier-1 covered.
