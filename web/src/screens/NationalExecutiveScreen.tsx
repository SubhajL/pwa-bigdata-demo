import { WifiOff } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AiSituationCard } from "@/features/national/AiSituationCard";
import { MonthPicker } from "@/components/MonthPicker";
import { NationalKpiRow } from "@/features/national/NationalKpiRow";
import { NationalTrendChart } from "@/features/national/NationalTrendChart";
import { OfficeRegionMap } from "@/features/national/OfficeRegionMap";
import { RegionVolumeBars } from "@/features/national/RegionVolumeBars";
import { useNational, type NationalData } from "@/features/national/useNational";

/**
 * National Executive Dashboard (Stitch S1, PR-10) over the REAL curated water-sold dataset. Owns
 * the INTERACTIONS states and the honesty model (mirrors PredictiveAnalyticsScreen): the `<h1>`
 * carries the nav `labelTh` and renders SYNCHRONOUSLY, independent of any fetch. A load that has
 * never succeeded shows a skeleton; a month with no rows shows an honest empty state (not a
 * permanent skeleton); a later failed refetch dims the last values with a stale marker, never
 * blanking. Water-sold figures are REAL; only NRW / energy / cost tiles carry a SimulatedBadge.
 */
export function NationalExecutiveScreen(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const requestedMonth = params.get("month");
  const { data, error, stale } = useNational(requestedMonth);
  const loaded = data != null;
  // While a newly-picked month is still loading, `data` still holds the previous month. Bind the
  // picker to the REQUESTED month (so it doesn't snap back and reject the click) and dim + announce
  // the load, rather than silently showing the old month's KPIs under a new selection.
  const switching = loaded && requestedMonth != null && requestedMonth !== data.month;

  const setMonth = (month: string): void => {
    setParams((prev) => {
      prev.set("month", month);
      return prev;
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="national-executive">
      {/* A <div>, not a <header>: the app banner lives in AppShell, and a second banner landmark
          on the landing route (index → /national) is an a11y defect (AppShell.test guards it). */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-on-surface">ภาพรวมประเทศ · National Overview</h1>
        <div className="flex items-center gap-4">
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
          {loaded && (
            <MonthPicker months={data.months} value={requestedMonth ?? data.month} onChange={setMonth} />
          )}
        </div>
      </div>

      {error != null && !loaded ? (
        <Alert variant="error">
          <AlertTitle>ไม่สามารถโหลดข้อมูลภาพรวมได้</AlertTitle>
          <AlertDescription>
            การเชื่อมต่อกับเซิร์ฟเวอร์มีปัญหา · เลือกเดือนใหม่หรือกดโหลดหน้านี้อีกครั้ง
          </AlertDescription>
        </Alert>
      ) : !loaded ? (
        <Skeleton className="h-[520px] w-full" />
      ) : data.rollup.regions.length === 0 ? (
        <Card data-testid="national-empty" className="text-dense text-on-surface-variant">
          ไม่มีข้อมูลสำหรับเดือนนี้ · กรุณาเลือกเดือนอื่น
        </Card>
      ) : (
        <LoadedContent data={data} stale={stale} switching={switching} />
      )}
    </div>
  );
}

/** The full dashboard once a month's roll-up exists. Kept separate so the state machine stays short.
 *  Dims while stale (transient error, last-known kept) OR switching (a newly-picked month loading). */
function LoadedContent({
  data,
  stale,
  switching,
}: {
  readonly data: NationalData;
  readonly stale: boolean;
  readonly switching: boolean;
}): JSX.Element {
  return (
    <div
      className={
        stale || switching
          ? "flex flex-col gap-4 opacity-60 transition-opacity duration-[var(--anim-medium)]"
          : "flex flex-col gap-4"
      }
    >
      {stale && (
        <p className="flex items-center gap-2 text-dense text-status-warning">
          <StatusChip kind="warning" /> แสดงข้อมูลล่าสุดที่ทราบ
        </p>
      )}
      <NationalKpiRow rollup={data.rollup} series={data.series} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <OfficeRegionMap rollup={data.rollup} />
        </div>
        <div className="lg:col-span-5">
          <RegionVolumeBars rollup={data.rollup} />
        </div>
      </div>
      <NationalTrendChart series={data.series} />
      <AiSituationCard rollup={data.rollup} series={data.series} />
      <footer className="flex items-center gap-2 text-dense text-on-surface-variant">
        <SimulatedBadge /> เฉพาะ KPI อัตราน้ำสูญเสีย (NRW) · ต้นทุนพลังงาน · ต้นทุนพลังงานต่อหน่วย เป็นค่าจำลอง —
        ปริมาณจำหน่ายน้ำ · แผนที่ · แนวโน้ม เป็นข้อมูลจริงของ กปภ.
      </footer>
    </div>
  );
}
