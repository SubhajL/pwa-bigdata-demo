# POC Specification — PWA Big Data Analytics Executive Dashboard

**TOR:** โครงการยกระดับระบบวิเคราะห์ฐานข้อมูลขนาดใหญ่ เพื่อขับเคลื่อนการบริหารจัดการน้ำประปา
**Owner:** การประปาส่วนภูมิภาค (กปภ. / Provincial Waterworks Authority)
**e-GP announcement:** S60210000004 / 69069355199
**Budget:** ฿9,000,000 incl. VAT (FY2569) · **Duration:** 270 days · **Award:** 80% technical / 20% price, technical floor 70
**Spec date:** 2026-07-28

---

## 0. What this POC answers, and what happens to it

**The question:** *Can the four-level decision hierarchy the TOR demands (Executive → Regional → Branch → Operations) be driven from PWA's own data, with drill-down and data-lineage intact — and can we show it on real PWA numbers rather than invented ones?*

**Disposition:** `may-become-production`. Consequence, decided now rather than later: **we own the repo and the runtime.** No runtime-owning app builder (v0 / Lovable / Replit / Bolt) is eligible, regardless of speed. Design tooling (Stitch) supplies visual context only.

**Discard criterion:** if the POC does not clear §7 acceptance by the proposal deadline, it is archived, not shipped. A POC that survives by accident becomes production by accident.

---

## 1. TOR requirements this POC addresses

| TOR ref | Requirement | POC coverage |
|---|---|---|
| §2.1 | Executive Dashboard, single pane of glass | **Full** |
| §2.2 | Integrate SWMAP / DMAMA / OCS / SPM | **Substituted** — see §3.3 |
| §2.3 | Four decision levels: Executive / Regional / Branch / Operation | **3 of 4** — Operation/SCADA excluded, §6 |
| §2.4 | KPIs: Production, Distribution, NRW, Energy | **1 of 4 real** — Distribution only, §3.2 |
| ผนวก ๒ §1.3 | Connect to SWMAP, DMAMA, OCS, SPM | Substituted |
| ผนวก ๒ §2.1–2.4 | ETL, Data Flow Diagram, Metadata/Catalog, **Data Lineage** | **Full** — lineage is a first-class screen |
| ผนวก ๒ §3.1.4 | Data quality: accuracy, completeness, consistency | **Full** — on real defects, §3.4 |
| ผนวก ๒ §3.1.5 | Error Handling Log + Error Table | **Full** — `data/curated/_defects.csv` |
| ผนวก ๕ §1 | National GIS map, 10 regions, colour-coded | **Full** — real coordinates, §3.1 |
| ผนวก ๕ §1.4 | KPI drill-down Executive → Regional → Branch | **Full** |
| ผนวก ๕ §2.1 | Production & distribution vs target | Distribution real; production synthetic |
| ผนวก ๕ §2.2 | National NRW + economic loss value | **Synthetic**, labelled |
| ผนวก ๕ §2.4 | MoM / YoY comparison | **Full** — 39 real months |
| ผนวก ๕ §3 | LLM situation summary + recommendation | **Scripted**, not live — §6 |
| ผนวก ๕ §7 | Export to PDF/image | Out of scope for POC |
| ผนวก ๖ §2.1 | Inter-branch comparison within a region | **Full** |
| ผนวก ๖ §4 | Step Test history | **Synthetic**, labelled |

---

## 2. Users

| Level | Role | Primary question | Screen |
|---|---|---|---|
| Executive | ผู้ว่าการ / ผู้บริหารระดับสูง | "Where is the country in trouble this month?" | S1 |
| Regional | ผู้อำนวยการเขต (10 regions) | "Which of my branches needs help?" | S2 |
| Branch | ผู้จัดการสาขา (235 branches) | "What is my branch doing versus plan and versus peers?" | S3 |
| — | Data steward / System Admin | "Can I trust this number, and where did it come from?" | S4 |

Operations (หัวหน้างาน / SCADA) is **out of POC scope** — see §6.

---

## 3. Data foundation

### 3.1 What is real

All figures below were retrieved and profiled on 2026-07-28. Nothing here is illustrative.

| Source | Endpoint | Status | Content |
|---|---|---|---|
| PWA Open Data (CKAN) | `data.go.th/api/3/action/package_search?fq=organization:pwa` | **200, programmatic** | 10 datasets |
| ปริมาณน้ำจำหน่าย `d_c04_0072` | 40 monthly XLSX | **200** | Branch-level water sold |
| จำนวนผู้ใช้น้ำ `d_c05_011` | 5 annual XLSX | **200** | Customer counts FY2565–2569 |
| ที่ตั้งสำนักงาน `d-std-001` | GeoJSON | **200** | 234 branch coordinates |
| สรุปรายจังหวัด | `pwa.co.th/province/report` | **200** | 74 provinces, customer counts |

**Curated fact table** — `data/curated/water_sold_by_branch.csv`:

```
region | branch_code | province | branch | month | water_sold_m3
```

- **9,126 rows** · **39 months** (2022-10 → 2025-12) · **235 branches** · **10 regions** · **74 provinces**
- National December 2025: **120,999,834 m³**, **−2.0% YoY**
- Regional spread Dec-2025: เขต 1 highest at 27.5M m³ (22 branches) → เขต 7 lowest at 6.5M m³ (20 branches)
- Largest branch: สมุทรสาคร 5,496,137 m³ — 23× the branch median of 235,204 m³

This maps **exactly** onto the TOR hierarchy: `region` → เขต (Regional dashboard), `branch` → สาขา (Branch dashboard), roll-up → national (Executive dashboard). That correspondence is why this dataset was chosen over the alternatives in §3.5.

### 3.2 What is NOT real, and is labelled as such

Open data publishes **water sold** but not **water produced**. NRW is definitionally

```
NRW% = (produced − sold) / produced
```

so **NRW cannot be computed from open data** — the numerator input does not exist publicly. Same for energy cost and SCADA telemetry. (The numerator *does* exist behind DMAMA's `realtime_water_produce` endpoint — see §3.3; with credentials these rows flip to real.)

| Metric | Status | Rule |
|---|---|---|
| Water sold, customers, geography, MoM/YoY | **Real** | — |
| Water produced, NRW %, NRW economic loss | **Synthetic** | Must carry a `SIMULATED` badge in the UI |
| Energy cost, cost per m³ | **Synthetic** | Must carry a `SIMULATED` badge |
| SCADA pressure/flow, Step Test history | **Synthetic** | Must carry a `SIMULATED` badge |
| AI narrative | **Scripted** | Must be labelled as canned, not live LLM |

**Hard rule:** no screen may present a synthetic value without a visible `SIMULATED` marker. In a competitive bid, an unlabelled synthetic KPI shown to กปภ. is a misrepresentation. This is not a styling preference — it is the single most important constraint in this document.

### 3.3 On SWMAP / DMAMA / OCS / SPM

Reachability differs sharply by system — verified, not assumed (probed 2026-07-28):

- **SWMAP / OCS / SPM** — no external surface found. `reg2.pwa.co.th/opr/monthly_index.php` returns 200 but its data endpoints (`/pwa/operate/*`, `/pwa/krs/*`) **302 to login** and the report POST returns the form, not data; regions 1 and 3–10 don't expose it at all (**404**). `gdcatalog.go.th` is behind an **Imperva/Incapsula WAF**. Treat these as not reachable for the POC.
- **DMAMA — reachable and live** (`dmama.pwa.co.th`, `dmama2.pwa.co.th`). This corrects an earlier assumption that all four source systems were unreachable. DMAMA is a webpack SPA on nginx + PHP 7.3 fronting a **REST/JSON API**. It is **hard auth-walled** — every API call redirects unauthenticated requests to `/login`; six read endpoints were probed and **none leaked data**. That is the correct posture. But the API surface is fully enumerable from the client bundle, and it holds exactly the metrics open data lacks.

#### DMAMA endpoint inventory

Enumerated from the SPA bundle (`/app/static/js/app.*.js`). **None called successfully — all require auth.** Listed as the integration target for the production phase and as ผนวก ๒ evidence.

| Endpoint | Payload | Fills TOR gap |
|---|---|---|
| `GET /api/dashboard/realtime_water_produce` | **Water produced**, real-time | The missing NRW numerator (§3.2) — makes NRW *computable* |
| `GET /api/dashboard/waste` | Water-loss / NRW dashboard | ผนวก ๕ §2.2 NRW — currently `SIMULATED` |
| `GET /api/dashboard/MNF_grid/get_summarize` | Minimum Night Flow summary | ผนวก ๖ §4 Step Test / active leak detection |
| `GET /api/analysis/mnf/get_by_devices`, `/get_by_time`, `/get_line_graph` | MNF analysis series | ผนวก ๖ §4, ผนวก ๗ §4 |
| `GET /api/analysis/normal/get_summarize`, `/api/analysis/graph` | Aggregated analysis | KPI + trend charts |
| `GET /api/agg_data/1m` | 1-month aggregated time series | National/regional trend |
| `GET /api/branches`, `/api/branches/by/parent/`, `/api/districts/tree`, `/api/feeders/with/branches` | Org hierarchy | Executive → Regional → Branch drill-down spine |
| `GET /api/gis/detail/logger`, `/api/device_selector/` | DMA logger GIS + device metadata | Real map (ผนวก ๕ §1) replacing the synthetic coordinates |
| `GET /api/dashboard/realtime_grid/get_bar_graph` | Real-time production grid | Live monitoring |

**Auth contract** (mapped, not exercised): `POST /api/login` with `{username, password, accept}` → HttpOnly session cookie (`cookiesession1`) + JWT `Authorization: Bearer`. This is the shared PWA identity (SSO/AD) the TOR references — supports the SSO proposal angle.

**Upstream ecosystem** referenced by the DMAMA bundle — the integration map ผนวก ๒ asks a bidder to design, now evidenced rather than guessed: `nrwms.pwa.co.th` (NRW management), `dmacontrol.pwa.co.th` (DMA control / WLC), `gisweb1.pwa.co.th/meterstat` (meter statistics), `scadamc.pwa.co.th` (SCADA), and per-node InfluxDB report APIs at `dmama1/dmama2.pwa.co.th/api/report/influx`.

**Security observation for the proposal** (PWA's exposure, to raise tactfully in the security-assessment section, not ours to exploit): the DMAMA app page ships a live **Google Maps JS API key** in plaintext HTML.

#### Consequence for the POC

- **Without DMAMA credentials** (current state): the POC treats PWA Open Data as a stand-in source and proves the *integration pattern* — ingest → validate → quarantine → curate → serve, with lineage — which is what ผนวก ๒ actually requires. NRW, energy, and Step Test stay `SIMULATED` per §3.2. Say this plainly in the proposal; do not imply we connected to DMAMA or SWMAP.
- **With DMAMA credentials**: `realtime_water_produce` + `waste` + `MNF_grid` convert NRW, NRW economic loss, and Step Test history from `SIMULATED` to **real**, and `gis/detail/logger` replaces the synthetic map coordinates. That is the difference between a mockup-grade POC and one running on genuine loss data — a direct competitive edge. This is a connector swap, not an architecture change; the ingest → curate → serve spine is identical either way.

### 3.4 Real defects found (the data-quality demo writes itself)

Both were found in production open data, not manufactured:

| Defect | Evidence | Impact if ingested naïvely |
|---|---|---|
| **Orphan grand-total row** | One file contains `region=NULL, branch=NULL, month=NULL, volume=124,652,359.33` | ≈ the entire national monthly total. Treated as a branch, it **doubles** national volume |
| **Duplicate month** | 2023-01 published twice across two resources — 234 branch rows, byte-identical | **Double-counts** January 2023 |

Both are logged to `data/curated/_defects.csv` (the ผนวก ๒ §3.1.5 Error Table) and excluded from the curated fact table. The dashboard surfaces the count, so the reviewer sees quality control working on real data rather than a slide claiming it exists.

Secondary finding worth mentioning in the proposal: the national GeoJSON is encoded **TIS-620/CP874, not UTF-8** — Thai branch names arrive as mojibake unless the extractor declares the codec. A concrete, checkable example of why ผนวก ๒ §1.2 (technical integration standards) is not boilerplate.

### 3.5 Alternatives considered and rejected

| Candidate | Why rejected |
|---|---|
| `reg2.pwa.co.th` operational reports | Richest KPI set (NRW rate, revenue, EBITDA, 5-year history) but **auth-gated**, and only 1 of 10 regions exists |
| `pwa.co.th/province/report` | Reachable, but production/distribution columns are **0 for 72 of 74 provinces** — customer counts only |
| `gdcatalog.go.th` | WAF-blocked |
| PWA GIS layers (`pwagis.pwa.co.th`) | Mostly **fee-based**; only office locations are free |

---

## 4. Screens

Four screens. Each maps to a TOR appendix; none is decorative.

### S1 — Executive (ผนวก ๕)
- **GIS map**, 10 regions, colour-coded by status, from real branch coordinates. Click a region → S2.
- **Strategic KPI row**: national water sold (real) · NRW % (`SIMULATED`) · energy cost (`SIMULATED`) · cost per m³ (`SIMULATED`), each with MoM and YoY delta.
- **39-month national trend**, real, with target overlay.
- **AI situation box** — scripted narrative + recommendation, labelled.
- **Data-trust strip**: rows ingested, rows quarantined, last refresh, link to S4.

### S2 — Regional (ผนวก ๖)
- Region-filtered map with Warning/Critical pins.
- **Branch league table** — the core of ผนวก ๖ §2.1: sortable, 20–30 branches, water sold, MoM, YoY, NRW (`SIMULATED`), rank.
- Branch-vs-branch comparison chart.
- Step Test history panel (`SIMULATED`).
- Click a branch → S3.

### S3 — Branch (ผนวก ๗)
- Branch header: name, province, region, customer count.
- Monthly trend vs regional median vs national median — all real.
- Peer percentile within region — real.
- Predictive band (`SIMULATED`).

### S4 — Data Lineage & Quality (ผนวก ๒ §2.4, §3.1.4–3.1.5)
- Source → extract → validate → quarantine → curate → serve, as a diagram.
- **Error Table**: the two real defects, with source file, rule violated, action taken.
- Freshness and completeness per source.
- This screen is the differentiator. Most bidders will show dashboards; few will show *why the number is trustworthy*, which is what ผนวก ๒ §2.4 explicitly demands.

---

## 5. KPI definitions

| KPI | Formula | Source | Real? |
|---|---|---|---|
| Water sold | `Σ water_sold_m3` at level | curated fact table | ✅ |
| MoM | `(m − m₋₁) / m₋₁` | derived | ✅ |
| YoY | `(m − m₋₁₂) / m₋₁₂` | derived | ✅ |
| Branch rank | `rank(water_sold_m3)` within region-month | derived | ✅ |
| Customers | latest FY count | `d_c05_011` | ✅ |
| Consumption/customer | `water_sold_m3 / customers` | derived | ✅ |
| NRW % | `(produced − sold) / produced` | **no public `produced`** | ❌ `SIMULATED` |
| NRW economic loss | `NRW m³ × tariff` | depends on NRW | ❌ `SIMULATED` |
| Energy cost, cost/m³ | — | not published | ❌ `SIMULATED` |

Reference for the trend line: **December 2025 national = 120,999,834 m³, −2.0% YoY.** Any build that renders a different national figure for that month is wrong, and that is the cheapest available correctness check.

---

## 6. Non-goals

> **Reframed 2026-07-28 after ผนวก ๑๓ (the scored demo) was supplied.** The earlier
> version of this list treated the Operations/SCADA screen and MLOps as non-goals.
> That was wrong: **they are the scored demo** (§4A). Corrected below.

Still out of scope for the POC:

1. **Live LLM** — AI text is scripted (the S9 assistant is a proposal illustration, not a demo item).
2. **Real SWMAP/OCS/SPM connectivity** — no external surface (§3.3). DMAMA is reachable but auth-gated.
3. **Auth/RBAC, report builder (ผนวก ๑๐), notification center (ผนวก ๑๑), PDF export, drag-and-drop layout** — proposal-narrative screens (S5–S7, S9); **none are scored in the demo**, so they are the *lowest* build priority.
4. **Production infrastructure (ผนวก ๑), vector DB / RAG (ผนวก ๒ §3.3), AI-server hardware (ผนวก ๑๒).**

**Moved INTO scope** (they score points in §4A, and no longer count as non-goals):
- Operations/SCADA **digital twin** (ผนวก ๘) — demo topic ๒, 35 pts.
- Real-time **data pipeline** MQTT→DLQ→time-series (ผนวก ๒) — demo topic ๑, 35 pts.
- **Predictive-maintenance model** (ผนวก ๓ + ผนวก ๔ §1) — demo topic ๓, 30 pts.

---

## 4A. Technical Demonstration — the scored 100 points (ผนวก ๑๓)

**This is how the bid is won.** Award = 80% technical / 20% price; the technical score is a **live demonstration** of 100 points across 3 topics, floor 70 to pass. **Every one of the 16 scored checklist items requires running software** — a Stitch mockup demonstrates none of them. The screen mockups (§4) serve the *written* technical proposal; this section is the *functional* target.

### Topic ๑ — Real-time Data Pipeline · 35 pts

| # | Checklist item | Pts | Demo artifact |
|---|---|---|---|
| 1.1 | Connect to simulated **MQTT broker**, continuous ingest | 5 | Broker (mosquitto) + subscriber service |
| 1.2 | **Auto-reconnect ≤ 30s** on connection drop | 5 | Reconnect loop + live status indicator |
| 1.3 | **Response time ≤ 500ms avg**, shown in DevTools/Network Monitor | 5 | Measured live on a real endpoint |
| 1.4 | Write to **time-series DB** + correct historical retrieval | 10 | InfluxDB/TimescaleDB + range query |
| 1.5 | Bad **Asset ID → DLQ** automatically, main flow uninterrupted | 10 | Validation + dead-letter queue + error table |

### Topic ๒ — Real-time Digital Schematic (Twin) · 35 pts

| # | Checklist item | Pts | Demo artifact |
|---|---|---|---|
| 2.1 | **SVG/Canvas** schematic, zoom without resolution loss | 5 | Vector twin component |
| 2.2 | Device status **auto-updates** without manual refresh | 5 | WebSocket / SSE push |
| 2.3 | Pump anomaly → symbol state change + **Specific Energy Consumption** tooltip from real data | 10 | Live twin + SEC = kWh/m³ calc |
| 2.4 | Pressure drop → **highlight pipe** + auto-list **affected customers** | 10 | Twin + pipe topology + customer join |
| 2.5 | **Source-code structure** on screen: config file + ≥ 3 components | 5 | The repo, shown in the IDE |

### Topic ๓ — AI Predictive Maintenance · 30 pts

| # | Checklist item | Pts | Demo artifact |
|---|---|---|---|
| 3.1 | **Trained model file** + algorithm name + key parameters | 5 | Serialized model (e.g. `.pkl`/`.onnx`) |
| 3.2 | **Health Score** & **PTTF** change across ≥ 2 datasets | 5 | Inference on two input sets |
| 3.3 | Health < threshold → twin symbol changes **≤ 30s** | 5 | Model → twin event integration |
| 3.4 | **Feedback Loop API** via Postman/Swagger, accepts real input | 5 | Live endpoint + OpenAPI/Swagger UI |
| 3.5 | **Prioritized Worklist** from processing | 5 | Ranked equipment list |
| 3.6 | **Root Cause Analysis** from the AI model | 5 | RCA output per anomaly |

### Consequence for this repo

- The **demo-critical build** is three running pieces: a **pipeline** (topic ๑), a **digital twin** (topic ๒), a **predictive-maintenance model + feedback API** (topic ๓). These are the only things that score.
- The demo can run on **simulated MQTT telemetry** — ผนวก ๑๓ says "MQTT Broker **จำลอง**" (simulated). We do **not** need live SCADA; we need a broker publishing realistic device data. Curated real branch data (§3.1) seeds the device roster and geography; SCADA-grade signals (pressure, pump kW) are `SIMULATED` per §3.2 — which is honest and demo-legal because ผนวก ๑๓ itself specifies a simulated feed.
- Screen mockups map to demo topics as **design targets only**: S4 (twin) ↔ topic ๒, S8 (pipeline monitor) ↔ topic ๑, S10 (predictive) ↔ topic ๓. Everything behind them must be code to score.

---

## 7. Acceptance criteria

The POC is done when **all** hold:

1. S1–S4 render from `data/curated/water_sold_by_branch.csv` — no hardcoded KPI numbers in components.
2. National Dec-2025 renders as **120,999,834 m³** and YoY as **−2.0%**.
3. Executive → Regional → Branch drill-down works by click, preserving month context.
4. **Every** synthetic value carries a visible `SIMULATED` badge. Zero exceptions.
5. S4 lists both real defects with source file and action.
6. Empty / loading / error / offline / overflow states exist for every data component.
7. Content extremes pass: 0 branches, 1 branch, 235 branches, 60-char branch name, null customer count, Thai+Latin mixed script.
8. `axe-core` clean; `eslint-plugin-jsx-a11y` clean; WCAG 2.2 AA contrast verified.
9. Typecheck, lint, test, build all pass; tests pass 3 consecutive runs.
10. Token discipline gate clean — no raw hex, hardcoded ms, or box-shadow in `src/`.
11. Renders correctly at sm / md / lg / xl.
12. Thai renders correctly — IBM Plex Sans Thai, correct line-height, no tofu.

**Criteria 1–12 above cover the mockup/dashboard deliverable (the written proposal).** They do **not** pass the scored demo. The demo acceptance is separate and dominant:

13. **§4A demo readiness** — the three functional pieces run and satisfy their checklist items: pipeline (MQTT→DLQ→TSDB, ≤500ms, ≤30s reconnect), digital twin (live SVG, SEC tooltip, pressure→affected-customers), predictive model (Health/PTTF, ≤30s twin update, Swagger feedback API, worklist, RCA). This is the criterion that scores 80% of the award; criteria 1–12 do not substitute for it.

---

## 8. Design & delivery process

Per `g-ui-component` (revised 2026-07-28):

1. Stitch design system → applied to every screen instance (consistency is enforced at generation; no comparison tool exists to catch drift afterwards).
2. `design-sync.md` → `design/DESIGN.md`, `design/screens/*.png`, `design/manifest.json`, **committed**.
3. `design/tokens.map.md` — hand-curated M3-hex → OKLCH, with dark palette, shadow and motion tokens authored explicitly, since Stitch emits none of those.
4. `design/INTERACTIONS.md` — hand-written drill-down, filter, and error semantics. A static mock carries none of this.
5. Implementation via `g2-planning` → `g2-coding` → `g2-qcheck`.

**No pixel-baseline visual assertions while `designFrozen: false`.** Screenshots are review artifacts.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Reviewer mistakes synthetic NRW for real | `SIMULATED` badge everywhere + explicit slide; §3.2 is a hard gate |
| Open data updates mid-build and figures shift | Curated CSV is committed and pinned; refresh is deliberate |
| "You didn't connect to the source systems" | SWMAP/OCS/SPM not externally reachable; DMAMA reachable but auth-gated (§3.3). We prove the *pattern*; the DMAMA connector swaps in once credentialed |
| DMAMA credentials arrive late / not at all | Architecture is connector-agnostic — open-data path ships regardless; DMAMA endpoints (§3.3) are wired the moment a login is available, flipping NRW real |
| **Building mockups instead of the scored demo** | The 100 demo points (§4A) are all functional software; mockups score 0 there. Demo-critical build (pipeline / twin / predictive) is prioritized over proposal-only screens (S5–S7, S9) |
| Demo requires live SCADA we don't have | ผนวก ๑๓ specifies a **simulated** MQTT broker — a seeded telemetry generator is compliant, not a shortcut. Real branch roster + geography (§3.1) make it credible |
| Twin needs pipe topology + customer→pipe mapping we lack | Topology and customer-to-pipe assignment are `SIMULATED` over the real branch/DMA roster; flagged per §3.2. Sufficient for the demo scenario, labelled honestly |
| Thai typography breaks layout | IBM Plex Sans Thai from the start; Thai+Latin in the extremes fixtures |
| POC drifts into production | §0 disposition and discard criterion |
