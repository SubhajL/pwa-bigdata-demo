import { formatDecimal, formatInt, formatM3, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NumKind = "int" | "m3" | "percent" | "decimal";

export interface NumProps {
  readonly value: number | null | undefined;
  /** Which formatter to apply. Defaults to "int". */
  readonly kind?: NumKind;
  /** Fraction digits, forwarded to formatPercent and formatDecimal. Ignored for int/m3. */
  readonly digits?: number;
  readonly className?: string;
}

/**
 * THE way to render a numeral.
 *
 * tokens.map.md requires `font-variant-numeric: tabular-nums` on **every** numeral so
 * columns of figures align and a KPI does not reflow as it ticks. A formatter returning a
 * string cannot enforce that; this component can, and `primitives.test.tsx` asserts the
 * rendered element actually carries the class.
 *
 * Delegates the missing-vs-zero rule to `@/lib/format`, so `—` vs `0` is decided in one
 * place.
 */
export function Num(props: NumProps): JSX.Element {
  const { value, kind = "int", digits, className } = props;
  let text: string;
  if (kind === "m3") {
    text = formatM3(value);
  } else if (kind === "percent") {
    text = formatPercent(value, digits);
  } else if (kind === "decimal") {
    text = formatDecimal(value, digits);
  } else {
    text = formatInt(value);
  }
  return <span className={cn("tabular", className)}>{text}</span>;
}
