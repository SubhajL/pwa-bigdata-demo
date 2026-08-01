import { useCallback, useState } from "react";
import { Link } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnedAsync, type OwnedAsyncResult } from "@/features/pipeline/ownedHooks";
import { RegionSelect } from "@/features/regional/RegionSelect";
import { REGIONAL_CONFIG, branchHref } from "@/features/regional/regional.config";
import { branchBars, fetchMonths, fetchRegion } from "@/features/regional/regionalClient";
import type { BranchBar } from "@/features/regional/types";

interface RegionBranches {
  /** Which region these branches are FOR — so a switch can't show the previous region's list. */
  readonly region: number;
  readonly month: string;
  readonly bars: readonly BranchBar[];
}

/** Fetch a region's branch list (latest month) so the picker can offer real branches to drill into. */
function useRegionBranches(region: number): OwnedAsyncResult<RegionBranches> {
  const task = useCallback(
    async (signal: AbortSignal): Promise<RegionBranches> => {
      const { months } = await fetchMonths(signal);
      const month = months[months.length - 1] ?? "";
      const rows = month ? await fetchRegion(region, month, signal) : [];
      return { region, month, bars: branchBars(rows) };
    },
    [region],
  );
  return useOwnedAsync(task);
}

/**
 * The branch picker shown when ระดับสาขา is reached WITHOUT a `?branch=` (e.g. straight from the
 * sidebar). Instead of an empty "go to the national page" prompt, it lets the user pick a เขต and
 * then a branch inline. Real data — every branch links to its detail with the month preserved.
 */
export function BranchPicker(): JSX.Element {
  const [region, setRegion] = useState<number>(REGIONAL_CONFIG.defaultRegion);
  const { data, error } = useRegionBranches(region);
  return (
    <Card data-testid="branch-picker">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">เลือกสาขาเพื่อดูรายละเอียด</CardTitle>
        <RegionSelect region={region} onChange={setRegion} />
      </CardHeader>
      <CardContent>
        {/* Only show branches actually FOR the selected region — during a switch `useOwnedAsync`
            still holds the previous region's list, so gate on provenance (skeleton/error over stale
            rows) rather than เขต 1's branches under a "เขต 5" selector. */}
        {data != null && data.region === region ? (
          <BranchLinks data={data} />
        ) : error != null ? (
          <Alert variant="error">
            <AlertTitle>โหลดรายชื่อสาขาไม่สำเร็จ</AlertTitle>
            <AlertDescription>ลองเลือกเขตใหม่ หรือกดโหลดหน้านี้อีกครั้ง</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

/** The region's branches as drill links (month preserved), or an honest empty state. */
function BranchLinks({ data }: { readonly data: RegionBranches }): JSX.Element {
  if (data.bars.length === 0) {
    return (
      <p data-testid="branch-picker-empty" className="text-dense text-on-surface-variant">
        ไม่มีสาขาในเขตนี้
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {data.bars.map((b) => (
        <li key={b.branchCode}>
          <Link
            to={branchHref(b.branchCode, data.month)}
            className="flex items-center justify-between gap-2 rounded-md border border-outline-variant px-3 py-2 text-sm transition-colors duration-[var(--anim-fast)] ease-standard hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="truncate text-on-surface">{b.branch}</span>
            <span className="shrink-0 text-xs text-on-surface-variant">#{b.rank}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
