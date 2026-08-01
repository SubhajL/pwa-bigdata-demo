import { Ban, CheckCircle, ShieldCheck } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ROLE_META, SSO_NOTE_TH, type AdminUser } from "./admin";

export interface UsersRolesTableProps {
  readonly roster: readonly AdminUser[];
}

/** Account status as icon + Thai label (never colour alone — CLAUDE.md dataviz rule). */
function AccountStatus({ active }: { readonly active: boolean }): JSX.Element {
  const Icon = active ? CheckCircle : Ban;
  const label = active ? "ใช้งาน" : "ปิดใช้งาน";
  const color = active ? "text-status-normal" : "text-status-nodata";
  return (
    <span className={`inline-flex items-center justify-end gap-1 ${color}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="text-sm font-semibold">{label}</span>
    </span>
  );
}

function UserRow({ user }: { readonly user: AdminUser }): JSX.Element {
  const role = ROLE_META[user.role];
  return (
    <tr className="border-b border-outline-variant">
      <td className="px-4 py-3 text-on-surface">{user.name}</td>
      <td className="px-4 py-3 text-on-surface-variant">{user.email}</td>
      <td className="px-4 py-3">
        <Badge variant={role.variant}>{role.labelEn}</Badge>
      </td>
      <td className="px-4 py-3 text-on-surface-variant">{user.lastLoginTh}</td>
      <td className="px-4 py-3 text-right">
        <AccountStatus active={user.active} />
      </td>
    </tr>
  );
}

/**
 * The RBAC roster (S5 Section A). The ENTIRE card is simulated, so `SimulatedBadge` sits in
 * the header once (INTERACTIONS.md: header for a whole simulated card, not per cell). The
 * SSO/Active-Directory chip is a proposal capability claim, so it too is under the badge.
 */
export function UsersRolesTable({ roster }: UsersRolesTableProps): JSX.Element {
  return (
    <Card data-testid="users-roles">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <CardTitle className="flex items-center gap-2">
          การจัดการสิทธิ์และการเข้าถึง · Users &amp; Roles (RBAC)
          <SimulatedBadge />
        </CardTitle>
        <span className="inline-flex items-center gap-1 rounded-pill bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {SSO_NOTE_TH}
        </span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-xs font-semibold uppercase text-on-surface-variant">
                <th className="px-4 py-3">ชื่อผู้ใช้</th>
                <th className="px-4 py-3">อีเมล</th>
                <th className="px-4 py-3">บทบาท</th>
                <th className="px-4 py-3">เข้าใช้ล่าสุด</th>
                <th className="px-4 py-3 text-right">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((user) => (
                <UserRow key={user.email} user={user} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
