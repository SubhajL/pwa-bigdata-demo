import { WifiOff } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { MonthPicker } from "@/components/MonthPicker";
import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BranchLeagueTable } from "@/features/regional/BranchLeagueTable";
import { RegionBranchNrwChart, RegionStepTestCard } from "@/features/regional/RegionDetailPanels";
import { RegionBreadcrumb } from "@/features/regional/RegionBreadcrumb";
import { RegionOfficeMap } from "@/features/regional/RegionOfficeMap";
import { RegionSelect } from "@/features/regional/RegionSelect";
import { RegionalKpiRow } from "@/features/regional/RegionalKpiRow";
import { REGIONAL_CONFIG } from "@/features/regional/regional.config";
import { branchBars, regionSummary } from "@/features/regional/regionalClient";
import { useRegional, type RegionalData } from "@/features/regional/useRegional";

/** Parse `?region=` into a valid PWA region id (1..10), or null when absent/out of range. */
function parseRegion(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  const { minRegion, maxRegion } = REGIONAL_CONFIG;
  return Number.isInteger(n) && n >= minRegion && n <= maxRegion ? n : null;
}

/**
 * Regional Dashboard (Stitch S2, PR-11) — the drill target of the national map/bars, over the REAL
 * `/api/curated/regions/{region}` data. Owns the INTERACTIONS states + honesty model. The `<h1>`
 * carries the nav `labelTh` and renders SYNCHRONOUSLY. Water sold / MoM / YoY are REAL; only the
 * NRW / status / to-watch figures carry a SimulatedBadge.
 */
export function RegionalScreen(): JSX.Element {
  const [params, setParams] = useSearchParams();
  // Reached straight from the sidebar there is no `?region=`; fall back to a default so the page
  // lands on a real region dashboard (with a เขต selector to switch) instead of an empty prompt.
  const region = parseRegion(params.get("region")) ?? REGIONAL_CONFIG.defaultRegion;
  const requestedMonth = params.get("month");
  const { data, error, stale } = useRegional(region, requestedMonth);
  // `loaded` requires the data to be FOR the selected region: during a region switch `useOwnedAsync`
  // still holds the previous region's rows, so gating on provenance shows a skeleton (not the wrong
  // region's table under the new heading). `monthKnown` guards an invalid/stale URL month from
  // sticking the screen in a permanent "loading month" state.
  const loaded = data != null && data.region === region;
  const monthKnown = loaded && requestedMonth != null && data.months.includes(requestedMonth);
  const switching = monthKnown && requestedMonth !== data.month;

  const setMonth = (month: string): void => {
    setParams((prev) => {
      prev.set("month", month);
      return prev;
    });
  };

  const setRegion = (next: number): void => {
    setParams((prev) => {
      prev.set("region", String(next));
      return prev;
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="regional">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-on-surface">ระดับเขต · เขต {region}</h1>
        <div className="flex flex-wrap items-center gap-4">
          {switching && (
            <span className="text-dense text-on-surface-variant" aria-live="polite">
              กำลังโหลดเดือนที่เลือก…
            </span>
          )}
          {stale && (
            <span className="flex items-center gap-2 text-dense text-status-warning" aria-live="polite">
              <WifiOff className="h-4 w-4" aria-hidden="true" /> ข้อมูลไม่เป็นปัจจุบัน
            </span>
          )}
          <RegionSelect region={region} onChange={setRegion} />
          {loaded && (
            <MonthPicker
              months={data.months}
              value={monthKnown ? requestedMonth : data.month}
              onChange={setMonth}
            />
          )}
        </div>
      </div>
      <RegionalBody region={region} data={data} loaded={loaded} error={error} stale={stale} switching={switching} />
    </div>
  );
}

/** The state ladder: error / skeleton / empty / loaded. Kept out of the screen function so each
 *  stays legible and short. (There is no "no region" state — the screen always defaults one.) */
function RegionalBody({
  region,
  data,
  loaded,
  error,
  stale,
  switching,
}: {
  readonly region: number;
  readonly data: RegionalData | null;
  readonly loaded: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly switching: boolean;
}): JSX.Element {
  if (error != null && !loaded) {
    return (
      <Alert variant="error">
        <AlertTitle>ไม่สามารถโหลดข้อมูลรายเขตได้</AlertTitle>
        <AlertDescription>การเชื่อมต่อกับเซิร์ฟเวอร์มีปัญหา · เลือกเดือนใหม่หรือกดโหลดหน้านี้อีกครั้ง</AlertDescription>
      </Alert>
    );
  }
  if (!loaded || data == null) return <Skeleton className="h-[520px] w-full" />;
  if (data.rows.length === 0) {
    return (
      <Card data-testid="regional-empty" className="text-dense text-on-surface-variant">
        ไม่มีข้อมูลสำหรับเดือนนี้ · กรุณาเลือกเดือนอื่น
      </Card>
    );
  }
  return <LoadedContent data={data} region={region} stale={stale} switching={switching} />;
}

/** The full regional view once a region's branch rows exist. Dims while stale or switching month. */
function LoadedContent({
  data,
  region,
  stale,
  switching,
}: {
  readonly data: RegionalData;
  readonly region: number;
  readonly stale: boolean;
  readonly switching: boolean;
}): JSX.Element {
  const bars = branchBars(data.rows);
  const summary = regionSummary(bars);
  return (
    <div
      className={
        stale || switching
          ? "flex flex-col gap-4 opacity-60 transition-opacity duration-[var(--anim-medium)]"
          : "flex flex-col gap-4"
      }
    >
      <RegionBreadcrumb region={region} month={data.month} />
      {stale && (
        <p className="flex items-center gap-2 text-dense text-status-warning">
          <StatusChip kind="warning" /> แสดงข้อมูลล่าสุดที่ทราบ
        </p>
      )}
      <RegionalKpiRow summary={summary} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <RegionOfficeMap region={region} />
        </div>
        <div className="lg:col-span-8">
          <BranchLeagueTable bars={bars} month={data.month} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RegionBranchNrwChart bars={bars} />
        <RegionStepTestCard />
      </div>
      <footer className="flex items-center gap-2 text-dense text-on-surface-variant">
        <SimulatedBadge /> คอลัมน์ NRW · สถานะ และ KPI อัตราน้ำสูญเสีย · สาขาที่ต้องเฝ้าระวัง เป็นค่าจำลอง —
        ปริมาณจำหน่ายน้ำ · MoM · YoY เป็นข้อมูลจริงของ กปภ.
      </footer>
    </div>
  );
}
