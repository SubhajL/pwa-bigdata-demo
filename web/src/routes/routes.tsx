/**
 * Pure route objects — deliberately NOT a router instance.
 *
 * `createBrowserRouter` binds to the DOM History, which a test cannot drive and which
 * leaks navigation state between cases when the router is a module singleton. Keeping the
 * route TREE separate lets `router.test.tsx` build a `createMemoryRouter` over the very
 * same tree the browser uses, so the thing under test is the thing that ships.
 */
import { Navigate, type RouteObject } from "react-router-dom";

import { AppShell } from "@/components/AppShell";
import { NotFoundScreen } from "@/screens/NotFoundScreen";
import { PlaceholderScreen } from "@/screens/PlaceholderScreen";
import { NAV_ITEMS, type NavItem } from "@/routes/nav";

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
        ...items.map((item) => ({
          path: item.path.replace(/^\//, ""),
          // Every entry currently routes to the placeholder. As each screen PR lands it
          // replaces this element and flips `built` in the registry.
          element: <PlaceholderScreen item={item} />,
        })),
        { path: "*", element: <NotFoundScreen /> },
      ],
    },
  ];
}
