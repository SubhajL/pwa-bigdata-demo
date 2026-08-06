import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { typeLabelTh } from "./impactView";
import type { DemoCustomerDetail } from "./types";

export interface CustomerDetailPanelProps {
  readonly detail: DemoCustomerDetail | null;
  readonly loading: boolean;
  /** The fetch settled but FAILED — render an explicit error + retry, never a permanent spinner. */
  readonly error?: boolean;
  readonly onRetry?: () => void;
}

/**
 * One selected SIMULATED account's synthetic metadata (PR-J, source step 7): customer/account/
 * meter ids, type + subtype, meter size, pressure zone, and the scenario address — the fields a
 * judge can inspect, none of which is real PII. The 12-month readings are rendered separately by
 * `MonthlyMeterReadings`. The whole card carries the SIMULATED marker (every field is generated).
 */
export function CustomerDetailPanel({
  detail,
  loading,
  error = false,
  onRetry,
}: CustomerDetailPanelProps): JSX.Element {
  return (
    <Card data-testid="customer-detail">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-title">ข้อมูลผู้ใช้น้ำ</CardTitle>
        <SimulatedBadge />
      </CardHeader>
      <CardContent>
        {error ? (
          <div data-testid="customer-detail-error" className="flex flex-col items-start gap-2">
            <p className="text-status-critical">
              โหลดข้อมูลผู้ใช้น้ำไม่สำเร็จ · การเชื่อมต่อขัดข้อง
            </p>
            {onRetry != null && (
              <Button variant="outline" size="sm" data-testid="customer-detail-retry" onClick={onRetry}>
                ลองใหม่อีกครั้ง
              </Button>
            )}
          </div>
        ) : loading ? (
          <p className="text-on-surface-variant">กำลังโหลดข้อมูลผู้ใช้น้ำ…</p>
        ) : detail == null ? (
          <p className="text-on-surface-variant">เลือกผู้ใช้น้ำจากรายชื่อเพื่อดูรายละเอียด</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-dense">
            <Field label="รหัสผู้ใช้น้ำ" value={detail.customer_id} mono />
            <Field label="เลขที่บัญชี" value={detail.account_no} mono />
            <Field label="หมายเลขมาตร" value={detail.meter_no} mono />
            <Field label="ประเภท" value={typeLabelTh(detail.type_code, detail.subtype_code)} />
            <Field label="ขนาดมาตร" value={detail.meter_size} />
            <Field label="โซนแรงดัน" value={detail.pressure_zone_id} />
            <Field label="ที่อยู่" value={detail.address_label} />
            <Field label="พื้นที่บริการ" value={detail.area} />
            <Field label="สาขา" value={detail.branch} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

/** One key/value row. A null/empty value renders `—` (INTERACTIONS: never a bare 0/blank). */
function Field({
  label,
  value,
  mono,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly mono?: boolean;
}): JSX.Element {
  return (
    <>
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className={mono ? "font-mono text-on-surface" : "text-on-surface"}>
        {value != null && value !== "" ? value : "—"}
      </dd>
    </>
  );
}
