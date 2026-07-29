# tokens.map.md — the token contract

**Hand-curated. This file, not `DESIGN.md`, is what `globals.css` and any implementer brief consume.**

Stitch returned its own `designMd` (`PWA Analytics Precision`) which *rewrote* several of the values we uploaded — `surface` came back `#f7f9ff` instead of our `#F7F9FB`, `primary` came back `#004a83` with our `#0F62A8` demoted to `primary-container`, and it added a full M3 tonal set we never asked for. That is exactly why this file exists. **Where Stitch and this file disagree, this file wins.**

## Colour

| Token | Light | Dark | Source | Note |
|---|---|---|---|---|
| `--surface` | `#F7F9FB` | `#0F1620` | authored | Stitch drifted to `#f7f9ff`; ours is correct |
| `--surface-container-lowest` | `#FFFFFF` | `#161E2A` | authored | card |
| `--surface-container` | `#EAF0F6` | `#1E2836` | authored | |
| `--on-surface` | `#101A24` | `#E8EEF5` | authored | ≥ 4.5:1 both modes |
| `--on-surface-variant` | `#44525F` | `#A9B7C5` | authored | |
| `--outline-variant` | `#C6D2DE` | `#2C3A49` | authored | 1px card border |
| `--primary` | `#0F62A8` | `#5EA8E6` | authored | Stitch demoted this to `primary-container` — **reject that** |
| `--secondary` | `#0E7C86` | `#4CC3CE` | authored | comparison series, AI card border |
| `--status-normal` | `#1E8E5A` | `#2FA36F` | **validated** | |
| `--status-warning` | `#B7791F` | `#CFA218` | **validated** ¹ | |
| `--status-critical` | `#B42318` | `#F2545B` | **validated** | |
| `--status-nodata` | `#8A97A3` | `#6B7A88` | authored | |
| `--simulated` | `#7C3AED` | `#A78BFA` | authored | **reserved — nothing else may use violet** |
| `--on-primary` | `#FFFFFF` | `#101A24` | **validated** ² | text/icons ON `--primary` |
| `--on-simulated` | `#FFFFFF` | `#101A24` | **validated** ² | text ON the SIMULATED pill |

Light status palette passed all six checks: worst adjacent ΔE **17.4** normal vision, all ≥ 3:1 on canvas.

² **Added 2026-07-29 (PR-6).** The original table had no *on-* colours, so the first implementation reached for Tailwind's `text-white` on both `--primary` and `--simulated`. That is correct in light mode and **broken in dark**: dark `--primary` is `#5EA8E6` and dark `--simulated` is `#A78BFA`, giving white contrast ratios of **2.55:1** and **2.72:1** — far below AA, and invisible to anyone testing only in light mode. Measured ratios for the tokens above: on-primary 6.30:1 light / 6.88:1 dark; on-simulated 5.70:1 light / 6.46:1 dark.

¹ **Documented exception.** Dark-mode warning `#CFA218` sits at L 0.734, above the validator's dark lightness ceiling (~0.70). Every alternative that dropped it into the band collapsed CVD separation against critical below the ΔE 8 floor — an intrinsic property of chromatic yellow, not a tuning failure. It ships **only** because status always carries an icon and a Thai text label, which is the required secondary encoding. If status ever renders as a bare colour swatch, this token is invalid.

## Sequential ramp (magnitude — maps, bars)

One hue, light → dark, monotonic lightness. Never categorical, never a rainbow — regions are compared by **size**, not identity.

| Step | Light | Dark |
|---|---|---|
| 1 | `#DCE9F6` | `#16324D` |
| 2 | `#A8C8E6` | `#1E4A73` |
| 3 | `#5B9BD5` | `#2E6FAF` |
| 4 | `#2E6FAF` | `#5B9BD5` |
| 5 | `#134B80` | `#A8C8E6` |

Steps 1–2 fall below 3:1 against the surface. That is **acceptable for a fill** but obligates a visible value label or a table view alongside — never a bare low-contrast fill as the only encoding.

## Tokens Stitch does not emit — authored here

Stitch produced no shadow, no motion, and no dark palette (`colorMode: LIGHT`). All three are required by `g-ui-component`. Authored:

| Token | Value |
|---|---|
| `--shadow-card` | `0 4px 20px -2px rgba(16,26,36,0.06)` |
| `--shadow-popover` | `0 10px 15px -3px rgba(16,26,36,0.10)` |
| `--anim-fast` | `150ms` |
| `--anim-medium` | `250ms` |
| `--anim-slow` | `400ms` |
| easing | `cubic-bezier(0.2, 0, 0, 1)` |

All transitions use a motion token. All are disabled under `@media (prefers-reduced-motion: reduce)`.

## Type & shape

`IBM Plex Sans Thai` throughout. Body line-height **1.55–1.65** for Thai ascenders. **No letter-spacing on Thai** — it breaks glyph clusters; the +0.06em label tracking is Latin-only.

Metric 34px/600 · headline 24px/600 · title 18px/600 · body 16px/400 · dense 14px/400 · label 12px/600.
`font-variant-numeric: tabular-nums` on **every** numeral. All numeric columns right-aligned.

Radius: cards `1rem` · buttons/inputs `0.75rem` · chips/badges `9999px`.
Spacing: 4px baseline · 24px gutter · 24px card padding · table cells 12px/16px · 1440px max.

## Rules for implementation

1. Raw hex in `src/` is a build failure. Every colour resolves through a token above.
2. Violet is reserved. Any violet outside a `SIMULATED` marker is a bug.
3. Status is never colour alone — icon + Thai label, always.
4. One y-axis per chart. Ever.
5. Do **not** read colours out of `design/DESIGN.md` or the Stitch HTML — both drifted from what we specified.
