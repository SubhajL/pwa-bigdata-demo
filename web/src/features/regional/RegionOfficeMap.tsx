import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartDims } from "@/features/pipeline/types";
import { officeBounds, parseOfficePoints, projectOffice } from "@/features/national/nationalMap";

import { regionLabelTh } from "./regional.config";

export interface RegionOfficeMapProps {
  readonly region: number;
}

const DIMS: ChartDims = { w: 300, h: 300, pad: 16 };

/**
 * A thin map of ONE region's REAL PWA office locations (Stitch S2 §map). Reuses the national map's
 * geometry helpers, filtered to `region`, and zooms to that region's own bounds. Real coordinates
 * only — no fabricated per-office status (the source has no office→branch link, so a per-office NRW
 * would be invented); the branch-level status lives in the badged league table beside this. No
 * SimulatedBadge: office locations are real.
 */
export function RegionOfficeMap({ region }: RegionOfficeMapProps): JSX.Element {
  const points = parseOfficePoints().filter((p) => p.region === region);
  const bounds = officeBounds(points.length > 0 ? points : parseOfficePoints());
  return (
    <Card>
      <CardHeader>
        <CardTitle>แผนที่ {regionLabelTh(region)} · ที่ตั้งสำนักงาน</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p data-testid="region-map-empty" className="text-dense text-on-surface-variant">
            ไม่มีข้อมูลที่ตั้งสำนักงานสำหรับเขตนี้
          </p>
        ) : (
          <svg
            role="img"
            aria-label={`แผนที่ที่ตั้งสำนักงาน กปภ. ${regionLabelTh(region)} (${points.length} แห่ง)`}
            viewBox={`0 0 ${DIMS.w} ${DIMS.h}`}
            width="100%"
            height={DIMS.h}
            className="mx-auto max-w-[300px]"
          >
            {points.map((point, index) => {
              const projected = projectOffice(point, bounds, DIMS);
              return <circle key={index} cx={projected.x} cy={projected.y} r={4} className="fill-primary" fillOpacity={0.7} />;
            })}
          </svg>
        )}
        <p className="mt-2 text-label text-on-surface-variant">
          จุด = ที่ตั้งสำนักงานจริงในเขต ({points.length} แห่ง)
        </p>
      </CardContent>
    </Card>
  );
}
