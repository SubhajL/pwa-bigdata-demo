import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import type { LatencySummary } from "./types";

export interface ResponseTimeTableProps {
  readonly summaries: readonly LatencySummary[];
  readonly budgetMs: number;
}

/**
 * Response-Time table (item 1.3): a semantic <table> (<th scope>), one row per endpoint showing
 * meanMs + dbMs + an under/over-budget marker by TEXT+ICON (never colour alone); failed rows show
 * their failure count, not "under budget"; the budget threshold is shown as text. Latency is a
 * GENUINE measurement of the running system — it MUST NOT wear a SimulatedBadge. A data-derived
 * caption discloses the demo environment and totals. SEAM — fill against ResponseTimeTable.test.tsx.
 */
export function ResponseTimeTable({ summaries, budgetMs }: ResponseTimeTableProps): JSX.Element {
  const totalCalls = summaries.reduce((acc, s) => acc + s.count + s.failures, 0);
  const totalOk = summaries.reduce((acc, s) => acc + s.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          เวลาตอบสนองของ API · ≤ {budgetMs} ms
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-dense text-on-surface-variant">
          วัด {totalCalls} ครั้ง (สำเร็จ {totalOk}) · สภาพแวดล้อมสาธิต · ไม่ใช่ SLA production
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-dense">
            <thead>
              <tr className="border-b border-outline-variant">
                <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                  Endpoint
                </th>
                <th scope="col" className="px-3 py-2 font-semibold tabular text-right text-on-surface">
                  ค่าเฉลี่ย (ms)
                </th>
                <th scope="col" className="px-3 py-2 font-semibold tabular text-right text-on-surface">
                  DB (ms)
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                  ผลลัพธ์
                </th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr
                  key={s.path}
                  data-testid="rt-row"
                  className="border-b border-outline-variant last:border-0"
                >
                  <td className="px-3 py-2 font-medium text-on-surface">{s.path}</td>
                  <td className="px-3 py-2 tabular text-right text-on-surface">
                    {s.count === 0 ? "—" : <Num kind="decimal" digits={1} value={s.meanMs} />}
                  </td>
                  <td className="px-3 py-2 tabular text-right text-on-surface-variant">
                    {s.dbMs != null ? (
                      <Num kind="decimal" digits={1} value={s.dbMs} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Verdict summary={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pure helper: render the budget verdict with icon + text + the correct data-testid. */
function Verdict({ summary: s }: { readonly summary: LatencySummary }): JSX.Element {
  if (s.underBudget) {
    return (
      <span data-testid="budget-ok" className="inline-flex items-center gap-1 text-status-normal">
        <CheckCircle className="h-4 w-4" aria-hidden="true" />
        <span className="font-semibold">อยู่ในงบประมาณ</span>
      </span>
    );
  }
  if (s.count === 0) {
    return (
      <span data-testid="budget-failed" className="inline-flex items-center gap-1 text-status-critical">
        <XCircle className="h-4 w-4" aria-hidden="true" />
        <span className="font-semibold">ล้มเหลวทั้งหมด ({s.failures})</span>
      </span>
    );
  }
  return (
    <span data-testid="budget-over" className="inline-flex items-center gap-1 text-status-warning">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <span className="font-semibold">เกินงบประมาณ</span>
    </span>
  );
}
