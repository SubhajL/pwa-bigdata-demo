/**
 * Pure derivations for the Alert Center. Kept out of the components so the acknowledge accounting and
 * the feed filter are unit-testable without a DOM.
 */
import {
  ALERTS,
  BASE_COUNTS,
  type AlertItem,
  type AlertSeverity,
  type FeedFilterId,
} from "./alerts.config";

export type AlertCounts = Record<AlertSeverity | "acknowledged", number>;

/**
 * Counts shown in the summary tiles. Acknowledging a FEED alert moves it from its severity bucket
 * into "acknowledged", so the tiles react to the acknowledge action (the aggregate BASE_COUNTS stand
 * in for the many alerts not shown in the sampled feed).
 */
export function deriveCounts(acknowledgedIds: ReadonlySet<string>): AlertCounts {
  const counts: AlertCounts = { ...BASE_COUNTS };
  for (const alert of ALERTS) {
    if (!acknowledgedIds.has(alert.id)) continue;
    counts[alert.severity] = Math.max(0, counts[alert.severity] - 1);
    counts.acknowledged += 1;
  }
  return counts;
}

/** The active (non-acknowledged) feed alerts matching the severity filter. */
export function activeAlerts(
  acknowledgedIds: ReadonlySet<string>,
  filter: FeedFilterId,
): readonly AlertItem[] {
  return ALERTS.filter(
    (a) => !acknowledgedIds.has(a.id) && (filter === "all" || a.severity === filter),
  );
}
