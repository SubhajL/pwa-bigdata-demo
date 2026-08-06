import type { TwinPipe } from "./types";

export interface PipeEdgeProps {
  readonly pipe: TwinPipe;
  readonly affected: boolean;
  /** When the pipe is affected, clicking the corridor opens the impact drawer (PR-J, source
   *  step 4). Absent (or when not affected) → the pipe is a plain, non-interactive segment. */
  readonly onOpenImpact?: () => void;
}

/**
 * One pipe segment on the schematic. When `affected` (downstream of a pressure drop) it is
 * highlighted by BOTH a heavier dashed stroke AND a critical colour — never colour alone
 * (CLAUDE.md) — and marked `data-affected` so a test can prove the highlight without reading a
 * colour. When `onOpenImpact` is supplied it becomes a keyboard-operable control (with a widened
 * transparent hit line) that opens the affected-customer drawer. Geometry comes from the topology.
 */
export function PipeEdge({ pipe, affected, onOpenImpact }: PipeEdgeProps): JSX.Element {
  const clickable = affected && onOpenImpact != null;
  const visible = (
    <line
      // For an affected but non-clickable pipe, expose the state to assistive tech on the line
      // itself; when clickable, the wrapping <g role="button"> owns the accessible name.
      role={affected && !clickable ? "img" : undefined}
      aria-label={affected && !clickable ? `ท่อ ${pipe.pipe_id} · แรงดันตก` : undefined}
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

  if (!clickable) return visible;

  return (
    <g
      role="button"
      tabIndex={0}
      data-testid="affected-pipe"
      aria-label={`ท่อ ${pipe.pipe_id} · แรงดันตก · ดูผู้ใช้น้ำที่ได้รับผลกระทบ`}
      className="cursor-pointer focus-visible:outline-none focus-visible:[outline:2px_solid_var(--color-ring)]"
      onClick={onOpenImpact}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenImpact?.();
        }
      }}
    >
      {/* A widened transparent hit line — a 6px dashed stroke is a poor click/tap target. */}
      <line
        x1={pipe.x1}
        y1={pipe.y1}
        x2={pipe.x2}
        y2={pipe.y2}
        stroke="transparent"
        strokeWidth={16}
        strokeLinecap="round"
      />
      {visible}
    </g>
  );
}
