/**
 * T10 — axe finds nothing, run against the DOCUMENT (DREP-PR6 R11).
 *
 * WHAT THIS COVERS AND WHAT IT DOES NOT — stated rather than implied:
 *
 * axe under jsdom is STRUCTURAL. jsdom computes no layout and applies no stylesheet, so
 * the colour-contrast rule cannot run, the CSS-selected colour scheme is invisible to it,
 * and focus-ring visibility and font fallback are unobservable. What it does catch is
 * exactly what tends to rot: missing labels, bad roles, orphaned form controls, heading
 * order, and a missing document language.
 *
 * Contrast is covered instead by `tokens.test.ts` plus the CVD-validated palette recorded
 * in design/tokens.map.md. Everything requiring a real rendering engine belongs to PR-17,
 * which owns the Playwright pass.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import axe from "axe-core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

import { NAV_ITEMS } from "@/routes/nav";
import { buildRoutes } from "@/routes/routes";

afterEach(cleanup);

async function violationsAt(path: string): Promise<axe.Result[]> {
  render(<RouterProvider router={createMemoryRouter(buildRoutes(), { initialEntries: [path] })} />);
  // Run against the whole document, NOT a detached container: a container-scoped run
  // cannot see document-level rules such as `html[lang]`.
  const results = await axe.run(document, {
    resultTypes: ["violations"],
    // Disabled explicitly rather than left to fail silently — jsdom paints nothing, so a
    // contrast result here would be meaningless either way.
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations;
}

describe("T10 — accessibility", () => {
  it("keeps lang=\"th\" on the document element", () => {
    // Selects Thai line-breaking and tells a screen reader which language to speak.
    // Asserted against the real index.html so an edit to <head> cannot silently drop it.
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    expect(html).toMatch(/<html[^>]*\blang="th"/);
  });

  it("declares the document opts into both colour schemes", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    expect(html).toMatch(/<meta[^>]*name="color-scheme"[^>]*content="light dark"/);
  });

  it.each(NAV_ITEMS.map((i) => [i.path] as const))(
    "%s has no structural axe violations",
    async (path) => {
      const violations = await violationsAt(path);
      const summary = violations.map((v) => `${v.id}: ${v.help}`).join("\n");
      expect(violations, summary).toHaveLength(0);
    },
  );
});
