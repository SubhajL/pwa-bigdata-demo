/**
 * The GIS view's runtime configuration (PR-H) — the map-side counterpart of
 * `twin.config.ts`, so no source id, layer id, or tunable is buried in a component.
 *
 * Colours are NOT literals here (CLAUDE.md forbids raw hex): each entry names the CSS
 * custom property in `styles/globals.css` it resolves from at runtime, so the canvas
 * uses exactly the tokens the rest of the UI uses, in both light and dark.
 */
export const GIS_CONFIG = {
  /** MapLibre source id for the pipe network GeoJSON. */
  sourceId: "pipe-ry",
  /** The base linework layer (all pipes, REAL geometry). */
  lineLayerId: "pipe-ry-line",
  /** The highlight layer for the bound pipe during its asset's pressure drop. */
  highlightLayerId: "pipe-ry-highlight",

  /** MapLibre source + layers for the SIMULATED low-pressure footprint (PR-J). The footprint
   *  is encoded by a DASHED outline (non-colour) + a translucent fill — never a solid colour. */
  zoneSourceId: "mtp-lpz",
  zoneFillLayerId: "mtp-lpz-fill",
  zoneLineLayerId: "mtp-lpz-outline",
  zoneFillOpacity: 0.18,
  zoneLineWidth: 2,
  zoneDash: [2, 2],

  /** fitBounds padding (px) around the Map Ta Phut focus extent. */
  fitPadding: 48,
  /** Zoom ceiling: past this, sub-metre GPS noise reads as fake precision. */
  maxZoom: 17,

  lineWidth: 2,
  highlightWidth: 5,
  selectedWidth: 4,

  /** Design tokens the canvas paint resolves from (see `resolveCssColor`). */
  colorTokens: {
    background: "--color-surface-container-lowest",
    line: "--color-on-surface-variant",
    highlight: "--color-status-critical",
    selected: "--color-primary",
    /** The low-pressure footprint (warning). Non-colour encoding = dashed outline + fill. */
    zone: "--color-status-warning",
  },
} as const;
