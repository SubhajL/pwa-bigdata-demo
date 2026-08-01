/**
 * Report Center (Stitch S6, PR-14) — the screen's config + its SIMULATED report figures in one
 * place (CLAUDE.md: no literal buried in a component).
 *
 * HONESTY: this is a proposal-narrative screen. The report it previews is ILLUSTRATIVE — a
 * representative "กปภ.เขต 2" quarter, not a query over `data/curated` — so every figure is rendered
 * behind a `SimulatedBadge`. Nothing here claims to be measured PWA data.
 */
import type { StatusKind } from "@/components/StatusChip";

export type ReportTemplateId = "executive" | "hierarchical" | "deep";

export interface ReportTemplate {
  readonly id: ReportTemplateId;
  readonly titleTh: string;
  readonly descTh: string;
}

/** The three S6 report templates. `hierarchical` is the mock's selected default. */
export const REPORT_TEMPLATES: readonly ReportTemplate[] = [
  { id: "executive", titleTh: "รายงานสรุปผู้บริหาร", descTh: "Strategic KPI: ผลิต–จ่าย, NRW, พลังงาน" },
  { id: "hierarchical", titleTh: "รายงานตามลำดับชั้น", descTh: "องค์กร / เขต / สาขา" },
  { id: "deep", titleTh: "รายงานวิเคราะห์เชิงลึก", descTh: "Pump Efficiency, สารเคมี, Demand Forecast" },
];

export const DEFAULT_TEMPLATE: ReportTemplateId = "hierarchical";

export type ReportLevel = "org" | "region" | "branch";

export interface ReportLevelOption {
  readonly id: ReportLevel;
  readonly labelTh: string;
}

export const REPORT_LEVELS: readonly ReportLevelOption[] = [
  { id: "org", labelTh: "องค์กร" },
  { id: "region", labelTh: "เขต" },
  { id: "branch", labelTh: "สาขา" },
];

export type KpiTypeId = "volume" | "nrw" | "energy";

export interface KpiTypeOption {
  readonly id: KpiTypeId;
  readonly labelTh: string;
}

export const REPORT_KPI_TYPES: readonly KpiTypeOption[] = [
  { id: "volume", labelTh: "ปริมาณจำหน่าย" },
  { id: "nrw", labelTh: "NRW" },
  { id: "energy", labelTh: "พลังงาน" },
];

/** Read-only context for the previewed report (mirrors the S6 header). */
export const REPORT_CONTEXT = {
  areaTh: "กปภ.เขต 2",
  periodTh: "ต.ค.–ธ.ค. 2568",
} as const;

export interface ReportKpi {
  readonly id: KpiTypeId;
  readonly labelTh: string;
  readonly value: number;
  readonly kind: "int" | "decimal";
  readonly unit: string;
  readonly digits?: number;
}

/** The three SIMULATED headline KPIs (S6 output panel). Values mirror the mockup. */
export const REPORT_KPIS: readonly ReportKpi[] = [
  { id: "volume", labelTh: "ปริมาณจำหน่าย", value: 21_515_813, kind: "int", unit: "ลบ.ม." },
  { id: "nrw", labelTh: "NRW", value: 29.7, kind: "decimal", digits: 1, unit: "%" },
  { id: "energy", labelTh: "พลังงาน", value: 48.2, kind: "decimal", digits: 1, unit: "ล้านบาท" },
];

export interface QuarterBar {
  readonly labelTh: string;
  /** Water sold, million m³ (single measure → single hue, one y-axis). */
  readonly valueMm3: number;
}

/**
 * SIMULATED quarterly trend (S6 "แนวโน้มรายไตรมาส"). Illustrative values chosen with real spread so
 * a zero-baseline single-hue bar chart (never a truncated axis) actually reads as a rising trend —
 * clustered near-equal values would render as four identical bars.
 */
export const QUARTERLY_BARS: readonly QuarterBar[] = [
  { labelTh: "ไตรมาส 1", valueMm3: 15.2 },
  { labelTh: "ไตรมาส 2", valueMm3: 17.9 },
  { labelTh: "ไตรมาส 3", valueMm3: 20.4 },
  { labelTh: "ไตรมาส 4", valueMm3: 22.6 },
];

export interface TargetRow {
  readonly labelTh: string;
  readonly actualPct: number;
  readonly targetPct: number;
  /** Status is icon + Thai label (StatusChip), never colour alone. */
  readonly status: StatusKind;
}

/** SIMULATED "เทียบเป้าหมาย" table (S6). NRW is over target → warning; the rest meet it. */
export const TARGET_ROWS: readonly TargetRow[] = [
  { labelTh: "ผลิตน้ำ", actualPct: 98, targetPct: 95, status: "normal" },
  { labelTh: "NRW", actualPct: 31, targetPct: 28, status: "warning" },
  { labelTh: "รายได้", actualPct: 102, targetPct: 100, status: "normal" },
];

/** Export formats the designed report offers (inert proposal chrome, honestly labelled). */
export const EXPORT_FORMATS: readonly string[] = ["PDF", "XLSX", "CSV"];
