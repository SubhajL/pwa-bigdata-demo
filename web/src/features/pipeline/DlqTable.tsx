import { useCallback } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { toCsv } from "./pipelineClient";
import type { DlqItem, DlqResponse } from "./types";

export interface DlqTableProps {
  readonly page: DlqResponse | null;
  readonly total: number | null;
  readonly offset: number;
  readonly loading: boolean;
  readonly error?: string | null;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}

const RAW_TRUNCATE = 48;

/**
 * Dead-letter table (item 1.5): semantic <table> of asset_id (null → "—"), reason, and a
 * deterministically-serialised, TRUNCATED raw object; an explicit empty state (not a spinner);
 * offset pagination showing the total (from conservation.dead_letter); an Export-CSV control
 * (client Blob via toCsv). SimulatedBadge in a <th>. SEAM — fill against DlqTable.test.tsx.
 */
export function DlqTable({ page, total, offset, loading, error, onPrev, onNext }: DlqTableProps): JSX.Element {
  const handleExport = useCallback(() => {
    if (page == null || page.items.length === 0) return;
    const csv = toCsv(page.items);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dlq-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [page]);

  const hasNext = total != null && page != null && offset + page.limit < total;

  // Error state: error set and no page loaded yet.
  if (error != null && page == null) {
    return (
      <Alert variant="error">
        <AlertTitle>ไม่สามารถโหลด DLQ ได้</AlertTitle>
        <AlertDescription>{error} · กดลองใหม่อีกครั้ง</AlertDescription>
      </Alert>
    );
  }

  if (page == null && loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dead-Letter Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-dense text-on-surface-variant">กำลังโหลด...</p>
        </CardContent>
      </Card>
    );
  }

  // Empty overrun: offset > 0 but no items — still show pagination so operator can go back.
  const isOverrun = page != null && page.items.length === 0 && offset > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Dead-Letter Queue
          {total != null && (
            <span
              data-testid="dlq-total"
              data-value={total}
              className="text-dense font-normal text-on-surface-variant"
            >
              (ทั้งหมด {total})
            </span>
          )}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          data-testid="dlq-export"
          onClick={handleExport}
          disabled={page == null || page.items.length === 0}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        {page != null && page.items.length === 0 && !isOverrun ? (
          <div data-testid="dlq-empty" className="py-8 text-center text-dense text-on-surface-variant">
            ไม่มีรายการ dead-letter
          </div>
        ) : page != null ? (
          <>
            {page.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-dense">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                        Asset ID
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                        เหตุผล
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                        Raw
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold text-on-surface">
                        <SimulatedBadge />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((item) => (
                      <DlqRow key={item.message_id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isOverrun && (
              <p className="py-4 text-center text-dense text-on-surface-variant">
                ไม่มีรายการในหน้านี้ — เลื่อนกลับเพื่อดูข้อมูลก่อนหน้า
              </p>
            )}
            <Pagination
              offset={offset}
              hasNext={hasNext}
              onPrev={onPrev}
              onNext={onNext}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Pure helper: render a single DLQ row. */
function DlqRow({ item }: { readonly item: DlqItem }): JSX.Element {
  const rawStr = JSON.stringify(item.raw);
  const truncated = rawStr.length > RAW_TRUNCATE ? rawStr.slice(0, RAW_TRUNCATE) + "…" : rawStr;
  return (
    <tr data-testid="dlq-row" className="border-b border-outline-variant last:border-0">
      <td className="px-3 py-2 font-mono text-on-surface">
        {item.asset_id ?? "—"}
      </td>
      <td className="px-3 py-2 text-on-surface">{item.reason}</td>
      <td className="max-w-[200px] truncate px-3 py-2 font-mono text-on-surface-variant" title={rawStr}>
        {truncated}
      </td>
      <td />
    </tr>
  );
}

/** Pure helper: prev/next pagination controls. */
function Pagination({
  offset,
  hasNext,
  onPrev,
  onNext,
}: {
  readonly offset: number;
  readonly hasNext: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}): JSX.Element {
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        data-testid="dlq-prev"
        onClick={onPrev}
        disabled={offset === 0}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        ก่อนหน้า
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="dlq-next"
        onClick={onNext}
        disabled={!hasNext}
      >
        ถัดไป
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
