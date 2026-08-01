import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import {
  EXPORT_FORMATS,
  QUARTERLY_BARS,
  REPORT_CONTEXT,
  REPORT_KPIS,
  REPORT_LEVELS,
  TARGET_ROWS,
  type KpiTypeId,
  type ReportLevel,
  type ReportTemplate,
} from "./report.config";

export interface ReportPreviewProps {
  readonly template: ReportTemplate;
  readonly level: ReportLevel;
  /** Which KPI tiles to include — the "ประเภท KPI" chips genuinely drive this. */
  readonly kpiTypes: ReadonlySet<KpiTypeId>;
}

/** The SIMULATED headline KPI tiles, filtered to the selected KPI types. */
function KpiTiles({ kpiTypes }: { readonly kpiTypes: ReadonlySet<KpiTypeId> }): JSX.Element {
  const kpis = REPORT_KPIS.filter((k) => kpiTypes.has(k.id));
  if (kpis.length === 0) {
    return (
      <p data-testid="report-kpis" className="text-sm text-on-surface-variant">
        เลือกประเภท KPI อย่างน้อยหนึ่งรายการเพื่อแสดงตัวชี้วัด
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="report-kpis">
      {kpis.map((kpi) => (
        <div key={kpi.id} data-testid={`report-kpi-${kpi.id}`} className="flex flex-col gap-1 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <span className="text-xs text-on-surface-variant">{kpi.labelTh}</span>
          <span className="flex items-baseline gap-1">
            <span className="whitespace-nowrap text-xl font-semibold text-on-surface tabular">
              <Num kind={kpi.kind} digits={kpi.digits} value={kpi.value} />
            </span>
            <span className="text-sm text-on-surface-variant">{kpi.unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Quarterly water-sold trend — a SINGLE series, so one hue (magnitude = bar height), one y-axis,
 *  no legend. Each bar sits in a fixed-height track and anchors to the baseline; the height % is a
 *  fraction of that track (not of the flex item, which would collapse). Only 4 marks → direct
 *  value labels. */
function QuarterlyBars(): JSX.Element {
  const max = Math.max(...QUARTERLY_BARS.map((q) => q.valueMm3));
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold text-on-surface">แนวโน้มรายไตรมาส (ล้าน ลบ.ม.)</figcaption>
      <ul className="flex items-end gap-3" aria-label="ปริมาณจำหน่ายรายไตรมาส">
        {QUARTERLY_BARS.map((q) => (
          <li key={q.labelTh} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs text-on-surface-variant tabular">
              <Num kind="decimal" digits={1} value={q.valueMm3} />
            </span>
            <span className="flex h-32 w-full items-end" aria-hidden="true">
              <span
                data-testid="quarter-bar"
                className="w-full rounded-t-md bg-primary"
                style={{ height: `${(q.valueMm3 / max) * 100}%` }}
              />
            </span>
            <span className="text-xs text-on-surface-variant">{q.labelTh}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Actual-vs-target table. Status is a StatusChip (icon + Thai label), never colour alone. */
function TargetTable(): JSX.Element {
  return (
    <table className="w-full border-collapse text-left text-sm" data-testid="target-table">
      <thead>
        <tr className="border-b border-outline-variant text-xs font-semibold uppercase text-on-surface-variant">
          <th className="py-2">ตัวชี้วัด</th>
          <th className="py-2 text-right">Actual</th>
          <th className="py-2 text-right">Target</th>
          <th className="py-2 text-right">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {TARGET_ROWS.map((row) => (
          <tr key={row.labelTh} className="border-b border-outline-variant">
            <td className="py-2 text-on-surface">{row.labelTh}</td>
            <td className="py-2 text-right text-on-surface tabular">{row.actualPct}%</td>
            <td className="py-2 text-right text-on-surface-variant tabular">{row.targetPct}%</td>
            <td className="py-2">
              <span className="flex justify-end">
                <StatusChip kind={row.status} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The report header line — reflects the selected template AND level (so the level radiogroup has a
 *  visible effect), under the whole-card SimulatedBadge, with the disabled export chips. */
function PreviewHeader({ template, level }: { readonly template: ReportTemplate; readonly level: ReportLevel }): JSX.Element {
  const levelLabel = REPORT_LEVELS.find((l) => l.id === level)?.labelTh ?? level;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <CardTitle className="text-base">
        {template.titleTh} · ระดับ{levelLabel} · {REPORT_CONTEXT.areaTh} · {REPORT_CONTEXT.periodTh}
        <SimulatedBadge className="ml-2 align-middle" />
      </CardTitle>
      <div className="flex gap-2">
        {EXPORT_FORMATS.map((fmt) => (
          <Button key={fmt} variant="outline" size="sm" type="button" disabled title="ตัวอย่าง — ยังไม่เปิดใช้งาน">
            {fmt}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * The generated-report preview (S6 output panel). The ENTIRE card is simulated → one
 * `SimulatedBadge` in the header (INTERACTIONS.md). The template, level and KPI-type selections all
 * shape what is shown here; export chips are disabled proposal chrome, honestly non-actionable.
 */
export function ReportPreview({ template, level, kpiTypes }: ReportPreviewProps): JSX.Element {
  return (
    <Card data-testid="report-preview">
      <CardHeader className="flex flex-col gap-3">
        <PreviewHeader template={template} level={level} />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <KpiTiles kpiTypes={kpiTypes} />
        <QuarterlyBars />
        <TargetTable />
      </CardContent>
    </Card>
  );
}
