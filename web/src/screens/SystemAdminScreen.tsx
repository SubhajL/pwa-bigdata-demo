import { UserPlus } from "lucide-react";
import { useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTabs } from "@/features/admin/AdminTabs";
import { UsersRolesTable } from "@/features/admin/UsersRolesTable";
import {
  ADMIN_TABS,
  PROPOSAL_NOTE_TH,
  SIM_ROSTER,
  type AdminTabId,
} from "@/features/admin/admin";

/**
 * System Admin (Stitch S5, PR-13) — a proposal-narrative screen: it demonstrates the designed
 * RBAC / SSO capability, so it carries NO real PWA data. The `<h1>` renders SYNCHRONOUSLY and
 * carries the nav `labelTh` (router T4 finds the screen by it). Only the `users` tab is
 * realized; the other four are honestly marked as designed-not-built.
 */
export function SystemAdminScreen(): JSX.Element {
  const [activeId, setActiveId] = useState<AdminTabId>("users");

  return (
    <div className="flex flex-col gap-4" data-testid="system-admin">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-on-surface">ระบบผู้ดูแลระบบ · System Admin</h1>
        {/* Proposal affordance — present to match the design, intentionally not wired in the demo. */}
        <Button variant="primary" size="sm" type="button" title="ตัวอย่างการออกแบบ">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          เพิ่มผู้ใช้
        </Button>
      </div>

      <AdminTabs tabs={ADMIN_TABS} activeId={activeId} onSelect={setActiveId} />

      <div id="admin-tab-panel" role="tabpanel" aria-labelledby={`admin-tab-${activeId}`}>
        {activeId === "users" ? (
          <UsersRolesTable roster={SIM_ROSTER} />
        ) : (
          <Card data-testid="admin-proposal-note">
            <CardContent className="py-8 text-center text-on-surface-variant">{PROPOSAL_NOTE_TH}</CardContent>
          </Card>
        )}
      </div>

      <footer className="flex items-center gap-2 text-dense text-on-surface-variant">
        <SimulatedBadge /> รายชื่อผู้ใช้ บทบาท และการเชื่อมต่อ SSO/AD เป็นข้อมูลจำลองเพื่อการสาธิต —
        ไม่ใช่ข้อมูลผู้ใช้จริงของ กปภ.
      </footer>
    </div>
  );
}
