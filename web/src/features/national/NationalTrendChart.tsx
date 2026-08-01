import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildChartPath } from "@/features/pipeline/pipelineClient";
import type { ChartGeometry } from "@/features/pipeline/types";

import { NATIONAL_CONFIG } from "./national.config";
import type { NationalSeries } from "./types";

export interface NationalTrendChartProps {
  readonly series: NationalSeries;
}

const DIMS = NATIONAL_CONFIG.trendDims;

/**
 * The 39-month national water-sold trend (Stitch S1 §C — a section Stitch dropped, the source
 * requires). A SINGLE-y-axis SVG polyline via `buildChartPath`, reusing the pipeline chart
 * geometry. REAL data — so NO SimulatedBadge. Samples are scaled to millions of m³ so the axis
 * reads "121" not "120,999,834".
 */
export function NationalTrendChart({ series }: NationalTrendChartProps): JSX.Element {
  const samples = series.points.map((p) => p.total_m3 / 1_000_000);
  const geo = buildChartPath(samples, DIMS);
  return (
    <Card>
      <CardHeader>
        <CardTitle>แนวโน้มปริมาณจำหน่ายทั้งประเทศ (ล้าน ลบ.ม.)</CardTitle>
      </CardHeader>
      <CardContent>
        {samples.length === 0 ? (
          <div
            data-testid="trend-empty"
            className="flex h-[200px] items-center justify-center text-dense text-on-surface-variant"
          >
            ไม่มีข้อมูลแนวโน้ม
          </div>
        ) : (
          <svg
            role="img"
            aria-label="กราฟแนวโน้มปริมาณจำหน่ายน้ำทั้งประเทศ 39 เดือน"
            viewBox={`0 0 ${DIMS.w} ${DIMS.h}`}
            width="100%"
            height={DIMS.h}
            className="overflow-visible"
          >
            <TrendYAxis geo={geo} />
            <path
              d={geo.d}
              fill="none"
              className="stroke-secondary"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </CardContent>
    </Card>
  );
}

/** The single y-axis (one axis per chart): the vertical rule plus its max/0 labels. */
function TrendYAxis({ geo }: { readonly geo: ChartGeometry }): JSX.Element {
  return (
    <g data-testid="y-axis">
      <line
        x1={geo.axis.x}
        y1={geo.axis.y0}
        x2={geo.axis.x}
        y2={geo.axis.y1}
        className="stroke-on-surface-variant"
        strokeWidth={1}
      />
      <text x={geo.axis.x - 6} y={geo.axis.y0 + 4} textAnchor="end" className="fill-on-surface-variant text-[10px]">
        {geo.max}
      </text>
      <text x={geo.axis.x - 6} y={geo.axis.y1 + 4} textAnchor="end" className="fill-on-surface-variant text-[10px]">
        0
      </text>
    </g>
  );
}
