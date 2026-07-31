import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { buildChartPath } from "./pipelineClient";
import type { ChartDims } from "./types";

export interface IngestRateChartProps {
  readonly rates: readonly number[];
}

const DIMS: ChartDims = { w: 320, h: 160, pad: 20 };

/**
 * Ingest-rate chart (item 1.1): a SINGLE-y-axis SVG polyline (stroke-secondary) via
 * buildChartPath, one vertex per rate, with a SimulatedBadge in the card header. Empty rates →
 * an explicit empty state. SEAM — fill against IngestRateChart.test.tsx.
 */
export function IngestRateChart({ rates }: IngestRateChartProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          อัตราการรับข้อมูล
          <SimulatedBadge />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rates.length === 0 ? (
          <div data-testid="chart-empty" className="flex h-[160px] items-center justify-center text-dense text-on-surface-variant">
            ไม่มีข้อมูลอัตราการรับส่ง
          </div>
        ) : (
          <svg
            role="img"
            aria-label="กราฟอัตราการรับข้อมูล"
            viewBox={`0 0 ${DIMS.w} ${DIMS.h}`}
            width="100%"
            height={DIMS.h}
            className="overflow-visible"
          >
            {buildYAxis(rates)}
            <path
              d={buildChartPath(rates, DIMS).d}
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

/** Pure helper: render exactly one y-axis group. */
function buildYAxis(rates: readonly number[]): JSX.Element {
  const geo = buildChartPath(rates, DIMS);
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
      <text
        x={geo.axis.x - 6}
        y={geo.axis.y0 + 4}
        textAnchor="end"
        className="fill-on-surface-variant text-[10px]"
      >
        {geo.max}
      </text>
      <text
        x={geo.axis.x - 6}
        y={geo.axis.y1 + 4}
        textAnchor="end"
        className="fill-on-surface-variant text-[10px]"
      >
        0
      </text>
    </g>
  );
}
