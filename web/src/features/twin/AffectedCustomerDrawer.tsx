import { useCallback, useEffect, useRef, useState } from "react";

import { X } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";

import { AffectedCustomerTable } from "./AffectedCustomerTable";
import { CustomerDetailPanel } from "./CustomerDetailPanel";
import { filterAndPageCustomers, TYPE_LABEL_TH, type TypeFilter } from "./impactView";
import { TypeBreakdownList } from "./ImpactPanel";
import { MonthlyMeterReadings } from "./MonthlyMeterReadings";
import type { DemoCustomerDetail, ImpactResponse } from "./types";

export interface AffectedCustomerDrawerProps {
  /** The incident. `count` is the INVARIANT headline; filtering never changes it. */
  readonly impact: ImpactResponse;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly selectedCustomerId: string | null;
  readonly detail: DemoCustomerDetail | null;
  readonly detailLoading: boolean;
  /** The selected customer's detail fetch settled but FAILED — show an error + retry, not a spinner. */
  readonly detailError?: boolean;
  readonly onRetryDetail?: () => void;
  readonly onSelectCustomer: (customerId: string) => void;
}

const FILTERS: readonly { key: TypeFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: 1, label: TYPE_LABEL_TH[1] },
  { key: 2, label: TYPE_LABEL_TH[2] },
  { key: 3, label: TYPE_LABEL_TH[3] },
];

/**
 * The affected-customer drawer (PR-J, source steps 5–7). A modal `role="dialog"` opened by the
 * footprint OR a highlighted pipe. Its header shows the INVARIANT incident headline (200), the
 * SIMULATED IMPACT provenance, the zone, and the 140/35/25 breakdown; the type filter sits above
 * a 25-row/8-page table; selecting a row reveals the account detail + 12 readings.
 *
 * Focus (INTERACTIONS/R24): on open, focus moves to the close button and the element that was
 * focused at open time is restored on close; Tab is trapped inside the dialog; Esc closes.
 */
export function AffectedCustomerDrawer({
  impact,
  open,
  onClose,
  selectedCustomerId,
  detail,
  detailLoading,
  detailError = false,
  onRetryDetail,
  onSelectCustomer,
}: AffectedCustomerDrawerProps): JSX.Element | null {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [page, setPage] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus + keyboard (R24/INTERACTIONS): on open, move focus to the close button and capture the
  // opener to restore on close; Esc closes; Tab is trapped inside the dialog. The keydown lives on
  // `document` (not a JSX handler on the non-interactive dialog element) and is torn down on close.
  // The screen mounts this fresh per incident, so filter/page start at their defaults with no
  // reset setState here.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || dialogRef.current == null) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  const changeFilter = useCallback((f: TypeFilter): void => {
    setTypeFilter(f);
    setPage(1); // a new filter always restarts at page 1 (INTERACTIONS)
  }, []);

  if (!open) return null;

  const paged = filterAndPageCustomers(impact.customers, typeFilter, page);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="impact-drawer">
      {/* A transparent full-screen button catches an outside click to close (interactive element,
          so it carries its own keyboard semantics — no static-div handler). */}
      <button
        type="button"
        aria-label="ปิดหน้าต่างผู้ใช้น้ำที่ได้รับผลกระทบ"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-transparent"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="impact-drawer-title"
        className="relative flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto bg-surface p-4 shadow-lg"
      >
        <header
          data-testid="impact-drawer-header"
          className="flex flex-col gap-2 border-b border-outline-variant pb-3"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 id="impact-drawer-title" className="text-title text-on-surface">
              ผู้ใช้น้ำที่ได้รับผลกระทบ{" "}
              <span className="text-dense text-on-surface-variant">· SIMULATED IMPACT</span>
            </h2>
            <Button
              ref={closeRef}
              variant="outline"
              size="icon"
              data-testid="customer-close"
              aria-label="ปิด"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span data-testid="impact-count" className="text-headline tabular text-on-surface">
              {impact.count} <span className="text-dense text-on-surface-variant">ราย</span>
            </span>
            <SimulatedBadge />
            {impact.zone != null && (
              <span className="text-dense text-on-surface-variant">โซน {impact.zone}</span>
            )}
          </div>
          {impact.type_breakdown != null && <TypeBreakdownList breakdown={impact.type_breakdown} />}
        </header>

        <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามประเภทผู้ใช้น้ำ">
          {FILTERS.map((f) => (
            <Button
              key={String(f.key)}
              variant={typeFilter === f.key ? "primary" : "outline"}
              size="sm"
              data-testid={`filter-type-${f.key}`}
              aria-pressed={typeFilter === f.key}
              onClick={() => changeFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <AffectedCustomerTable
          rows={paged.rows}
          page={paged.page}
          totalPages={paged.totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
          onSelect={onSelectCustomer}
        />

        {selectedCustomerId != null && (
          <div className="flex flex-col gap-3 border-t border-outline-variant pt-3">
            <CustomerDetailPanel
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onRetry={onRetryDetail}
            />
            {/* Readings render only for the CURRENTLY selected customer's loaded detail — never the
                previous customer's while the new one is loading (detailLoading gates the stale set). */}
            {!detailLoading && !detailError && detail?.customer_id === selectedCustomerId && (
              <MonthlyMeterReadings readings={detail.readings} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
