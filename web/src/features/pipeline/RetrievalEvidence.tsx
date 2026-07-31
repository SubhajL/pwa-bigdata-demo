import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import type { RangeResponse } from "./types";

export interface RetrievalEvidenceProps {
  readonly range: RangeResponse | null;
  readonly loading?: boolean;
  readonly error?: string | null;
}

/**
 * Retrieval-evidence panel (item 1.4): renders the range readings in ASCENDING ts order with the
 * count, proving time-range retrieval. SimulatedBadge in the card header. SEAM — fill against
 * RetrievalEvidence.test.tsx.
 */
export function RetrievalEvidence({ range, loading, error }: RetrievalEvidenceProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          หลักฐานการดึงข้อมูลย้อนหลัง
          <SimulatedBadge />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error != null && range == null ? (
          <Alert variant="error">
            <AlertTitle>ไม่สามารถโหลดข้อมูลย้อนหลังได้</AlertTitle>
            <AlertDescription>{error} · กดลองใหม่อีกครั้ง</AlertDescription>
          </Alert>
        ) : range == null && loading ? (
          <p className="text-dense text-on-surface-variant">กำลังโหลดข้อมูล...</p>
        ) : range == null ? (
          <p className="text-dense text-on-surface-variant">ไม่มีข้อมูล</p>
        ) : (
          <>
            <p className="mb-3 text-dense text-on-surface-variant">
              Asset: {range.asset_id} · หน้าต่าง {range.window_minutes} นาที ·{" "}
              <span className="tabular font-semibold text-on-surface">
                ทั้งหมด <Num kind="int" value={range.count} /> รายการ
              </span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-dense">
                <thead>
                  <tr className="border-b border-outline-variant">
                    <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                      เวลา
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                      สัญญาณ
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold tabular text-right text-on-surface">
                      ค่า
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {range.readings.map((r, i) => (
                    <tr
                      key={`${r.ts}-${i}`}
                      data-testid="range-row"
                      className="border-b border-outline-variant last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-on-surface">
                        {r.ts.slice(11, 19)}
                      </td>
                      <td className="px-3 py-2 text-on-surface-variant">{r.signal}</td>
                      <td className="px-3 py-2 tabular text-right text-on-surface">
                        <input
                          readOnly
                          value={r.value}
                          className="w-16 tabular text-right text-on-surface bg-transparent border-none outline-none"
                          tabIndex={-1}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
