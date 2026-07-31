import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { kpiFromWorklist } from "./predictiveClient";
import { PREDICTIVE_CONFIG } from "./predictive.config";
import type { WorklistItem } from "./types";

export interface KpiRowProps {
  readonly items: readonly WorklistItem[];
  readonly modelVersion: string | null;
}

/**
 * KPI tiles for topic ๓ (all derived, no literal): at-risk device count (warning+critical),
 * average Health Score, count with PTTF < 7 days, and the loaded model version. Every model-derived
 * tile carries a SimulatedBadge; the model-version tile is metadata (not a synthetic measurement),
 * so it gets a plain caption rather than a violet badge.
 */
export function KpiRow({ items, modelVersion }: KpiRowProps): JSX.Element {
  const kpi = kpiFromWorklist(items, PREDICTIVE_CONFIG.pttfWarningHours);
  const pttfDays = PREDICTIVE_CONFIG.pttfWarningHours / 24;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="predictive-kpis">
      <KpiTile
        testId="kpi-atrisk"
        label="อุปกรณ์เฝ้าระวัง"
        value={kpi.atRisk}
        scope={`Health < ${PREDICTIVE_CONFIG.healthWarningBelow}`}
        badge
      />
      <KpiTile testId="kpi-avghealth" label="Health Score เฉลี่ย" value={kpi.avgHealth} digits={1} badge />
      <KpiTile
        testId="kpi-pttf"
        label={`คาดว่าจะเสียใน ${pttfDays} วัน`}
        value={kpi.pttfUnder}
        scope={`จาก ${kpi.total} อุปกรณ์`}
        badge
      />
      <ModelTile version={modelVersion} />
    </div>
  );
}

function KpiTile({
  testId,
  label,
  value,
  digits,
  scope,
  badge,
}: {
  readonly testId: string;
  readonly label: string;
  readonly value: number | null;
  readonly digits?: number;
  readonly scope?: string;
  readonly badge?: boolean;
}): JSX.Element {
  return (
    <Card data-testid={testId} className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-dense text-on-surface-variant">{label}</span>
        {badge === true && <SimulatedBadge />}
      </div>
      <span className="text-2xl font-semibold text-on-surface tabular">
        <Num kind={digits != null ? "decimal" : "int"} digits={digits} value={value} />
      </span>
      {scope != null && <span className="text-label text-on-surface-variant">{scope}</span>}
    </Card>
  );
}

/** The loaded model's version. Metadata about the artifact, not a simulated measurement. */
function ModelTile({ version }: { readonly version: string | null }): JSX.Element {
  return (
    <Card data-testid="kpi-model" className="flex flex-col gap-2 p-4">
      <span className="text-dense text-on-surface-variant">โมเดลที่ใช้งาน</span>
      <span className="text-lg font-semibold text-on-surface">{version ?? "—"}</span>
      <span className="text-label text-on-surface-variant">สภาพแวดล้อมสาธิต</span>
    </Card>
  );
}
