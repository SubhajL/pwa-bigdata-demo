/**
 * System Admin (Stitch S5, PR-13) — the screen's data + config in one place, so no literal
 * is buried in a component (CLAUDE.md).
 *
 * HONESTY: there is no real user roster / SSO directory in `data/curated` — this whole
 * screen is a proposal-narrative surface. Every value here is ILLUSTRATIVE and is always
 * rendered behind a `SimulatedBadge`; nothing claims to be measured PWA data.
 */
import type { BadgeProps } from "@/components/ui/badge";

export type AdminRole =
  | "executive"
  | "regional_director"
  | "branch_manager"
  | "analyst"
  | "system_admin";

export interface AdminUser {
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
  /** Human, Thai, relative "last seen" — deliberately not a real timestamp. */
  readonly lastLoginTh: string;
  /** Account enabled? Shown as an icon + Thai label, never colour alone. */
  readonly active: boolean;
}

/** Non-nullable Badge variant, so ROLE_META is exhaustive over the union. */
type RoleVariant = NonNullable<BadgeProps["variant"]>;

export interface RoleMeta {
  readonly labelEn: string;
  readonly labelTh: string;
  readonly variant: RoleVariant;
}

/** Role → its pill label (both scripts) + a token-safe Badge variant. */
export const ROLE_META: Readonly<Record<AdminRole, RoleMeta>> = {
  executive: { labelEn: "Executive", labelTh: "ผู้บริหาร", variant: "primary" },
  regional_director: { labelEn: "Regional Director", labelTh: "ผอ.เขต", variant: "secondary" },
  branch_manager: { labelEn: "Branch Manager", labelTh: "ผจก.สาขา", variant: "neutral" },
  analyst: { labelEn: "Analyst", labelTh: "นักวิเคราะห์", variant: "outline" },
  system_admin: { labelEn: "System Admin", labelTh: "ผู้ดูแลระบบ", variant: "outline" },
};

/**
 * SIMULATED user roster (S5 shows this table). The first row mirrors the mockup
 * (สมชาย / Executive); the rest give the RBAC story a realistic spread of roles and one
 * disabled account so the status column has more than one state to show.
 */
export const SIM_ROSTER: readonly AdminUser[] = [
  { name: "สมชาย ใจดี", email: "somchai@pwa.co.th", role: "executive", lastLoginTh: "วันนี้ 08:30", active: true },
  { name: "อารีย์ วงศ์ทอง", email: "areeya@pwa.co.th", role: "regional_director", lastLoginTh: "วันนี้ 09:15", active: true },
  { name: "ปิยะ สุขสันต์", email: "piya@pwa.co.th", role: "branch_manager", lastLoginTh: "เมื่อวานนี้ 17:40", active: true },
  { name: "นภา ทองคำ", email: "napha@pwa.co.th", role: "analyst", lastLoginTh: "3 วันก่อน", active: true },
  { name: "วิชัย มั่นคง", email: "wichai@pwa.co.th", role: "system_admin", lastLoginTh: "2 สัปดาห์ก่อน", active: false },
];

export type AdminTabId = "users" | "connections" | "ai" | "kpi" | "backup";

export interface AdminTab {
  readonly id: AdminTabId;
  readonly labelTh: string;
}

/** The five S5 tabs. Only `users` is realized; the rest are proposal-only (see the screen). */
export const ADMIN_TABS: readonly AdminTab[] = [
  { id: "users", labelTh: "ผู้ใช้และสิทธิ์" },
  { id: "connections", labelTh: "การเชื่อมต่อข้อมูล" },
  { id: "ai", labelTh: "ปัญญาประดิษฐ์ (AI)" },
  { id: "kpi", labelTh: "KPI & แจ้งเตือน" },
  { id: "backup", labelTh: "สำรอง & กู้คืน" },
];

/** The S5 SSO/AD capability chip — a proposal claim, hence badged SIMULATED where shown. */
export const SSO_NOTE_TH = "เชื่อมต่อ SSO / Active Directory ของ กปภ.";

/** Shown on every tab that is designed but not realized in this demo build. */
export const PROPOSAL_NOTE_TH =
  "ส่วนนี้เป็นการออกแบบเชิงข้อเสนอ (Stitch S5) — ยังไม่เปิดใช้งานในการสาธิต";
