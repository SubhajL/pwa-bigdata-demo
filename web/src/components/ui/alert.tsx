import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * The host for INTERACTIONS.md's three-part error formula:
 *   what happened · why · how to fix
 * e.g. "ไม่สามารถโหลดข้อมูลรายสาขาได้ · การเชื่อมต่อฐานข้อมูลหมดเวลา · กดลองใหม่อีกครั้ง".
 * Never a bare "Error".
 *
 * `role="alert"` on the error variant so a screen reader announces it.
 */
export const alertVariants = cva(
  "relative w-full rounded-card border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
  {
    variants: {
      variant: {
        info: "bg-surface-container text-on-surface border-outline-variant",
        warning: "border-status-warning/50 bg-surface-container text-on-surface [&>svg]:text-status-warning",
        error: "border-status-critical/50 bg-surface-container text-on-surface [&>svg]:text-status-critical",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps): JSX.Element {
  const isError = variant === "error";
  return (
    <div
      role={isError ? "alert" : undefined}
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  );
}

export function AlertTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>): JSX.Element {
  return <h5 className={cn("mb-1 font-semibold leading-none tracking-tight", className)} {...props}>{children}</h5>;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>): JSX.Element {
  return <p className={cn("text-sm text-on-surface-variant", className)} {...props} />;
}
