import { CalendarRange, MapPin, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  REPORT_CONTEXT,
  REPORT_KPI_TYPES,
  REPORT_LEVELS,
  type KpiTypeId,
  type ReportLevel,
} from "./report.config";

export interface ReportFiltersProps {
  readonly level: ReportLevel;
  readonly onLevelChange: (level: ReportLevel) => void;
  readonly kpiTypes: ReadonlySet<KpiTypeId>;
  readonly onToggleKpi: (id: KpiTypeId) => void;
  readonly onRun: () => void;
}

const PILL = "rounded-pill border px-3 py-1 text-sm transition-colors duration-[var(--anim-fast)] ease-standard";

/** A read-only context line (area / period) — these frame the previewed report, they are not inputs. */
function ContextLine(): JSX.Element {
  return (
    <div className="flex flex-col gap-1 text-sm text-on-surface-variant">
      <span className="flex items-center gap-2">
        <MapPin className="h-4 w-4" aria-hidden="true" /> {REPORT_CONTEXT.areaTh}
      </span>
      <span className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4" aria-hidden="true" /> {REPORT_CONTEXT.periodTh}
      </span>
    </div>
  );
}

/** Report granularity — a real radiogroup; the choice is shown in the preview header. */
function LevelFilter({ level, onLevelChange }: Pick<ReportFiltersProps, "level" | "onLevelChange">): JSX.Element {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">ระดับ</legend>
      <div role="radiogroup" aria-label="ระดับรายงาน" className="flex gap-2">
        {REPORT_LEVELS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={opt.id === level}
            onClick={() => onLevelChange(opt.id)}
            className={cn(PILL, opt.id === level ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant hover:border-primary")}
          >
            {opt.labelTh}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** KPI-type toggles — each selected type shows its tile in the preview. */
function KpiFilter({ kpiTypes, onToggleKpi }: Pick<ReportFiltersProps, "kpiTypes" | "onToggleKpi">): JSX.Element {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase text-on-surface-variant">ประเภท KPI</legend>
      <div className="flex flex-wrap gap-2">
        {REPORT_KPI_TYPES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            aria-pressed={kpiTypes.has(opt.id)}
            onClick={() => onToggleKpi(opt.id)}
            className={cn(PILL, kpiTypes.has(opt.id) ? "border-secondary bg-secondary text-on-primary" : "border-outline-variant text-on-surface-variant hover:border-secondary")}
          >
            {opt.labelTh}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The S6 "ตัวกรอง" panel. Level (radiogroup) and KPI types (toggle chips) are REAL local state that
 * shape the generated preview — level appears in the report header, and each KPI type shows/hides its
 * tile. "ประมวลผลรายงาน" invokes `onRun`, which reveals the preview. The figures are SIMULATED.
 */
export function ReportFilters({ level, onLevelChange, kpiTypes, onToggleKpi, onRun }: ReportFiltersProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ตัวกรอง · Report Filters</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ContextLine />
        <LevelFilter level={level} onLevelChange={onLevelChange} />
        <KpiFilter kpiTypes={kpiTypes} onToggleKpi={onToggleKpi} />
        <Button variant="primary" size="sm" type="button" onClick={onRun}>
          <PlayCircle className="h-4 w-4" aria-hidden="true" /> ประมวลผลรายงาน
        </Button>
      </CardContent>
    </Card>
  );
}
