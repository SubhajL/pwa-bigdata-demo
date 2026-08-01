import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatM3 } from "@/lib/format";

import { NATIONAL_CONFIG } from "./national.config";
import { regionHref, regionLabelTh } from "./national.config";
import { regionMarks, type RegionMark } from "./nationalMap";
import type { RegionRollup } from "./types";

export interface OfficeRegionMapProps {
  readonly rollup: RegionRollup;
}

const DIMS = NATIONAL_CONFIG.mapDims;

/**
 * National office map (Stitch S1 §B). The 234 REAL PWA office locations, grouped into the ten
 * regions, each region a FOCUSABLE drill control (role="button", Enter/Space/click → regional
 * view, month preserved) whose accessible name carries the region and its REAL volume — status in
 * the NAME, not colour alone (INTERACTIONS.md). Shading is a single hue at an intensity set by the
 * region's REAL water-sold volume. An HONEST office-point map, not a fabricated choropleth: it has
 * no polygon boundaries and encodes only real data (real points, real volume). No SimulatedBadge.
 */
export function OfficeRegionMap({ rollup }: OfficeRegionMapProps): JSX.Element {
  const marks = regionMarks(rollup);
  return (
    <Card>
      <CardHeader>
        <CardTitle>แผนที่การกระจายเชิงพื้นที่ · ที่ตั้งสำนักงาน กปภ. รายเขต</CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          role="group"
          aria-label="แผนที่ที่ตั้งสำนักงาน กปภ. รายเขต ระบายสีตามปริมาณจำหน่ายจริง"
          viewBox={`0 0 ${DIMS.w} ${DIMS.h}`}
          width="100%"
          height={DIMS.h}
          className="mx-auto max-w-[360px]"
        >
          {marks.map((mark) => (
            <RegionGroup key={mark.region} mark={mark} month={rollup.month} />
          ))}
        </svg>
        <p className="mt-2 text-label text-on-surface-variant">
          จุด = ที่ตั้งสำนักงานจริง · ความเข้มของสี = ปริมาณจำหน่ายรายเขต (คลิกเพื่อดูรายสาขา)
        </p>
      </CardContent>
    </Card>
  );
}

/** One region: its office points, and a focusable drill control whose name carries the region and
 *  its real volume (status in the NAME, not colour alone). Enter/Space/click → regional view. */
function RegionGroup({ mark, month }: { readonly mark: RegionMark; readonly month: string }): JSX.Element {
  const navigate = useNavigate();
  const href = regionHref(mark.region, month);
  const label = `${regionLabelTh(mark.region)} · ${
    mark.volumeM3 != null ? formatM3(mark.volumeM3) : "ไม่มีข้อมูล"
  } · ดูรายสาขา`;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => navigate(href)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(href);
        }
      }}
    >
      {mark.offices.map((office, index) => (
        <circle key={index} cx={office.x} cy={office.y} r={3} className="fill-primary" fillOpacity={mark.fillOpacity} />
      ))}
    </g>
  );
}
