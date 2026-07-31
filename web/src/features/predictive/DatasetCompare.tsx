import type { ReactNode } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip } from "@/components/StatusChip";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import { pttfDays } from "./predictiveClient";
import type { DatasetScore } from "./types";

export interface DatasetCompareProps {
  readonly datasets: readonly DatasetScore[];
}

const TILE_LABEL: Readonly<Record<string, string>> = {
  healthy: "Dataset A · ปกติ (Normal)",
  degraded: "Dataset B · เสื่อมสภาพ (Degraded)",
};

/**
 * Health & PTTF on two datasets (item 3.2). The two reserved lifecycles are scored through the
 * shipped model at IN-DOMAIN windows, so the contrast is honest predictive discrimination — a
 * healthy device vs one about to fail — not a post-failure saturation. A censored PTTF is shown
 * with a "≥" so an extrapolated bound never reads as an exact estimate.
 */
export function DatasetCompare({ datasets }: DatasetCompareProps): JSX.Element {
  const byName = new Map(datasets.map((d) => [d.name, d]));
  return (
    <Card className="flex flex-col gap-4" data-testid="dataset-compare">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle>Health Score บนชุดข้อมูล 2 ชุด</CardTitle>
        <SimulatedBadge />
      </CardHeader>
      <div className="flex flex-col gap-4">
        <DatasetTile score={byName.get("healthy")} />
        <DatasetTile score={byName.get("degraded")} />
      </div>
      <p className="text-center text-dense text-on-surface-variant">
        โมเดลตอบสนองต่อชุดข้อมูลที่แตกต่างกัน
      </p>
    </Card>
  );
}

function DatasetTile({ score }: { readonly score: DatasetScore | undefined }): JSX.Element {
  if (score == null) return <p className="text-dense text-on-surface-variant">—</p>;
  const days = pttfDays(score.pttf_hours);
  return (
    <div
      data-testid={`dataset-${score.name}`}
      className="flex items-center justify-between rounded-control border border-outline-variant p-4"
    >
      <div className="flex flex-col gap-1">
        <span className="text-label text-on-surface-variant">{TILE_LABEL[score.name] ?? score.name}</span>
        <div className="flex items-baseline gap-6">
          <Metric label="Health" value={<Num kind="int" value={score.health_score} />} />
          <Metric
            label="PTTF (วัน)"
            value={
              <span className="tabular">
                {score.pttf_out_of_range && (
                  <>
                    <span className="sr-only">อย่างน้อย </span>
                    <span aria-hidden="true">≥ </span>
                  </>
                )}
                <Num kind="decimal" digits={1} value={days} />
              </span>
            }
          />
        </div>
      </div>
      <StatusChip kind={score.status} />
    </div>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-label text-on-surface-variant">{label}</span>
      <span className="text-xl font-semibold text-on-surface">{value}</span>
    </div>
  );
}
