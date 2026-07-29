import { createBrowserRouter } from "react-router-dom";

import { buildRoutes } from "@/routes/routes";
import { NAV_ITEMS, type NavItem } from "@/routes/nav";

/**
 * The browser router the app mounts. Created per call rather than exported as a module
 * singleton so importing this module has no side effect on history.
 */
export function createAppRouter(items: readonly NavItem[] = NAV_ITEMS) {
  return createBrowserRouter(buildRoutes(items));
}
