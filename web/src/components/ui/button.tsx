import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ForwardedRef } from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

/**
 * shadcn's Button, bound to OUR tokens.
 *
 * Every colour must come from a `--color-*` token via its Tailwind utility
 * (`bg-primary`, `text-on-surface`, `border-outline-variant`, …). A raw hex, a raw
 * duration, or a `shadow-[...]` arbitrary value fails `tokens.test.ts` — including when
 * it happens to match the mockup, because the mockup's own values drifted from the
 * contract.
 *
 * Focus ring per INTERACTIONS.md: `focus-visible:ring-2 ring-offset-2`. Never
 * `outline: none` without a replacement.
 * Transitions must reference `var(--anim-fast)`, never a literal duration.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center font-semibold rounded-control focus-visible:ring-2 ring-offset-2 ease-standard transition-all duration-[var(--anim-fast)] cursor-pointer disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:brightness-110 active:brightness-90",
        secondary: "bg-surface-container text-on-surface hover:brightness-95 active:brightness-90",
        ghost: "text-on-surface-variant hover:bg-surface-container active:bg-surface-container",
        outline: "border border-outline-variant text-on-surface bg-transparent hover:bg-surface-container active:bg-surface-container",
      },
      size: {
        sm: "h-9 px-3 text-sm gap-1.5",
        md: "h-11 px-5 text-base gap-2",
        lg: "h-12 px-6 text-lg gap-2.5",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (shadcn's `asChild`), e.g. to make a link look a button. */
  readonly asChild?: boolean;
  readonly ref?: ForwardedRef<HTMLButtonElement>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, asChild, children, ...props }, ref) {
    const classes = cn(buttonVariants({ variant, size, className }));
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={classes} {...props}>
        {children}
      </Comp>
    );
  },
);
