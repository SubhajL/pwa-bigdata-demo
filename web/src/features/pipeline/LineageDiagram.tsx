import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { conservationHolds } from "./pipelineClient";
import type { Conservation } from "./types";

export interface LineageDiagramProps {
  readonly conservation: Conservation | undefined;
}

const SVG_W = 480;
const SVG_H = 140;
const STAGE_Y = 60;
const DLQ_Y = 110;
const STAGES = [
  { label: "MQTT", x: 60 },
  { label: "Validate", x: 180 },
  { label: "TimescaleDB", x: 300 },
  { label: "API", x: 420 },
] as const;

/**
 * Data-lineage diagram (item 1.4 context): an SVG MQTT → Validate → TimescaleDB → API with a DLQ
 * branch EDGE, annotated with live conservation counts (ledger/telemetry/dead_letter) and the
 * client-recomputed holds ✓/✗ (text). SimulatedBadge in the card header. SEAM — fill against
 * LineageDiagram.test.tsx.
 */
export function LineageDiagram({ conservation }: LineageDiagramProps): JSX.Element {
  const hasData = conservation != null;
  const holds = hasData ? conservationHolds(conservation) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          สายข้อมูล (Data Lineage)
          <SimulatedBadge />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          role="img"
          aria-label="แผนภาพสายข้อมูล"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          height={SVG_H}
          className="overflow-visible"
        >
          {/* Main pipeline arrows */}
          {STAGES.slice(0, -1).map((stage, i) => {
            const next = STAGES[i + 1];
            return (
              <line
                key={`edge-${stage.label}-${next.label}`}
                x1={stage.x + 36}
                y1={STAGE_Y}
                x2={next.x - 36}
                y2={STAGE_Y}
                className="stroke-on-surface-variant"
                strokeWidth={2}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {/* Arrowhead marker */}
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" className="fill-on-surface-variant" />
            </marker>
          </defs>

          {/* DLQ branch edge: from Validate to DLQ node */}
          <path
            data-testid="dlq-edge"
            d={`M${STAGES[1].x},${STAGE_Y + 12} L${STAGES[1].x},${DLQ_Y} L${STAGES[1].x - 40},${DLQ_Y}`}
            fill="none"
            className="stroke-status-critical"
            strokeWidth={2}
            strokeDasharray="4 2"
          />

          {/* DLQ node */}
          <text x={STAGES[1].x - 76} y={DLQ_Y + 4} className="fill-status-critical text-[10px] font-semibold">
            DLQ
          </text>

          {/* Stage boxes with labels inside */}
          {STAGES.map((stage) => (
            <g key={`stage-${stage.label}`}>
              <rect
                x={stage.x - 28}
                y={STAGE_Y - 8}
                width={56}
                height={16}
                rx={4}
                className="fill-surface-container stroke-outline-variant"
                strokeWidth={1}
              />
              <text
                x={stage.x}
                y={STAGE_Y + 3}
                textAnchor="middle"
                className="fill-on-surface text-[10px] font-semibold"
              >
                {stage.label}
              </text>
            </g>
          ))}

          {/* Conservation counts */}
          {hasData && (
            <>
              <text x={60} y={STAGE_Y + 36} textAnchor="middle" className="fill-on-surface-variant text-[9px]">
                ledger: {conservation.ledger}
              </text>
              <text x={300} y={STAGE_Y + 36} textAnchor="middle" className="fill-on-surface-variant text-[9px]">
                telemetry: {conservation.telemetry}
              </text>
              <text x={STAGES[1].x - 76} y={DLQ_Y + 20} textAnchor="middle" className="fill-on-surface-variant text-[9px]">
                dead: {conservation.dead_letter}
              </text>
            </>
          )}

          {/* Holds verdict */}
          <text
            data-testid="holds"
            x={SVG_W / 2}
            y={hasData ? STAGE_Y + 50 : STAGE_Y + 36}
            textAnchor="middle"
            className={holds === true ? "fill-status-normal text-[12px] font-bold" : "fill-status-critical text-[12px] font-bold"}
          >
            {holds === true ? "✓ ข้อมูลถูกต้องครบถ้วน" : holds === false ? "✗ ข้อมูลไม่ครบถ้วน" : "รอข้อมูล..."}
          </text>
        </svg>
      </CardContent>
    </Card>
  );
}
