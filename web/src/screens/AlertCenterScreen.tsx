import { useState } from "react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { AlertFeed } from "@/features/alerts/AlertFeed";
import { AlertSidebar } from "@/features/alerts/AlertSidebar";
import { AlertSummary } from "@/features/alerts/AlertSummary";
import { ALERT_RULES, type FeedFilterId } from "@/features/alerts/alerts.config";
import { activeAlerts, deriveCounts } from "@/features/alerts/alertsModel";

const DEFAULT_RULES = new Set(ALERT_RULES.filter((r) => r.defaultOn).map((r) => r.id));

/**
 * Alert Center (Stitch S7, PR-15) — a proposal-narrative screen. The feed, counts, rules and channels
 * are SIMULATED (badged), but the interactions are real: acknowledging an alert removes it and moves
 * the summary counts, the severity filter drives the feed, and the rule switches toggle. The `<h1>`
 * renders synchronously carrying the nav label ("ศูนย์แจ้งเตือน") for router T4.
 */
export function AlertCenterScreen(): JSX.Element {
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<FeedFilterId>("all");
  const [enabledRules, setEnabledRules] = useState<ReadonlySet<string>>(DEFAULT_RULES);

  const counts = deriveCounts(acknowledged);
  const alerts = activeAlerts(acknowledged, filter);

  const acknowledge = (id: string): void => setAcknowledged((prev) => new Set(prev).add(id));

  const toggleRule = (id: string): void => {
    setEnabledRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="alert-center">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-on-surface">ศูนย์แจ้งเตือน · Alert Center</h1>
        <SimulatedBadge />
      </div>
      <AlertSummary counts={counts} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <AlertFeed filter={filter} onFilterChange={setFilter} alerts={alerts} onAcknowledge={acknowledge} />
        </div>
        <div className="lg:col-span-4">
          <AlertSidebar enabledRules={enabledRules} onToggleRule={toggleRule} />
        </div>
      </div>
      <footer className="flex items-center gap-2 text-sm text-on-surface-variant">
        <SimulatedBadge /> รายการแจ้งเตือน จำนวน กฎ และช่องทาง เป็นข้อมูลจำลองเพื่อการสาธิต — ไม่ใช่การแจ้งเตือนจริงของ กปภ.
      </footer>
    </div>
  );
}
