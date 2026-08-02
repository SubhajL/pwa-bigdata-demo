/**
 * Unit contract for the theme override (Phase 2 — light/dark toggle).
 *
 * The app follows the OS by default (globals.css `:root { color-scheme: light dark }`).
 * These functions let a user PIN a scheme: an explicit choice is persisted and stamped on
 * <html> as `data-theme`, which flips every `light-dark()` token without redefining one.
 *
 * The jsdom env stubs `matchMedia` to report light (test-setup.ts); tests that need the
 * dark branch override it locally.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  THEME_STORAGE_KEY,
  applyTheme,
  osPrefersDark,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from "./theme";

function mockPrefersDark(matches: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("theme storage", () => {
  it("returns null when nothing is stored (the user follows the OS)", () => {
    expect(readStoredTheme()).toBeNull();
  });

  it("round-trips an explicit choice through localStorage", () => {
    storeTheme("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("ignores a corrupt stored value rather than pinning a bogus scheme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    expect(readStoredTheme()).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("prefers an explicit stored choice over the OS preference", () => {
    mockPrefersDark(true);
    storeTheme("light");
    expect(resolveTheme()).toBe("light");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    mockPrefersDark(true);
    expect(resolveTheme()).toBe("dark");
    mockPrefersDark(false);
    expect(resolveTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("stamps data-theme on the document element", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("osPrefersDark", () => {
  it("reflects the prefers-color-scheme media query", () => {
    mockPrefersDark(true);
    expect(osPrefersDark()).toBe(true);
    mockPrefersDark(false);
    expect(osPrefersDark()).toBe(false);
  });
});

describe("pre-hydration script (index.html) stays coupled to this module", () => {
  // The inline FOUC script cannot import THEME_STORAGE_KEY, so it duplicates the literal.
  // Assert the two agree, or a rename of one side silently breaks persistence / first paint.
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

  it("reads the SAME storage key that lib/theme writes", () => {
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
  });

  it("stamps data-theme on the document element, matching applyTheme's mechanism", () => {
    expect(html).toMatch(/setAttribute\("data-theme"/);
  });
});
