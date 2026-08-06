import { ChevronLeft, ChevronRight } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";

import { typeLabelTh } from "./impactView";
import type { AffectedCustomer } from "./types";

export interface AffectedCustomerTableProps {
  /** The rows for the current page (already filtered + paginated by the drawer). */
  readonly rows: readonly AffectedCustomer[];
  readonly page: number;
  readonly totalPages: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onSelect: (customerId: string) => void;
}

/**
 * The paginated affected-account table (PR-J, source step 5/6). A semantic `<table>` (DlqTable
 * idiom) of 25 rows/page. Each `<tr>` keeps true row semantics; the keyboard-operable control is a
 * real `<button>` in the first cell (not a `role="button"` on the row). Null cells render `—`; the
 * SIMULATED marker sits in a `<th>`, never per-cell.
 */
export function AffectedCustomerTable({
  rows,
  page,
  totalPages,
  onPrev,
  onNext,
  onSelect,
}: AffectedCustomerTableProps): JSX.Element {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-dense">
          <thead>
            <tr className="border-b border-outline-variant">
              <th scope="col" className="px-3 py-2 font-semibold text-on-surface">เลขที่บัญชี</th>
              <th scope="col" className="px-3 py-2 font-semibold text-on-surface">หมายเลขมาตร</th>
              <th scope="col" className="px-3 py-2 font-semibold text-on-surface">ประเภท</th>
              <th scope="col" className="px-3 py-2 font-semibold text-on-surface">พื้นที่</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold text-on-surface">
                ใช้น้ำล่าสุด (ม³) <SimulatedBadge />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <CustomerRow key={c.customer_id} customer={c} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>
      <TablePager page={page} totalPages={totalPages} onPrev={onPrev} onNext={onNext} />
    </div>
  );
}

/** One affected-account row. The first cell's `<button>` is the accessible, keyboard-operable
 *  control that opens the account's detail. */
function CustomerRow({
  customer: c,
  onSelect,
}: {
  readonly customer: AffectedCustomer;
  readonly onSelect: (customerId: string) => void;
}): JSX.Element {
  return (
    <tr
      data-testid="customer-row"
      data-type={c.type_code ?? ""}
      className="border-b border-outline-variant last:border-0 hover:bg-surface-container"
    >
      <td className="px-3 py-2">
        <button
          type="button"
          data-testid="customer-select"
          aria-label={`ดูรายละเอียด ${c.account_no ?? c.customer_id}`}
          onClick={() => onSelect(c.customer_id)}
          className="text-left font-mono text-on-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          {cell(c.account_no)}
        </button>
      </td>
      <td className="px-3 py-2 font-mono text-on-surface-variant">{cell(c.meter_no)}</td>
      <td className="px-3 py-2 text-on-surface">{typeLabelTh(c.type_code, c.subtype_code)}</td>
      <td className="px-3 py-2 text-on-surface-variant">{cell(c.area)}</td>
      <td className="px-3 py-2 text-right tabular text-on-surface">{c.latest_usage_m3 ?? "—"}</td>
    </tr>
  );
}

/** Prev/next pagination showing the current page of the total. */
function TablePager({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  readonly page: number;
  readonly totalPages: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}): JSX.Element {
  return (
    <div className="mt-3 flex items-center justify-end gap-3">
      <span data-testid="pager" className="text-dense text-on-surface-variant">
        หน้า {page} / {totalPages}
      </span>
      <Button variant="outline" size="sm" data-testid="customer-prev" onClick={onPrev} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        ก่อนหน้า
      </Button>
      <Button variant="outline" size="sm" data-testid="customer-next" onClick={onNext} disabled={page >= totalPages}>
        ถัดไป
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** A cell value or the em-dash placeholder for null/empty (INTERACTIONS: never a bare blank). */
function cell(value: string | null | undefined): string {
  return value != null && value !== "" ? value : "—";
}
