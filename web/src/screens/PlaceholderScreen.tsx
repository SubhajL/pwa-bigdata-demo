import type { NavItem } from "@/routes/nav";

import { StatusChip } from "@/components/StatusChip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PlaceholderScreenProps {
  readonly item: NavItem;
}

/**
 * The honest not-built-yet screen.
 *
 * Every route in PR-6 lands here. The point is that an unbuilt screen must be
 * unmistakably unbuilt: an empty shell reads like a data-loading failure, and a screen of
 * plausible-looking placeholder numbers would be a fabricated KPI, which CLAUDE.md
 * forbids outright.
 *
 * MUST render:
 *  - an `<h1>` carrying the item's Thai label (the router test finds the screen by it);
 *  - a `StatusChip kind="nodata"` — literally true, and the component's runtime consumer
 *    in this PR;
 *  - the Thai sentence "หน้าจอนี้ยังไม่ได้พัฒนา" plus the owning PR and the Stitch screen
 *    key, so a reader knows what is coming and where its design lives;
 *  - NO numbers, real or invented, and therefore no SimulatedBadge — the badge
 *    is an honesty control for synthetic VALUES, and a placeholder shows none.
 */
export function PlaceholderScreen({ item }: PlaceholderScreenProps): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-on-surface">{item.labelTh}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            <StatusChip kind="nodata" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-on-surface-variant">
            หน้าจอนี้ยังไม่ได้พัฒนา — {item.ownedBy} (Stitch {item.screen})
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
