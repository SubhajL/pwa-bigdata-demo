import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Loading placeholder that PRESERVES FINAL GEOMETRY.
 *
 * INTERACTIONS.md is explicit: "Skeleton matching final geometry — KPI tiles keep their
 * height, table renders 8 skeleton rows. Never a centred spinner that collapses layout
 * and shifts the page." Callers therefore pass explicit sizing utilities.
 *
 * Any pulse animation must use a motion token and is disabled by the global
 * reduced-motion block in globals.css.
 */
export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-card bg-surface-container",
        className,
      )}
      {...props}
    />
  );
}
