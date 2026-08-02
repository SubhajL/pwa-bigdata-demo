import { FilePlus2 } from "lucide-react";
import { useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";
import { ReportFilters } from "@/features/report/ReportFilters";
import { ReportPreview } from "@/features/report/ReportPreview";
import { ReportTemplatePicker } from "@/features/report/ReportTemplatePicker";
import {
  DEFAULT_TEMPLATE,
  REPORT_TEMPLATES,
  type KpiTypeId,
  type ReportLevel,
  type ReportTemplate,
  type ReportTemplateId,
} from "@/features/report/report.config";

const DEFAULT_LEVEL: ReportLevel = "org";
const DEFAULT_KPIS: readonly KpiTypeId[] = ["volume", "nrw"];

/** A generated report is a SNAPSHOT of the filter selection, captured when ประมวลผลรายงาน runs. */
interface GeneratedReport {
  readonly templateId: ReportTemplateId;
  readonly level: ReportLevel;
  readonly kpiTypes: ReadonlySet<KpiTypeId>;
}

function snapshot(templateId: ReportTemplateId, level: ReportLevel, kpiTypes: Iterable<KpiTypeId>): GeneratedReport {
  return { templateId, level, kpiTypes: new Set(kpiTypes) };
}

function templateById(id: ReportTemplateId): ReportTemplate {
  return REPORT_TEMPLATES.find((t) => t.id === id) ?? REPORT_TEMPLATES[0];
}

/** Whether the pending filter selection still matches what the previewed report was generated from. */
function isGenerated(g: GeneratedReport, templateId: ReportTemplateId, level: ReportLevel, kpiTypes: ReadonlySet<KpiTypeId>): boolean {
  return (
    g.templateId === templateId &&
    g.level === level &&
    g.kpiTypes.size === kpiTypes.size &&
    [...kpiTypes].every((id) => g.kpiTypes.has(id))
  );
}

interface WorkspaceProps {
  readonly level: ReportLevel;
  readonly onLevelChange: (level: ReportLevel) => void;
  readonly kpiTypes: ReadonlySet<KpiTypeId>;
  readonly onToggleKpi: (id: KpiTypeId) => void;
  readonly onRun: () => void;
  readonly generated: GeneratedReport;
  readonly pendingChanges: boolean;
}

/** Filters on the left; the (always-present) generated preview on the right, with a pending-change hint. */
function ReportWorkspace(props: WorkspaceProps): JSX.Element {
  const { level, onLevelChange, kpiTypes, onToggleKpi, onRun, generated, pendingChanges } = props;
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <ReportFilters level={level} onLevelChange={onLevelChange} kpiTypes={kpiTypes} onToggleKpi={onToggleKpi} onRun={onRun} />
      </div>
      <div className="flex flex-col gap-2 lg:col-span-8">
        {pendingChanges ? (
          <p data-testid="report-dirty" role="status" className="text-sm text-on-surface-variant">
            ตัวเลือกเปลี่ยนแล้ว — กด “ประมวลผลรายงาน” เพื่ออัปเดตตัวอย่าง
          </p>
        ) : null}
        <ReportPreview template={templateById(generated.templateId)} level={generated.level} kpiTypes={generated.kpiTypes} />
      </div>
    </div>
  );
}

/** The screen header: title + "สร้างรายงานใหม่" reset. Extracted to keep the screen body ≤50 lines. */
function ReportHeader({ onReset }: { readonly onReset: () => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* h1 carries the nav labelTh ("ศูนย์รายงาน") so router T4 matches the heading. */}
      <h1 className="text-2xl font-semibold text-on-surface">ศูนย์รายงาน · Report Center</h1>
      <Button variant="outline" size="sm" type="button" onClick={onReset}>
        <FilePlus2 className="h-4 w-4" aria-hidden="true" /> สร้างรายงานใหม่
      </Button>
    </div>
  );
}

/**
 * Report Center (Stitch S6, PR-14) — a proposal-narrative screen. Templates + filters are REAL local
 * state that shape a SIMULATED report preview (badged). The screen LANDS on a generated default report
 * (Stitch shows a populated preview, not an empty panel); filter changes are pending until
 * "ประมวลผลรายงาน" applies them, and "สร้างรายงานใหม่" regenerates the defaults — both genuine actions,
 * not dead chrome. The `<h1>` renders synchronously carrying the nav label.
 */
export function ReportCenterScreen(): JSX.Element {
  const [templateId, setTemplateId] = useState<ReportTemplateId>(DEFAULT_TEMPLATE);
  const [level, setLevel] = useState<ReportLevel>(DEFAULT_LEVEL);
  const [kpiTypes, setKpiTypes] = useState<ReadonlySet<KpiTypeId>>(() => new Set(DEFAULT_KPIS));
  const [generated, setGenerated] = useState<GeneratedReport>(() =>
    snapshot(DEFAULT_TEMPLATE, DEFAULT_LEVEL, DEFAULT_KPIS),
  );

  const toggleKpi = (id: KpiTypeId): void => {
    setKpiTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runReport = (): void => setGenerated(snapshot(templateId, level, kpiTypes));

  const resetReport = (): void => {
    setTemplateId(DEFAULT_TEMPLATE);
    setLevel(DEFAULT_LEVEL);
    setKpiTypes(new Set(DEFAULT_KPIS));
    setGenerated(snapshot(DEFAULT_TEMPLATE, DEFAULT_LEVEL, DEFAULT_KPIS));
  };

  const pendingChanges = !isGenerated(generated, templateId, level, kpiTypes);

  return (
    <div className="flex flex-col gap-4" data-testid="report-center">
      <ReportHeader onReset={resetReport} />
      <ReportTemplatePicker templates={REPORT_TEMPLATES} selectedId={templateId} onSelect={setTemplateId} />
      <ReportWorkspace
        level={level}
        onLevelChange={setLevel}
        kpiTypes={kpiTypes}
        onToggleKpi={toggleKpi}
        onRun={runReport}
        generated={generated}
        pendingChanges={pendingChanges}
      />
      <footer className="flex items-center gap-2 text-sm text-on-surface-variant">
        <SimulatedBadge /> ตัวเลขในรายงานตัวอย่างเป็นข้อมูลจำลองเพื่อการสาธิต — ไม่ใช่ข้อมูลจริงของ กปภ.
      </footer>
    </div>
  );
}
