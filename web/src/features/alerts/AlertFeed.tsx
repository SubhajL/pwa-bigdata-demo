import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { FEED_FILTERS, SEVERITY_META, type AlertItem, type FeedFilterId } from "./alerts.config";

export interface AlertFeedProps {
  readonly filter: FeedFilterId;
  readonly onFilterChange: (id: FeedFilterId) => void;
  readonly alerts: readonly AlertItem[];
  readonly onAcknowledge: (id: string) => void;
}

/** One alert row: a severity accent border + a severity tag (icon + label), the alert text, its
 *  source/time, tag chips, and a real "รับทราบ" (acknowledge) action. */
function AlertCard({ alert, onAcknowledge }: { readonly alert: AlertItem; readonly onAcknowledge: (id: string) => void }): JSX.Element {
  const sev = SEVERITY_META[alert.severity];
  return (
    <li data-testid={`alert-${alert.id}`} className={cn("rounded-card border border-l-4 border-outline-variant bg-surface-container-lowest p-4", sev.borderToken)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={cn("flex items-center gap-1 text-xs font-semibold", sev.textToken)}>
            <sev.icon className="h-4 w-4" aria-hidden="true" /> {sev.labelTh}
          </span>
          <span className="font-semibold text-on-surface">{alert.title}</span>
          <span className="text-sm text-on-surface-variant">{alert.detail}</span>
          <span className="text-xs text-on-surface-variant">
            แหล่ง: {alert.source} · {alert.timeAgoTh} · ระดับ: {alert.tags.join(" + ")}
          </span>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={() => onAcknowledge(alert.id)}>
          รับทราบ
        </Button>
      </div>
    </li>
  );
}

/**
 * The S7 "รายการแจ้งเตือน" feed. The severity filter is a real `role="radiogroup"` that drives the
 * list; "รับทราบ" removes an alert and updates the summary counts — genuine actions, not dead chrome.
 */
export function AlertFeed({ filter, onFilterChange, alerts, onAcknowledge }: AlertFeedProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">รายการแจ้งเตือน · Alert Feed</CardTitle>
        <div role="radiogroup" aria-label="กรองตามความรุนแรง" className="flex gap-2">
          {FEED_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === filter}
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "rounded-pill border px-3 py-1 text-sm transition-colors duration-[var(--anim-fast)] ease-standard",
                f.id === filter ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant hover:border-primary",
              )}
            >
              {f.labelTh}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p data-testid="alert-feed-empty" className="py-8 text-center text-sm text-on-surface-variant">
            ไม่มีการแจ้งเตือนที่ตรงกับตัวกรอง
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onAcknowledge={onAcknowledge} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
