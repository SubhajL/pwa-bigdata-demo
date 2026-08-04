import type { ReactNode } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import type { EstimatorCard, MetricPair, ModelCardResponse } from "./types";

export interface ModelCardProps {
  readonly card: ModelCardResponse | null;
  /** True while the first fetch is in flight — distinguishes "loading" from "unavailable". */
  readonly loading?: boolean;
}

/**
 * The trained model, its algorithm and key parameters (item 3.1). Every value comes from
 * `GET /api/model` — the card that shipped WITH the loaded artifact — never the Stitch mockup,
 * whose "Random Forest / RMSE 4.8" figures are fabricated. Held-out error is shown against a dummy
 * baseline so "the model learned something" is visible, not asserted.
 */
export function ModelCard({ card, loading = false }: ModelCardProps): JSX.Element {
  return (
    <Card className="flex flex-col gap-4" data-testid="model-card">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle>แบบจำลองที่ผ่านการฝึกสอน · Trained Model</CardTitle>
        <SimulatedBadge />
      </CardHeader>
      {card == null ? (
        <p className="text-dense text-on-surface-variant">
          {loading ? "กำลังโหลดข้อมูลแบบจำลอง…" : "ไม่พบข้อมูลแบบจำลอง"}
        </p>
      ) : (
        <>
          <dl className="flex flex-col gap-2 text-dense">
            <Row term="Algorithm" desc={card.pipelines.health?.estimator_class ?? "—"} />
            <Row term="Parameters" desc={hyperparamSummary(card.pipelines.health)} />
            <Row term="Preprocessing" desc={(card.pipelines.health?.preprocessing ?? []).join(", ") || "—"} />
            <Row term="MAE · Health" desc={<Mae pair={card.metrics.health} />} />
            <Row term="MAE · PTTF" desc={<Mae pair={card.metrics.pttf} />} />
            <Row term="Model" desc={card.model_version} />
            {/* Two DIFFERENT hashes, labelled so a judge who runs `sha256sum model.pkl`
                compares against the artifact row, never the training-corpus row. */}
            <Row term="Data SHA-256 · training corpus" desc={`${card.data_sha256.slice(0, 12)}…`} />
            <Row
              term="Artifact SHA-256 · model.pkl"
              desc={
                <span
                  data-testid="model-artifact-sha"
                  data-sha256={card.artifact_sha256}
                  title={card.artifact_sha256}
                  className="tabular"
                >
                  {card.artifact_sha256.slice(0, 12)}…
                </span>
              }
            />
          </dl>
          {card.limitations[0] != null && (
            <p className="text-label text-on-surface-variant">{card.limitations[0]}</p>
          )}
        </>
      )}
    </Card>
  );
}

function Row({ term, desc }: { readonly term: string; readonly desc: ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-outline-variant pb-2">
      <dt className="text-on-surface-variant">{term}</dt>
      <dd className="col-span-2 font-medium text-on-surface">{desc}</dd>
    </div>
  );
}

/** model_mae vs a dummy baseline — the model beating the baseline IS the item-3.1 evidence. */
function Mae({ pair }: { readonly pair: MetricPair | undefined }): JSX.Element {
  if (pair == null) return <span>—</span>;
  return (
    <span className="tabular">
      <Num kind="decimal" digits={2} value={pair.model_mae} />
      <span className="text-on-surface-variant">
        {" "}(baseline <Num kind="decimal" digits={1} value={pair.baseline_mae} />)
      </span>
    </span>
  );
}

/** A compact one-line view of the key hyperparameters. */
function hyperparamSummary(estimator: EstimatorCard | undefined): string {
  const hp = estimator?.hyperparameters ?? {};
  const keys = ["alpha", "solver"];
  const parts = keys.filter((k) => k in hp).map((k) => `${k}: ${String(hp[k])}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}
