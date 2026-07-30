import type { TwinPipe } from "./types";

export interface PipeEdgeProps {
  readonly pipe: TwinPipe;
  readonly affected: boolean;
}

/**
 * One pipe segment on the schematic. When `affected` (downstream of a pressure drop) it is
 * highlighted by BOTH a heavier dashed stroke AND a critical colour — never colour alone
 * (CLAUDE.md) — and marked `data-affected` so a test can prove the highlight without reading a
 * colour. Geometry comes from the topology (`x1..y2`).
 */
export function PipeEdge({ pipe, affected }: PipeEdgeProps): JSX.Element {
  return (
    <line
      // When affected, expose the state to assistive tech too — not just visually.
      role={affected ? "img" : undefined}
      aria-label={affected ? `ท่อ ${pipe.pipe_id} · แรงดันตก` : undefined}
      data-pipe={pipe.pipe_id}
      data-affected={affected ? "true" : "false"}
      x1={pipe.x1}
      y1={pipe.y1}
      x2={pipe.x2}
      y2={pipe.y2}
      className={
        affected
          ? "stroke-status-critical stroke-[6px] [stroke-dasharray:10_6]"
          : "stroke-outline-variant stroke-2"
      }
      strokeLinecap="round"
    />
  );
}
