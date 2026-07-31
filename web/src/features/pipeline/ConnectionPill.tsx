import { Ban, HelpCircle, Loader, Wifi, WifiOff } from "lucide-react";

import { connectionKind } from "./pipelineClient";
import type { ConnectionKind, PipelineStatus } from "./types";

export interface ConnectionPillProps {
  readonly status: PipelineStatus;
}

const KIND_LABEL: Readonly<Record<ConnectionKind, string>> = {
  ok: "เชื่อมต่อแล้ว",
  pending: "กำลังเชื่อมต่อ",
  down: "ไม่ได้เชื่อมต่อ",
  disabled: "ปิดใช้งาน",
  unknown: "ไม่ทราบสถานะ",
};

const KIND_ICON: Readonly<Record<ConnectionKind, typeof Wifi>> = {
  ok: Wifi,
  pending: Loader,
  down: WifiOff,
  disabled: Ban,
  unknown: HelpCircle,
};

const KIND_COLOR: Readonly<Record<ConnectionKind, string>> = {
  ok: "text-status-normal",
  pending: "text-status-warning",
  down: "text-status-critical",
  disabled: "text-status-nodata",
  unknown: "text-status-nodata",
};

/**
 * MQTT connection pill (items 1.1/1.2): connectionKind(state) → icon + Thai label + colour (never
 * colour alone), plus connected_count / disconnect_count and last_error when present. SEAM — the
 * implementer fills the body against ConnectionPill.test.tsx; do not change the signature.
 */
export function ConnectionPill({ status }: ConnectionPillProps): JSX.Element {
  const kind = connectionKind(status.state);
  const Icon = KIND_ICON[kind];
  const label = KIND_LABEL[kind];
  const color = KIND_COLOR[kind];
  const isEnabled = status.state !== "disabled";

  return (
    <div
      data-kind={kind}
      className="flex flex-col gap-2 rounded-card border border-outline-variant bg-surface-container p-4"
    >
      <span className={["inline-flex items-center gap-2 text-dense font-semibold", color].join(" ")}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      {isEnabled && (
        <div className="flex gap-4 text-dense text-on-surface-variant">
          <span>
            เชื่อมต่อแล้ว{" "}
            <span className="tabular font-semibold text-on-surface">{status.connected_count}</span>{" "}
            ครั้ง
          </span>
          <span>
            หลุด{" "}
            <span className="tabular font-semibold text-on-surface">
              {status.disconnect_count}
            </span>{" "}
            ครั้ง
          </span>
          {status.last_error != null && (
            <span className="text-status-critical">
              ข้อผิดพลาด: {status.last_error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
