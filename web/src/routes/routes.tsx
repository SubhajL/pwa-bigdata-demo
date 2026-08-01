/**
 * Pure route objects — deliberately NOT a router instance.
 *
 * `createBrowserRouter` binds to the DOM History, which a test cannot drive and which
 * leaks navigation state between cases when the router is a module singleton. Keeping the
 * route TREE separate lets `router.test.tsx` build a `createMemoryRouter` over the very
 * same tree the browser uses, so the thing under test is the thing that ships.
 */
import { Navigate, type RouteObject } from "react-router-dom";

import type { ComponentType } from "react";

import { AppShell } from "@/components/AppShell";
import { BranchScreen } from "@/screens/BranchScreen";
import { AlertCenterScreen } from "@/screens/AlertCenterScreen";
import { NationalExecutiveScreen } from "@/screens/NationalExecutiveScreen";
import { NotFoundScreen } from "@/screens/NotFoundScreen";
import { OperationsTwinScreen } from "@/screens/OperationsTwinScreen";
import { PipelineMonitorScreen } from "@/screens/PipelineMonitorScreen";
import { PlaceholderScreen } from "@/screens/PlaceholderScreen";
import { PredictiveAnalyticsScreen } from "@/screens/PredictiveAnalyticsScreen";
import { RegionalScreen } from "@/screens/RegionalScreen";
import { ReportCenterScreen } from "@/screens/ReportCenterScreen";
import { SystemAdminScreen } from "@/screens/SystemAdminScreen";
import { NAV_ITEMS, type NavItem } from "@/routes/nav";

/**
 * The real screen for each BUILT nav item, keyed by its id. An unbuilt item (absent here, or
 * `built: false`) falls back to `PlaceholderScreen` — so `NAV_ITEMS` stays the single registry
 * and a screen PR wires itself by adding one entry and flipping `built`.
 */
const SCREENS: Readonly<Record<string, ComponentType>> = {
  national: NationalExecutiveScreen,
  regional: RegionalScreen,
  branch: BranchScreen,
  operations: OperationsTwinScreen,
  pipeline: PipelineMonitorScreen,
  predictive: PredictiveAnalyticsScreen,
  admin: SystemAdminScreen,
  reports: ReportCenterScreen,
  alerts: AlertCenterScreen,
};

/**
 * Build the route tree from the SAME registry the sidebar renders.
 *
 * @param items registry to build from; injectable so a test can prove the mapping rather
 *   than re-declare it.
 * @returns a single shell route whose children are one route per registry entry, an index
 *   redirect to the first entry, and a catch-all.
 */
export function buildRoutes(items: readonly NavItem[] = NAV_ITEMS): RouteObject[] {
  return [
    {
      path: "/",
      element: <AppShell />,
      children: [
        // `<Navigate/>` rather than a `loader: () => redirect(...)`. The loader form is
        // tidier in principle — it resolves before anything renders — but in a v7 data
        // router a leaf with only a loader and no element warns ("does not have an element
        // or Component") and needs a `HydrateFallback` to cover initial hydration. That is
        // more moving parts than an index redirect is worth; `<Navigate/>` costs one
        // effect tick and nothing else.
        { index: true, element: <Navigate to={items[0].path} replace /> },
        ...items.map((item) => {
          const Built = item.built ? SCREENS[item.id] : undefined;
          return {
            path: item.path.replace(/^\//, ""),
            // A built item renders its real screen; everything else renders the honest
            // "not built yet" placeholder.
            element: Built ? <Built /> : <PlaceholderScreen item={item} />,
          };
        }),
        { path: "*", element: <NotFoundScreen /> },
      ],
    },
  ];
}
