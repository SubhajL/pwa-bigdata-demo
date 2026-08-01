#!/usr/bin/env python3
"""Derive web/src/features/national/officePoints.ts from data/raw/pwa_offices.geojson.

The national map (PR-10) plots the 234 REAL PWA branch offices. Rather than ship the 128 KB
GeoJSON to the browser, we emit a compact [region, lng, lat] literal. Re-run this if the source
GeoJSON changes:  python3 scripts/build_office_points.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "raw" / "pwa_offices.geojson"
OUT = ROOT / "web" / "src" / "features" / "national" / "officePoints.ts"

HEADER = '''/**
 * Real PWA branch-office locations (234 points) for the national map (PR-10).
 *
 * Derived once from data/raw/pwa_offices.geojson (regenerate with scripts/build_office_points.py
 * if the source changes). Each tuple is [region 1..10, lng, lat] — REAL PWA geography, never
 * simulated. Kept as a compact literal (not the 128KB GeoJSON) so the bundle stays small.
 */
export interface OfficePoint {
  readonly region: number;
  readonly lng: number;
  readonly lat: number;
}

/** [region, lng, lat] tuples — parsed by parseOfficePoints() into OfficePoint[]. */
export const OFFICE_POINT_TUPLES: ReadonlyArray<readonly [number, number, number]> = [
'''


def main() -> None:
    geo = json.loads(SRC.read_text(encoding="utf-8"))
    rows: list[tuple[int, float, float]] = []
    for feat in geo["features"]:
        region = feat["properties"].get("กปภ_เขต")
        coords = feat["geometry"].get("coordinates")
        if region is None or not coords or len(coords) != 2:
            continue
        r = int(round(float(region)))
        if not (1 <= r <= 10):
            continue
        rows.append((r, round(float(coords[0]), 5), round(float(coords[1]), 5)))

    lines = [HEADER]
    lines.extend(f"  [{r}, {lng}, {lat}],\n" for r, lng, lat in rows)
    lines.append("];\n")
    OUT.write_text("".join(lines), encoding="utf-8")
    print(f"wrote {len(rows)} points to {OUT.relative_to(ROOT)}")
    print("per-region:", dict(sorted(Counter(r for r, _, _ in rows).items())))


if __name__ == "__main__":
    main()
