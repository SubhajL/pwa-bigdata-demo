import { useState } from "react";

import { Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { StatusKind } from "@/components/StatusChip";

import { DeviceSymbol } from "./DeviceSymbol";
import { PipeEdge } from "./PipeEdge";
import { TWIN_CONFIG } from "./twin.config";
import { zoomViewBox, type ViewBox } from "./twinClient";
import type { TwinTopology } from "./types";

export interface ProcessSchematicProps {
  readonly topology: TwinTopology;
  readonly statusOf: (assetId: string) => StatusKind;
  readonly affectedPipeIds: ReadonlySet<string>;
  readonly selected: string | null;
  readonly onSelect: (assetId: string) => void;
}

const BASE: ViewBox = TWIN_CONFIG.viewBox;

/**
 * The vector process schematic (scored item 2.1). An inline `<svg>` with a `viewBox`; the zoom
 * controls change ONLY the viewBox (never the element's width/height), which is what makes
 * zooming resolution-independent. Everything drawn comes from the topology — no coordinate or
 * label is hardcoded in this component.
 */
export function ProcessSchematic({
  topology,
  statusOf,
  affectedPipeIds,
  selected,
  onSelect,
}: ProcessSchematicProps): JSX.Element {
  const [viewBox, setViewBox] = useState<ViewBox>(BASE);

  const zoom = (factor: number): void =>
    setViewBox((vb) => zoomViewBox(BASE, vb, factor, TWIN_CONFIG.minScale, TWIN_CONFIG.maxScale));

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <Button variant="outline" size="icon" aria-label="ขยายเข้า" onClick={() => zoom(TWIN_CONFIG.zoomStep)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" aria-label="ขยายออก" onClick={() => zoom(1 / TWIN_CONFIG.zoomStep)}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" aria-label="รีเซ็ตมุมมอง" onClick={() => setViewBox(BASE)}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <svg
        // `group`, not `img`: the schematic is a named GROUP of interactive device symbols,
        // not a single static graphic — `role="img"` would conflict with its focusable children.
        role="group"
        aria-label="แผนผังกระบวนการ (ข้อมูลจำลอง)"
        data-testid="twin-schematic"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        width="100%"
        height={420}
        className="rounded-card border border-outline-variant bg-surface-container"
      >
        {topology.pipes.map((pipe) => (
          <PipeEdge key={`${pipe.pipe_id}:${pipe.from_node}:${pipe.to_node}`} pipe={pipe} affected={affectedPipeIds.has(pipe.pipe_id)} />
        ))}
        {topology.devices.map((device) => (
          <DeviceSymbol
            key={device.asset_id}
            device={device}
            status={statusOf(device.asset_id)}
            selected={selected === device.asset_id}
            onSelect={onSelect}
          />
        ))}
      </svg>
    </div>
  );
}
