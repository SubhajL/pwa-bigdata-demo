# INTERACTIONS.md — behaviour the mockups cannot carry

Hand-written. A static Stitch screen specifies none of this, so absent this file an implementer invents it. Where a behaviour is not specified here, **stop and ask** — do not infer it from the screenshot.

## Drill-down (ผนวก ๕ §1.4, ผนวก ๖ §2.4)

The spine of the product. Three levels, one preserved context.

- **Month is global and sticky.** Selecting ธันวาคม 2568 at national level and clicking เขต 2 lands on the regional screen **still on ธันวาคม 2568**. Drilling never silently resets the period. Same on the way back up.
- **Click targets that drill:** a map region → regional; a league-table row (anywhere in the row, not just the name) → branch; a ranked bar → that region/branch. A KPI tile does **not** drill — it is a number, not a navigation control.
- **Breadcrumb is the only way back up.** No browser-back dependence. Each crumb is a link except the last.
- **URL carries state** — `?month=2025-12&region=2&branch=สิงห์บุรี`. A regional director must be able to paste a link into LINE and have a colleague see the identical screen. This is the single most-requested behaviour in Thai government dashboards and it is trivial to lose.
- **Drill-down is a route change, not a modal.** Modals cannot be linked, cannot be exported, cannot be projected in a meeting.

## Sorting & filtering (league table)

- Default sort: `water_sold_m3` descending. Rank column reflects the **default** sort and does not renumber when the user re-sorts — rank means "rank by volume", not "row position."
- Sort is single-column, tri-state: desc → asc → back to default. Indicator arrow in the header; `aria-sort` on the `th`.
- Sorting is client-side within the loaded region (≤ 30 branches). It never refetches.
- Filters live in **one row above** the table, never inside it. Changing a filter never repaints series colours — colour follows the entity, never its rank.

## Loading, empty, error, offline

Every data component implements all five. The mock shows only the full state.

| State | Behaviour |
|---|---|
| **Loading** | Skeleton matching final geometry — KPI tiles keep their height, table renders 8 skeleton rows. Never a centred spinner that collapses layout and shifts the page. |
| **Empty** | Thai message + Lucide icon + what to do. A region with no branches reporting reads "ไม่มีข้อมูลสำหรับเดือนนี้ · กรุณาเลือกเดือนอื่น", not a blank card. |
| **Error** | shadcn `Alert` with the 3-part formula — what happened · why · how to fix — plus a retry button. Example: "ไม่สามารถโหลดข้อมูลรายสาขาได้ · การเชื่อมต่อฐานข้อมูลหมดเวลา · กดลองใหม่อีกครั้ง". Never a bare "Error". |
| **Offline / stale** | Card keeps the last-known values, dims to 60%, and shows a "ข้อมูลไม่เป็นปัจจุบัน" badge with the timestamp of the data being shown. **Never** blank a KPI on connection loss — an executive reading a blank tile during a crisis assumes zero, not unknown. |
| **Overflow** | 235 branches at national level paginates at 50 with a total count. Never render 235 rows into the DOM unvirtualised. |

## The SIMULATED marker — non-negotiable

- Every synthetic value carries a violet `SIMULATED` pill. On a KPI tile: top-right. On a table column: in the `th`, not repeated per cell. On a whole card (Step Test): in the card header.
- The pill is **not** decorative and is never suppressed for density, on mobile, in export, or in print.
- Its `title`/`aria-label` reads "ข้อมูลจำลอง ไม่ใช่ข้อมูลจริงของ กปภ." so screen readers get it too.
- Removing a `SIMULATED` marker is a P0 defect, not a styling change.

## AI card

- Scripted text for the POC. The "ข้อความนี้เป็นสคริปต์ตัวอย่าง ไม่ใช่ LLM แบบเรียลไทม์" caption is **always** rendered — it is not a placeholder to delete before the demo.
- The recommendation line names a specific branch and a specific action. A recommendation with no named subject is not shipped.
- If a live LLM is wired later, the caption changes wording but a provenance line remains.

## Keyboard & a11y

- Tab order: sidebar → month selector → export → KPI row → map → table. Table rows are reachable and `Enter` drills.
- Map regions are focusable with `role="button"` and an accessible name ("กปภ.เขต 2, สถานะเฝ้าระวัง") — the status is in the **name**, not only the fill colour.
- `Esc` closes any popover and returns focus to its trigger.
- Focus ring: `focus-visible:ring-2 ring-ring ring-offset-2`. Never `outline: none` without a replacement.
- Sorting and drill-down announce via `aria-live="polite"`.

## Motion

- Hover/press feedback `--anim-fast`; route transitions `--anim-medium`. Nothing animates longer than `--anim-slow`.
- Numbers do **not** count up or animate on load. It looks impressive and makes a KPI unreadable for the first 800ms, which is most of the four seconds an executive has.
- All motion disabled under `prefers-reduced-motion: reduce`.

## Content extremes (must be handled, never shown in the mock)

0 branches · 1 branch · 235 branches · a 60-character branch name (must truncate with a tooltip, never wrap the row to two lines) · null customer count (renders "—", never `0` and never `NaN`) · Thai + Latin in the same cell · a branch reporting 0 m³ (legitimate, and must be distinguishable from missing).
