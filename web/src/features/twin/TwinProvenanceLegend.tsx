import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Field-level evidence legend (PR-H, rayong-pipe-gis-sec-plan decision 8). One page-wide
 * "simulated" badge cannot express a view that mixes real geometry with simulated
 * telemetry — this legend defines each class where the judge can read it.
 */
const ENTRIES: ReadonlyArray<{ id: string; badge: string; text: string }> = [
  {
    id: "evidence-real",
    badge: "REAL",
    text: "เส้นท่อและคุณลักษณะท่อ (ชนิด ขนาด ชั้นแรงดัน ปีที่วาง) จากแฟ้ม GIS สาขาระยองของจริง",
  },
  {
    id: "evidence-official",
    badge: "OFFICIAL",
    text: "ค่าอ้างอิงพลังงาน 0.54 kWh/m³ ของ East Water ปี 2025 — ระดับทั้งระบบ ไม่ใช่ค่าของสถานี",
  },
  {
    id: "evidence-simulated",
    badge: "SIMULATED",
    text: "สถานะอุปกรณ์ ค่าโทรมาตร ตำแหน่งติดตั้ง P-2 การจับคู่ท่อ และผลกระทบผู้ใช้น้ำ — ข้อมูลจำลอง",
  },
];

export function TwinProvenanceLegend(): JSX.Element {
  return (
    <Card data-testid="twin-provenance-legend">
      <CardHeader>
        <CardTitle className="text-title">ที่มาของข้อมูลในมุมมองนี้</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {ENTRIES.map((entry) => (
            <li key={entry.id} data-testid={entry.id} className="flex items-start gap-2 text-dense">
              <span className="mt-0.5 shrink-0 rounded bg-surface-container px-1.5 py-0.5 text-[11px] text-on-surface-variant">
                {entry.badge}
              </span>
              <span className="text-on-surface-variant">{entry.text}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
