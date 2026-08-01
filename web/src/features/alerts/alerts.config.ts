/**
 * Alert Center (Stitch S7, PR-15) — config + its SIMULATED alert data in one place (CLAUDE.md).
 *
 * HONESTY: a proposal-narrative screen. The alert feed, counts, rules and channels are ILLUSTRATIVE
 * (not driven by the live pipeline), so the screen renders a `SimulatedBadge`; nothing here claims to
 * be a real alert. (The scored, live alerting story lives on the Pipeline/Predictive demo screens.)
 */
import { AlertTriangle, Bell, Info, XCircle, type LucideIcon } from "lucide-react";
import { Mail, MessageSquare, Smartphone } from "lucide-react";

export type AlertSeverity = "critical" | "warning" | "info";

export interface SeverityMeta {
  readonly labelTh: string;
  /** Text/icon colour token — paired with an icon + label, so never colour alone. */
  readonly textToken: string;
  readonly borderToken: string;
  readonly icon: LucideIcon;
}

export const SEVERITY_META: Readonly<Record<AlertSeverity, SeverityMeta>> = {
  critical: { labelTh: "วิกฤต", textToken: "text-status-critical", borderToken: "border-status-critical", icon: XCircle },
  warning: { labelTh: "เฝ้าระวัง", textToken: "text-status-warning", borderToken: "border-status-warning", icon: AlertTriangle },
  info: { labelTh: "แจ้งข้อมูล", textToken: "text-primary", borderToken: "border-primary", icon: Info },
};

export interface AlertItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly source: string;
  readonly timeAgoTh: string;
  readonly tags: readonly string[];
  readonly severity: AlertSeverity;
}

/** The SIMULATED alert feed (S7). Sampled active alerts — the aggregate counts below are larger. */
export const ALERTS: readonly AlertItem[] = [
  {
    id: "a1",
    title: "ปั๊ม P-2: ค่า SEC สูงผิดปกติ (0.42 kWh/m³)",
    detail: "ระบบ AI ตรวจพบแนวโน้มขัดข้อง",
    source: "SCADA",
    timeAgoTh: "2 นาทีที่แล้ว",
    tags: ["Operator", "Branch"],
    severity: "critical",
  },
  {
    id: "a2",
    title: "DMA-03 สิงห์บุรี: แรงดันตกต่ำกว่าเกณฑ์",
    detail: "กระทบผู้ใช้น้ำ 1,284 ราย",
    source: "DMAMA",
    timeAgoTh: "5 นาทีที่แล้ว",
    tags: ["Branch", "Regional"],
    severity: "critical",
  },
  {
    id: "a3",
    title: "กปภ.สาขาสิงห์บุรี: NRW 38.7% เกินเกณฑ์ 35%",
    detail: "สูงต่อเนื่อง 3 เดือน",
    source: "Analytics",
    timeAgoTh: "1 ชม.ที่แล้ว",
    tags: ["Regional"],
    severity: "warning",
  },
];

/** SIMULATED aggregate counts (S7 summary tiles). Acknowledging a feed alert adjusts these live. */
export const BASE_COUNTS: Readonly<Record<AlertSeverity | "acknowledged", number>> = {
  critical: 3,
  warning: 8,
  info: 21,
  acknowledged: 12,
};

export type FeedFilterId = "all" | AlertSeverity;

export interface FeedFilter {
  readonly id: FeedFilterId;
  readonly labelTh: string;
}

export const FEED_FILTERS: readonly FeedFilter[] = [
  { id: "all", labelTh: "ทั้งหมด" },
  { id: "critical", labelTh: "วิกฤต" },
  { id: "warning", labelTh: "เฝ้าระวัง" },
];

export interface AlertRule {
  readonly id: string;
  readonly textTh: string;
  readonly defaultOn: boolean;
}

export const ALERT_RULES: readonly AlertRule[] = [
  { id: "nrw", textTh: "NRW > 35% → แจ้ง ผอ.เขต", defaultOn: true },
  { id: "pressure", textTh: "แรงดัน < 1.5 บาร์ → แจ้ง Operator", defaultOn: true },
];

export interface AlertChannel {
  readonly id: string;
  readonly labelTh: string;
  readonly icon: LucideIcon;
  readonly enabled: boolean;
}

export const ALERT_CHANNELS: readonly AlertChannel[] = [
  { id: "email", labelTh: "Email", icon: Mail, enabled: true },
  { id: "line", labelTh: "LINE Notify", icon: MessageSquare, enabled: true },
  { id: "sms", labelTh: "SMS", icon: Smartphone, enabled: false },
];

export const AI_TRIAGE_NOTE_TH = "การจัดหมวดหมู่การแจ้งเตือนโดย AI — จัดกลุ่มและจัดลำดับความสำคัญอัตโนมัติ";

/** The bell icon for the feed header, re-exported so the screen imports icons from one place. */
export const FEED_ICON: LucideIcon = Bell;
