# Visual review — Stitch output, 2026-07-28

Per `g-ui-component` Phase 6 step 5: screenshots reviewed by eye against the spec. No pixel assertions (`designFrozen: false`). Findings are ordered by severity.

## 1. Stitch fabricated data values — CRITICAL

Both prompts supplied exact figures from `data/curated/water_sold_by_branch.csv`. Grepping the returned HTML for those literals:

| Figure | Supplied for | Present in output |
|---|---|---|
| 120,999,834 | S1 national KPI | ✅ |
| 27,528,277 | S1 bar — เขต 1 | ✅ |
| 21,515,813 | S1 bar เขต 2 / S2 KPI | ✅ **S2 only** — S1 invented `23,390,442` |
| 17,291,147 | S1 bar — เขต 3 | ❌ invented `19,553,109` |
| 9,600,440 | S1 bar — เขต 4 | ❌ invented `15,221,880` |
| 4,037,328 | S2 table — รังสิต | ❌ invented `2,450,120` |
| 2,822,527 | S2 table — คลองหลวง | ❌ invented `1,890,450` |

**2 of 7 exact figures survived.** Stitch anchored the headline KPI on each screen and then generated plausible-looking numbers for everything below it.

**Consequence:** a Stitch mockup is a **layout** artifact, never a data artifact. No number may be read out of these PNGs or this HTML into the implementation, a proposal deck, or a slide. Numbers come from `data/curated/` only. If one of these mockups is shown to กปภ. without that caveat, it presents invented figures for a real utility — which is precisely the failure `POC_SPEC.md` §3.2 exists to prevent.

## 2. Roughly half of each spec was dropped — HIGH

Both screens end after Section B. Silently missing:

- **S1:** the 39-month national trend line (ผนวก ๕ §2.4), the AI situation card (§3), the Data Trust strip.
- **S2:** the branch comparison bars, the Step Test panel (ผนวก ๖ §4), the AI recommendation card (§3).

The prompts were long and single-shot. **Fix:** generate the skeleton, then add one section per `edit_screens` call — which is what the skill's "one concern per call" iteration protocol already says, and which I did not follow here.

## 3. Status rendered colour-only in the S2 table — HIGH

The `สถานะ` column renders as bare coloured dots. Both the prompt and the design system state that status always pairs an icon with a Thai text label. Stitch honoured this in the map legend and the KPI chip but not in the table. Violates WCAG 2.2 and the system's own rule. Must be corrected in implementation regardless of the mock.

## 4. GIS map is a placeholder — MEDIUM, expected

S1 renders a grey box captioned "GIS Map Placeholder (Thailand, 10 regions)". Stitch does not render choropleths. Not a defect — but it means the map, the single most load-bearing element of ผนวก ๕ §1, is unproven by the mock. Real coordinates for all 234 branches are already in `data/raw/pwa_offices.geojson`, so this is implementation work, not a design gap.

## 5. Screenshots are 512×410 thumbnails — LOW

The `screenshot.downloadUrl` returns a thumbnail, not the 2560×2048 render. The committed HTML **is** full fidelity. For proposal-quality images, render the HTML in a browser and screenshot at width, or export from the Stitch web UI.

## 6. Stitch rewrote the design system — MEDIUM, handled

The uploaded `DESIGN.md` came back altered: `surface` `#F7F9FB` → `#f7f9ff`, and `primary` `#0F62A8` demoted to `primary-container` with `#004a83` promoted in its place. It also injected a full M3 tonal set. Our status colours and the reserved violet survived intact. Handled by `tokens.map.md`, which is authoritative — this is exactly the drift that file was created to absorb.

## What worked

Layout structure, sidebar shell, breadcrumb, bento grid, KPI tile anatomy, `SIMULATED` pills (present and violet on every synthetic tile and in the table header), Thai rendering in IBM Plex Sans Thai, tabular numerals, right-aligned numerics, single-hue bars (no rainbow), and the status legend with icon + Thai label. The design system produced genuine consistency across both screens.

## Next

1. `edit_screens` on S1 and S2 to restore the dropped sections — one concern per call.
2. `edit_screens` on S2 to fix the status column to icon + label.
3. Generate S3 (Branch, ผนวก ๗) and S4 (Data Lineage, ผนวก ๒) — S4 is the competitive differentiator per `POC_SPEC.md` §4.
4. Populate `manifest.sourceUpdateTime` from `get_project`, then commit `design/`.
