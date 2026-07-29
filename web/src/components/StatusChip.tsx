import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type StatusKind = "normal" | "warning" | "critical" | "nodata";

/**
 * The Thai label for each status. Exported because it IS the contract: status must never
 * be encoded by colour alone, so this text is mandatory, not decorative.
 */
export const STATUS_LABEL_TH: Readonly<Record<StatusKind, string>> = {
  normal: "ปกติ",
  warning: "เฝ้าระวัง",
  critical: "วิกฤต",
  nodata: "ไม่มีข้อมูล",
};

export interface StatusChipProps {
  readonly kind: StatusKind;
  readonly className?: string;
}

const ICON_MAP: Record<StatusKind, typeof CheckCircle> = {
  normal: CheckCircle,
  warning: AlertTriangle,
  critical: XCircle,
  nodata: Info,
};

const COLOR_MAP: Record<StatusKind, string> = {
  normal: "text-status-normal",
  warning: "text-status-warning",
  critical: "text-status-critical",
  nodata: "text-status-nodata",
};

/**
 * Status as icon + Thai label + colour — in that order of importance.
 *
 * `CLAUDE.md` forbids colour-only status, and the palette depends on it: dark-mode
 * `--status-warning` ships at L 0.7336, above the validator's dark ceiling, and
 * tokens.map.md admits it **only** because "status always carries an icon and a Thai text
 * label, which is the required secondary encoding. If status ever renders as a bare
 * colour swatch, this token is invalid."
 *
 * So each kind must render a DISTINCT icon and a DISTINCT label. `markers.test.tsx`
 * asserts pairwise distinctness — an identical icon for every state would satisfy a naive
 * "an svg exists" check while encoding nothing.
 *
 * Each icon must carry `data-icon={kind}` so the test can prove which one rendered.
 */
export function StatusChip({ kind, className }: StatusChipProps): JSX.Element {
  const Icon = ICON_MAP[kind];
  const label = STATUS_LABEL_TH[kind];
  const color = COLOR_MAP[kind];
  return (
    <span className={cn("inline-flex items-center gap-1", color, className)}>
      <Icon data-icon={kind} className="h-4 w-4" aria-hidden="true" />
      <span className="text-sm font-semibold">{label}</span>
    </span>
  );
}
