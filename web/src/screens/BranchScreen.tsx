import { WifiOff } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { MonthPicker } from "@/components/MonthPicker";
import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BranchAiCard } from "@/features/branch/BranchAiCard";
import { BranchBreadcrumb } from "@/features/branch/BranchBreadcrumb";
import { BranchKpiRow } from "@/features/branch/BranchKpiRow";
import { BranchTrendChart } from "@/features/branch/BranchTrendChart";
import { useBranch, type BranchData } from "@/features/branch/useBranch";

/**
 * Branch Dashboard (Stitch S3, PR-12) — the drill target of the Regional league table, over the
 * REAL `/api/curated/branches/{code}` series. Owns the INTERACTIONS states + honesty model; the
 * `<h1>` carries the nav `labelTh` and renders SYNCHRONOUSLY. Water sold / MoM / YoY / trend /
 * rank / vs-median are REAL; only the branch NRW + status carry a SimulatedBadge.
 */
export function BranchScreen(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const code = params.get("branch") || null;
  const requestedMonth = params.get("month");
  const { data, error, stale } = useBranch(code, requestedMonth);
  const loaded = data != null && data.code === code;
  const monthKnown = loaded && requestedMonth != null && data.months.includes(requestedMonth);
  // Not `stale`: a FAILED month switch keeps the old month's data and sets `stale` — showing both
  // "loading this month" and "data not current" at once is contradictory, so the stale marker wins.
  const switching = monthKnown && requestedMonth !== data.month && !stale;

  const setMonth = (month: string): void => {
    setParams((prev) => {
      prev.set("month", month);
      return prev;
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="branch">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-on-surface">
          ระดับสาขา{loaded && data.series != null ? ` · ${data.series.branch}` : ""}
        </h1>
        <div className="flex items-center gap-4">
          {switching && (
            <span className="text-dense text-on-surface-variant" aria-live="polite">กำลังโหลดเดือนที่เลือก…</span>
          )}
          {stale && (
            <span className="flex items-center gap-2 text-dense text-status-warning" aria-live="polite">
              <WifiOff className="h-4 w-4" aria-hidden="true" /> ข้อมูลไม่เป็นปัจจุบัน
            </span>
          )}
          {code != null && loaded && (
            <MonthPicker months={data.months} value={monthKnown ? requestedMonth : data.month} onChange={setMonth} />
          )}
        </div>
      </div>
      <BranchBody code={code} data={data} loaded={loaded} error={error} stale={stale} switching={switching} />
    </div>
  );
}

/** State ladder: no-branch prompt / error / skeleton / loaded. Kept out of the screen function. */
function BranchBody({
  code,
  data,
  loaded,
  error,
  stale,
  switching,
}: {
  readonly code: string | null;
  readonly data: BranchData | null;
  readonly loaded: boolean;
  readonly error: string | null;
  readonly stale: boolean;
  readonly switching: boolean;
}): JSX.Element {
  if (code == null) {
    return (
      <Card data-testid="branch-no-branch" className="text-dense text-on-surface-variant">
        เลือกสาขาจากตารางในหน้า{" "}
        <Link to="/national" className="text-primary hover:underline">ภาพรวมประเทศ</Link> เพื่อดูรายละเอียดรายสาขา
      </Card>
    );
  }
  if (error != null && !loaded) {
    return (
      <Alert variant="error">
        <AlertTitle>ไม่สามารถโหลดข้อมูลรายสาขาได้</AlertTitle>
        <AlertDescription>การเชื่อมต่อกับเซิร์ฟเวอร์มีปัญหา · ตรวจสอบรหัสสาขาหรือกดโหลดหน้านี้อีกครั้ง</AlertDescription>
      </Alert>
    );
  }
  if (!loaded || data == null || data.series == null || data.vitals == null || data.standing == null) {
    return <Skeleton className="h-[520px] w-full" />;
  }
  return <LoadedContent data={data} stale={stale} switching={switching} />;
}

/** The full branch view once its series exists. Dims while stale or switching month. */
function LoadedContent({
  data,
  stale,
  switching,
}: {
  readonly data: BranchData;
  readonly stale: boolean;
  readonly switching: boolean;
}): JSX.Element {
  const series = data.series!;
  return (
    <div className={stale || switching ? "flex flex-col gap-4 opacity-60 transition-opacity duration-[var(--anim-medium)]" : "flex flex-col gap-4"}>
      <BranchBreadcrumb region={series.region} branch={series.branch} month={data.month} />
      <BranchKpiRow vitals={data.vitals!} standing={data.standing!} />
      <BranchTrendChart points={series.points} regionMedianM3={data.standing!.regionMedianM3} />
      <BranchAiCard branch={series.branch} vitals={data.vitals!} standing={data.standing!} />
      <footer className="flex items-center gap-2 text-dense text-on-surface-variant">
        <SimulatedBadge /> อัตราน้ำสูญเสีย (NRW) และสถานะเป็นค่าจำลอง — ปริมาณจำหน่ายน้ำ · แนวโน้ม · อันดับ · ค่ากลางเขต เป็นข้อมูลจริงของ กปภ.
      </footer>
    </div>
  );
}
