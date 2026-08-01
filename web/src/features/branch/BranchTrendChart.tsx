import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { BRANCH_CONFIG } from "./branch.config";
import { buildBranchTrend } from "./branchClient";
import type { SeriesPoint } from "./types";

export interface BranchTrendChartProps {
  readonly points: readonly SeriesPoint[];
  /** REAL region median volume (m³) for the selected month — the dashed reference line. */
  readonly regionMedianM3: number | null;
}

const DIMS = BRANCH_CONFIG.trendDims;

/**
 * The branch's monthly water-sold trend (Stitch S3) with a REAL region-median reference line. A
 * SINGLE-y-axis SVG polyline via `buildBranchTrend`, which scales to the data's own max (so a small
 * branch is not squashed) and includes the median so a below-median branch's line still fits. REAL
 * data — no SimulatedBadge.
 */
export function BranchTrendChart({ points, regionMedianM3 }: BranchTrendChartProps): JSX.Element {
  const geo = buildBranchTrend(points, regionMedianM3, DIMS);
  return (
    <Card>
      <CardHeader>
        <CardTitle>แนวโน้มปริมาณจำหน่าย vs ค่ากลางเขต (ล้าน ลบ.ม.)</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <div data-testid="branch-trend-empty" className="flex h-[220px] items-center justify-center text-dense text-on-surface-variant">
            ไม่มีข้อมูลแนวโน้ม
          </div>
        ) : (
          <svg role="img" aria-label="กราฟแนวโน้มปริมาณจำหน่ายน้ำของสาขา" viewBox={`0 0 ${DIMS.w} ${DIMS.h}`} width="100%" height={DIMS.h} className="overflow-visible">
            <g data-testid="y-axis">
              <line x1={DIMS.pad} y1={DIMS.pad} x2={DIMS.pad} y2={DIMS.h - DIMS.pad} className="stroke-on-surface-variant" strokeWidth={1} />
              <text x={DIMS.pad - 6} y={DIMS.pad + 4} textAnchor="end" className="fill-on-surface-variant text-[10px]">
                {geo.maxMillion.toFixed(2)}
              </text>
              <text x={DIMS.pad - 6} y={DIMS.h - DIMS.pad + 4} textAnchor="end" className="fill-on-surface-variant text-[10px]">
                0
              </text>
            </g>
            {geo.medianY != null && (
              <line data-testid="median-line" x1={DIMS.pad} y1={geo.medianY} x2={DIMS.w - DIMS.pad} y2={geo.medianY} className="stroke-on-surface-variant" strokeWidth={1} strokeDasharray="4 3" />
            )}
            <path d={geo.d} fill="none" className="stroke-secondary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <p className="mt-2 text-label text-on-surface-variant">
          เส้นทึบ = ปริมาณจำหน่ายของสาขา · เส้นประ = ค่ากลางของเขต (ข้อมูลจริง)
        </p>
      </CardContent>
    </Card>
  );
}
