import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { nationalHref, regionHref, regionLabelTh } from "./branch.config";

export interface BranchBreadcrumbProps {
  readonly region: number;
  readonly branch: string;
  readonly month: string;
}

/** Three-level drill breadcrumb (INTERACTIONS.md): national → region → this branch, each crumb a
 *  link except the last, all preserving the sticky month. */
export function BranchBreadcrumb({ region, branch, month }: BranchBreadcrumbProps): JSX.Element {
  const crumbClass =
    "rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  return (
    <nav aria-label="เส้นทางนำทาง" className="flex items-center gap-1 text-dense text-on-surface-variant">
      <Link to={nationalHref(month)} className={crumbClass}>
        ภาพรวมประเทศ
      </Link>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
      <Link to={regionHref(region, month)} className={crumbClass}>
        {regionLabelTh(region)}
      </Link>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
      <span aria-current="page" className="text-on-surface">{branch}</span>
    </nav>
  );
}
