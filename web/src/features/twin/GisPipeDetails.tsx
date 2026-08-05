import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DASH } from "@/lib/format";

import type { GisLineFeature, GisPropertyValue } from "./types";

export interface GisPipeDetailsProps {
  /** The clicked map feature, or null before any selection. */
  readonly feature: GisLineFeature | null;
  /** The manifest's demo-bound pipe id, so the SIMULATED attachment is said in place. */
  readonly boundPipeId: number;
}

const ROWS: ReadonlyArray<{ key: string; label: string; unit?: string }> = [
  { key: "pipe_id", label: "รหัสท่อ (PIPE_ID)" },
  { key: "pipe_type", label: "ชนิดท่อ" },
  { key: "grade", label: "เกรด" },
  { key: "size_mm", label: "ขนาด", unit: "มม." },
  { key: "pipe_class", label: "ชั้นแรงดัน" },
  { key: "length_m", label: "ความยาว", unit: "ม." },
  { key: "year_installed", label: "ปีที่วางท่อ (พ.ศ.)" },
  { key: "location", label: "ตำแหน่ง" },
  { key: "project_name", label: "โครงการ" },
  { key: "asset_code", label: "รหัสทรัพย์สิน" },
  { key: "pwa_code", label: "รหัสสาขา กปภ." },
];

function show(value: GisPropertyValue | undefined, unit?: string): string {
  if (value == null || value === "") return DASH;
  return unit ? `${value} ${unit}` : String(value);
}

/**
 * The clicked pipe's ACTUAL source attributes (PR-H, criterion 2 realism). These fields
 * come from the delivered Rayong shapefile through the builder's allowlist — real data,
 * labelled as such; a null stays a dash and is never invented. When the clicked pipe is
 * the demo-bound one, the P-2 attachment is declared a simulated pairing right next to
 * the real fields, so the evidence boundary is visible where it matters.
 */
export function GisPipeDetails({ feature, boundPipeId }: GisPipeDetailsProps): JSX.Element {
  return (
    <Card data-testid="gis-pipe-details" data-provenance="REAL">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-title">ข้อมูลท่อจากแฟ้ม GIS</CardTitle>
        <span className="rounded bg-surface-container px-1.5 py-0.5 text-[11px] text-on-surface-variant">
          ข้อมูลจริง · REAL
        </span>
      </CardHeader>
      <CardContent>
        {feature == null ? (
          <p className="text-on-surface-variant">คลิกท่อบนแผนที่เพื่อดูคุณลักษณะจริงของท่อ</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-dense">
              {ROWS.map((row) => (
                <div key={row.key} className="contents">
                  <dt className="text-on-surface-variant">{row.label}</dt>
                  <dd
                    data-testid={`gis-pipe-${row.key.replace(/_/g, "-")}`}
                    className="text-right text-on-surface tabular"
                  >
                    {show(feature.properties[row.key], row.unit)}
                  </dd>
                </div>
              ))}
            </dl>
            {feature.properties.pipe_id === boundPipeId && (
              <p className="mt-2 flex items-center gap-1.5 text-dense text-on-surface-variant">
                <SimulatedBadge /> ท่อเส้นนี้ถูกใช้เป็นจุดยึดของ P-2 ในการสาธิต — การจับคู่จำลอง
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
