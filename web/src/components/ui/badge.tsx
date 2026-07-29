import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Pill-shaped label (`rounded-pill`).
 *
 * NOTE the deliberate absence of a `simulated` variant: the violet token is reserved and
 * `SimulatedBadge` is its only consumer. Adding one here would let any screen paint
 * something violet, and `markers.test.tsx` would fail — by design.
 */
export const badgeVariants = cva(
  "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold transition-colors duration-[var(--anim-fast)] ease-standard",
  {
    variants: {
      variant: {
        neutral: "bg-surface-container text-on-surface-variant",
        primary: "bg-primary text-on-primary",
        secondary: "bg-secondary text-on-primary",
        outline: "border border-outline-variant text-on-surface-variant bg-transparent",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
