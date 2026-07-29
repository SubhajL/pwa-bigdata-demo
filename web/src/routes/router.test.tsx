/**
 * T3 / T4 — the sidebar and the router cannot drift (DREP-PR6 R6, R7).
 *
 * Built over the REAL route tree with a memory router, so the thing under test is the
 * thing that ships. Mocking react-router here would only assert what we believe
 * react-router does.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RouterProvider, createMemoryRouter, matchRoutes } from "react-router-dom";

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

describe("T3 — registry ↔ router", () => {
  it("has unique paths in the registry", () => {
    // Set equality alone would silently collapse a duplicate; this fails loudly instead.
    const paths = NAV_ITEMS.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("registers a matching route for every registry path", () => {
    const routes = buildRoutes();
    for (const item of NAV_ITEMS) {
      // matchRoutes proves real router matching, not string equality against a list.
      const matched = matchRoutes(routes, item.path);
      expect(matched, `no route matches ${item.path}`).not.toBeNull();
      // The last match must be a concrete leaf, not the catch-all.
      const leaf = matched![matched!.length - 1];
      expect(leaf.route.path, `${item.path} fell through to the catch-all`).not.toBe("*");
    }
  });

  it("exposes no navigable leaf route that is absent from the registry", () => {
    const children = buildRoutes()[0].children ?? [];
    const leafPaths = children
      .filter((r) => r.path !== undefined && r.path !== "*")
      .map((r) => `/${r.path}`);
    const registryPaths = new Set(NAV_ITEMS.map((i) => i.path));
    const orphans = leafPaths.filter((p) => !registryPaths.has(p));
    expect(orphans, `routes unreachable from the sidebar: ${orphans}`).toEqual([]);
  });

  it("covers all ten designed screens", () => {
    // Guards against the registry being trimmed to whatever happens to be built.
    expect(NAV_ITEMS).toHaveLength(10);
    expect(new Set(NAV_ITEMS.map((i) => i.screen)).size).toBe(10);
  });
});

describe("T4 — navigating to each path renders that screen inside the shell", () => {
  it.each(NAV_ITEMS.map((i) => [i.path, i.labelTh] as const))(
    "%s renders %s in main, at that URL, with its link current",
    (path, labelTh) => {
      const router = createMemoryRouter(buildRoutes(), { initialEntries: [path] });
      render(<RouterProvider router={router} />);

      // The URL actually is what we asked for — a heading alone could come from a shell
      // that ignored the route entirely.
      expect(router.state.location.pathname).toBe(path);

      // The screen's heading is inside <main>, not merely somewhere on the page.
      const main = screen.getByRole("main");
      expect(within(main).getByRole("heading", { name: new RegExp(labelTh) })).toBeInTheDocument();

      // Exactly one current link, and it points where we are.
      const current = screen.getAllByRole("link", { current: "page" });
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute("href", path);
    },
  );

  it("redirects the index route to the first registry entry", async () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    // Router initialisation (and therefore the index loader's redirect) resolves off the
    // first tick, so a synchronous read here sees "/" and the assertion is simply early.
    await waitFor(() => expect(router.state.location.pathname).toBe(NAV_ITEMS[0].path));
  });

  it("renders the not-found screen for an unknown path, not a blank page", () => {
    const router = createMemoryRouter(buildRoutes(), { initialEntries: ["/no-such-screen"] });
    render(<RouterProvider router={router} />);
    const main = screen.getByRole("main");
    // INTERACTIONS.md forbids a bare "404": what happened, why, how to fix.
    expect(within(main).getByRole("heading")).toBeInTheDocument();
    expect(main.textContent?.trim().length ?? 0).toBeGreaterThan(20);
  });

  it("marks exactly one item current — not every item", () => {
    // The classic bug: a prefix match makes "/" active on every route at once.
    const router = createMemoryRouter(buildRoutes(), { initialEntries: [NAV_ITEMS[3].path] });
    render(<RouterProvider router={router} />);
    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
  });
});
