import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { nationalHref, regionLabelTh } from "./regional.config";

export interface RegionBreadcrumbProps {
  readonly region: number;
  readonly month: string;
}

/**
 * The drill breadcrumb (INTERACTIONS.md §Drill-down: "Breadcrumb is the only way back up… each
 * crumb is a link except the last"). National links back with the month PRESERVED; the current
 * region is plain text.
 */
export function RegionBreadcrumb({ region, month }: RegionBreadcrumbProps): JSX.Element {
  return (
    <nav aria-label="เส้นทางนำทาง" className="flex items-center gap-1 text-dense text-on-surface-variant">
      <Link
        to={nationalHref(month)}
        className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        ภาพรวมประเทศ
      </Link>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
      <span aria-current="page" className="text-on-surface">{regionLabelTh(region)}</span>
    </nav>
  );
}
