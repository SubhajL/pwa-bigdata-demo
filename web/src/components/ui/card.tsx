import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * The surface every screen composes from.
 *
 * Shape and elevation come from tokens: `rounded-card` (1rem), `shadow-card`,
 * `bg-surface-container-lowest`, and a 1px `border-outline-variant`. Card padding is the
 * 24px gutter from the spacing scale.
 */
export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-card shadow-card bg-surface-container-lowest border border-outline-variant p-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardProps): JSX.Element {
  return <div className={cn("flex flex-col gap-1.5 pb-4", className)} {...props} />;
}

/** Renders an `<h2>`-level heading by default. */
export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>): JSX.Element {
  return (
    <h2
      className={cn("font-semibold text-lg text-on-surface", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function CardContent({ className, ...props }: CardProps): JSX.Element {
  return <div className={cn("pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: CardProps): JSX.Element {
  return <div className={cn("flex items-center pt-4", className)} {...props} />;
}
