import { cn } from "@/lib/utils";

/**
 * Read by screen readers, so the marker is not a purely visual claim.
 * Exported because `markers.test.tsx` asserts the exact string.
 */
export const SIMULATED_ARIA_LABEL = "ข้อมูลจำลอง ไม่ใช่ข้อมูลจริงของ กปภ.";

export interface SimulatedBadgeProps {
  readonly className?: string;
}

/**
 * The violet `SIMULATED` pill. A P0 honesty control, not decoration.
 *
 * POC_SPEC §3.2 and CLAUDE.md both require that every synthetic value carries a visible
 * marker. Per design/INTERACTIONS.md it is never suppressed for density, on mobile, in
 * export, or in print — and removing one is a P0 defect, not a styling change.
 *
 * THIS COMPONENT IS THE ONLY PRODUCTION MODULE PERMITTED TO USE THE VIOLET TOKEN.
 * `markers.test.tsx` greps `src/` for both the custom property and the Tailwind utility
 * and fails if anything else references either — violet means "simulated" and nothing
 * else, so a violet button would quietly dilute the one signal the committee is told to
 * trust.
 *
 * Placement per INTERACTIONS.md: top-right on a KPI tile; in the `<th>` of a table
 * column, never repeated per cell; in the card header for a whole simulated card.
 */
export function SimulatedBadge({ className }: SimulatedBadgeProps): JSX.Element {
  return (
    <span
      aria-label={SIMULATED_ARIA_LABEL}
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-bold bg-simulated text-on-simulated",
        className,
      )}
    >
      SIMULATED
    </span>
  );
}
