---
name: PWA Analytics Design System
colors:
  surface: '#F7F9FB'
  surface-container-lowest: '#FFFFFF'
  surface-container-low: '#F2F6FA'
  surface-container: '#EAF0F6'
  surface-container-high: '#E1E9F2'
  on-surface: '#101A24'
  on-surface-variant: '#44525F'
  outline: '#6B7A88'
  outline-variant: '#C6D2DE'
  primary: '#0F62A8'
  on-primary: '#FFFFFF'
  primary-container: '#D6E7F7'
  on-primary-container: '#0A3D6B'
  secondary: '#0E7C86'
  on-secondary: '#FFFFFF'
  secondary-container: '#CFEDF0'
  on-secondary-container: '#08474D'
  status-normal: '#1E8E5A'
  status-warning: '#B7791F'
  status-critical: '#B42318'
  status-nodata: '#8A97A3'
  simulated: '#7C3AED'
  error: '#B42318'
  on-error: '#FFFFFF'
  error-container: '#FBE3E1'
  on-error-container: '#7A1710'
typography:
  display:
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline:
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  title:
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  metric:
    fontSize: 34px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  body-lg:
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.65'
  body-sm:
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.55'
  label:
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.06em
rounded:
  sm: 0.5rem
  DEFAULT: 0.75rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  grid_columns: '12'
  gutter: 24px
  container_max_width: 1440px
  base_unit: 4px
  card_padding: 24px
---

## Brand & Style

This design system serves the Provincial Waterworks Authority (การประปาส่วนภูมิภาค, กปภ.) — a Thai state enterprise supplying water to 5.7 million households through 235 branches in 10 regions. The audience is executives and engineers making operational decisions about a national utility, not consumers browsing.

The aesthetic is **Bloomberg Terminal restraint applied to civic infrastructure**: data-dense, calm, and unambiguous. Every pixel of chrome competes with a number that someone must act on. The emotional target is *trust under pressure* — a governor should be able to read the national picture in four seconds during a crisis, and an engineer should be able to sit in front of the same system for eight hours without fatigue.

Nothing decorative. No gradients on data surfaces, no drop shadows used as ornament, no illustration where a number will do.

## Colors

**PWA Blue (#0F62A8)** is the institutional anchor — used for primary actions, the active navigation state, and the sequential ramp that encodes magnitude on maps and bars. **Teal (#0E7C86)** is the secondary accent for comparison series and selected states.

**Canvas (#F7F9FB)** replaces pure white to reduce eye strain across long monitoring sessions; cards sit on pure white to lift from it. **Ink (#101A24)** carries body text at 4.5:1 or better.

Status uses exactly **three** states plus a no-data gray:

- **Normal #1E8E5A** · **Warning #B7791F** · **Critical #B42318** · **No data #8A97A3**

Three, not four. A four-step scale forced Serious (#C2410C) and Critical (#B42318) to ΔE 6.0 for normal vision — below the readability floor of 15 — so the fourth step was removed rather than shipped as a color two people would argue about. The surviving three were validated: worst adjacent pair ΔE 17.4 normal vision, all above 3:1 against canvas.

**Status is never conveyed by color alone.** Every status carries an icon and a text label. This is non-negotiable for the GIS map, where a colour-coded region is the primary signal.

**Violet #7C3AED is reserved exclusively for the SIMULATED marker.** It appears nowhere else in the system — not as a chart series, not as an accent. Any violet on screen means "this number is not real PWA data." That reservation is the whole point: in a competitive bid, a synthetic KPI mistaken for a real one is a misrepresentation, so the marker must be impossible to confuse with a data color.

Charts encode **magnitude with one blue hue, light to dark** — never a rainbow, never ten categorical hues for ten regions. Regions are compared by size, not identity, so a sequential ramp is correct and a categorical palette would be wrong.

## Typography

**IBM Plex Sans Thai** exclusively, for seamless Thai and Latin rendering — branch names are Thai, metric labels are often Latin, and they sit in the same table cell. Thai has taller ascenders and descenders than Latin, so line-height runs looser (1.55–1.65 for body) than a Latin-only system would use.

- **Metrics:** 34px SemiBold with `font-variant-numeric: tabular-nums`. Every KPI number is tabular so digits do not jitter when values update.
- **Body:** 16px for reading, 14px for dense tables.
- **Labels:** 12px SemiBold, uppercase, +0.06em tracking, for column headers and card eyebrows.

All numeric columns are monospaced-by-figure and right-aligned. Thai text never uses letter-spacing — it breaks glyph clusters.

## Layout & Spacing

A **12-column Bento Grid** on a 4px baseline with a 24px gutter and 1440px max width. Executive screens use large tiles (4–6 columns); regional and branch screens use denser 3-column tiles plus a full-width table.

Card padding is 24px; table cells 12px vertical, 16px horizontal. The KPI row is always the topmost band beneath the page header — an executive should never scroll to reach a strategic KPI.

## Elevation & Depth

Flat-plus. Depth comes from tonal layers first, shadow second:

1. **Surface tiers** — canvas background, white cards.
2. **Soft shadow** — `0 4px 20px -2px rgba(16, 26, 36, 0.06)` for cards; nothing heavier anywhere.
3. **1px outline-variant border** (#C6D2DE) on every card and input, so structure survives on the low-quality projectors these dashboards get shown on.

## Shapes

16px radius on bento cards; 12px on buttons, inputs, and table containers; pill radius reserved for status chips and badges so they never read as buttons.

## Components

Built on **shadcn/ui** primitives with Tailwind v4 tokens.

- **KPI tile:** 12px uppercase eyebrow label · 34px tabular metric · delta row with arrow icon, sign, and MoM/YoY label. Simulated tiles carry a violet `SIMULATED` pill top-right.
- **GIS map:** regions filled from the sequential blue ramp for volume, outlined in status color, each with a status icon pin. Click drills to the region.
- **League table:** zebra striping, sticky header, right-aligned tabular numerics, rank column, sortable, click-through row.
- **Trend chart:** single 2px line, recessive grid, dashed neutral reference line for target, crosshair tooltip. One y-axis only, never two.
- **AI summary box:** teal left border, robot icon, narrative + explicit "ข้อเสนอแนะ / Recommendation" line, and a label stating whether the text is live or scripted.
- **Data-trust strip:** rows ingested, rows quarantined, last refresh timestamp, and a link to the lineage screen.
- **Status chip:** dot + icon + Thai label, pill radius, tinted background at the container step.
