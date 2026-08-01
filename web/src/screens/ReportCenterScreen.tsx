import { FilePlus2, FileText } from "lucide-react";
import { useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

/** Before a report is generated, the output panel says so — an empty state, not a blank void. */
function PreviewPrompt(): JSX.Element {
  return (
    <Card data-testid="report-prompt">
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-on-surface-variant">
        <FileText className="h-8 w-8" aria-hidden="true" />
        กำหนดรูปแบบและตัวกรอง แล้วกด “ประมวลผลรายงาน” เพื่อสร้างตัวอย่าง
      </CardContent>
    </Card>
  );
}

interface WorkspaceProps {
  readonly template: ReportTemplate;
  readonly level: ReportLevel;
  readonly onLevelChange: (level: ReportLevel) => void;
  readonly kpiTypes: ReadonlySet<KpiTypeId>;
  readonly onToggleKpi: (id: KpiTypeId) => void;
  readonly hasRun: boolean;
  readonly onRun: () => void;
}

/** The two-column body: filters on the left, the preview (or its empty state) on the right. */
function ReportWorkspace(props: WorkspaceProps): JSX.Element {
  const { template, level, onLevelChange, kpiTypes, onToggleKpi, hasRun, onRun } = props;
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <ReportFilters level={level} onLevelChange={onLevelChange} kpiTypes={kpiTypes} onToggleKpi={onToggleKpi} onRun={onRun} />
      </div>
      <div className="lg:col-span-8">
        {hasRun ? <ReportPreview template={template} level={level} kpiTypes={kpiTypes} /> : <PreviewPrompt />}
      </div>
    </div>
  );
}

/**
 * Report Center (Stitch S6, PR-14) — a proposal-narrative screen. Templates + filters are REAL local
 * state that shape a SIMULATED report preview (badged): "ประมวลผลรายงาน" generates, "สร้างรายงานใหม่"
 * resets — genuine actions, not dead chrome. The `<h1>` renders synchronously carrying the nav label.
 */
export function ReportCenterScreen(): JSX.Element {
  const [templateId, setTemplateId] = useState<ReportTemplateId>(DEFAULT_TEMPLATE);
  const [level, setLevel] = useState<ReportLevel>("org");
  const [kpiTypes, setKpiTypes] = useState<ReadonlySet<KpiTypeId>>(new Set(["volume", "nrw"]));
  const [hasRun, setHasRun] = useState(false);
  const template = REPORT_TEMPLATES.find((t) => t.id === templateId) ?? REPORT_TEMPLATES[0];

  const toggleKpi = (id: KpiTypeId): void => {
    setKpiTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetReport = (): void => {
    setTemplateId(DEFAULT_TEMPLATE);
    setLevel("org");
    setKpiTypes(new Set(["volume", "nrw"]));
    setHasRun(false);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="report-center">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* h1 carries the nav labelTh ("ศูนย์รายงาน") so router T4 matches the heading. */}
        <h1 className="text-2xl font-semibold text-on-surface">ศูนย์รายงาน · Report Center</h1>
        <Button variant="outline" size="sm" type="button" onClick={resetReport}>
          <FilePlus2 className="h-4 w-4" aria-hidden="true" /> สร้างรายงานใหม่
        </Button>
      </div>
      <ReportTemplatePicker templates={REPORT_TEMPLATES} selectedId={templateId} onSelect={setTemplateId} />
      <ReportWorkspace
        template={template}
        level={level}
        onLevelChange={setLevel}
        kpiTypes={kpiTypes}
        onToggleKpi={toggleKpi}
        hasRun={hasRun}
        onRun={() => setHasRun(true)}
      />
      <footer className="flex items-center gap-2 text-sm text-on-surface-variant">
        <SimulatedBadge /> ตัวเลขในรายงานตัวอย่างเป็นข้อมูลจำลองเพื่อการสาธิต — ไม่ใช่ข้อมูลจริงของ กปภ.
      </footer>
    </div>
  );
}
