import { Database, ShieldCheck } from "lucide-react";
import { useCallback } from "react";

import { Num } from "@/components/ui/num";
import { useOwnedAsync } from "@/features/pipeline/ownedHooks";

import { fetchTrust } from "./nationalClient";
import type { CuratedTrust } from "./types";

/** The provenance band, given loaded trust. Pure — split out so the fetch wrapper stays tiny. */
function TrustBand({ trust }: { readonly trust: CuratedTrust }): JSX.Element {
  const span =
    trust.first_month != null && trust.last_month != null
      ? `${trust.first_month} – ${trust.last_month}`
      : "—";
  return (
    <div
      data-testid="data-trust"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border border-outline-variant bg-surface-container-lowest px-4 py-2 text-xs text-on-surface-variant"
    >
      <span className="flex items-center gap-1 font-semibold text-status-normal">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> ข้อมูลจริงของ กปภ.
      </span>
      <span>
        <Num kind="int" value={trust.branch_count} /> สาขา
      </span>
      <span>
        <Num kind="int" value={trust.region_count} /> เขต
      </span>
      <span>
        <Num kind="int" value={trust.month_count} /> เดือน ({span})
      </span>
      <span>
        <Num kind="int" value={trust.record_count} /> รายการ
      </span>
      <span className="flex items-center gap-1">
        <Database className="h-3.5 w-3.5" aria-hidden="true" /> {trust.source}
      </span>
      {trust.skipped_rows > 0 && (
        <span className="text-status-warning">
          <Num kind="int" value={trust.skipped_rows} /> แถวถูกกัน
        </span>
      )}
    </div>
  );
}

/**
 * The data-trust / provenance strip (Path D, PR-D1). The HONEST counterpart to `SimulatedBadge`: it
 * certifies the national figures are real PWA data, so it carries NO SimulatedBadge.
 *
 * It fetches `/trust` on its OWN, INDEPENDENTLY of the dashboard's primary data — so neither a
 * failure NOR a hang of `/trust` can gate the dashboard's first paint (it simply renders nothing
 * until the provenance is known). A supplementary strip must never blank the real data around it.
 */
export function DataTrustStrip(): JSX.Element | null {
  const task = useCallback((signal: AbortSignal): Promise<CuratedTrust> => fetchTrust(signal), []);
  const { data } = useOwnedAsync(task);
  if (data == null) return null;
  return <TrustBand trust={data} />;
}
